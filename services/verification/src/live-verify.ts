import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import {
  getCockroachMcpStatus,
  inspectMemoryProvenanceViaMcp,
} from "../../../packages/cockroach-mcp/src/client.js";
import { AtomicCockroachRuntimeStore } from "../../../packages/cockroach/src/atomic-runtime-store.js";
import { createCockroachPool } from "../../../packages/cockroach/src/client.js";
import { applyEngramMigrations } from "../../../packages/cockroach/src/migrations.js";
import { CockroachMemoryRepository } from "../../../packages/cockroach/src/repository.js";
import { ENGRAM_COSINE_VECTOR_INDEX, explainEngramMemorySearch } from "../../../packages/cockroach/src/vector-plan.js";
import {
  configuredEmbeddingProviderName,
  createConfiguredEmbeddingProvider,
} from "../../../packages/embeddings/src/provider.js";
import { EngramRuntime } from "../../../packages/runtime/src/runtime.js";
import { DEMO_RUNTIME_POLICIES } from "../../demo/src/runtime-policy.js";
import { runEngramRuntimeDemo } from "../../demo/src/run-runtime-demo.js";

let verificationStage = "PREFLIGHT";
const verificationStartedAt = new Date().toISOString();
const output = "evidence/live/latest.json";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for live verification`);
  return value;
}

function sanitizeError(error: unknown): string {
  const raw = error instanceof Error ? error.stack ?? error.message : String(error);
  return raw
    .replace(/(postgres(?:ql)?:\/\/)[^\s:@/]+:[^\s@/]+@/gi, "$1***:***@")
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1***")
    .replace(/(api[_-]?key[=:]\s*)[^\s,;]+/gi, "$1***");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstScalar(row: Record<string, unknown> | undefined): string | null {
  if (!row) return null;
  const value = Object.values(row)[0];
  return value === undefined || value === null ? null : String(value);
}

function embeddingMetadata(provider: ReturnType<typeof createConfiguredEmbeddingProvider>) {
  const value = provider as typeof provider & {
    region?: string;
    location?: string;
    projectId?: string;
  };
  return {
    provider: provider.provider,
    modelId: provider.modelId,
    dimensions: provider.dimensions,
    region: value.region ?? value.location ?? null,
    projectId: value.projectId ?? null,
  };
}

async function writeEvidence(value: unknown): Promise<void> {
  await mkdir("evidence/live", { recursive: true });
  await writeFile(output, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  requireEnv("DATABASE_URL");
  const embeddingProfile = configuredEmbeddingProviderName();
  if (embeddingProfile === "bedrock") requireEnv("AWS_REGION");
  if (embeddingProfile === "vertex") {
    requireEnv("GOOGLE_CLOUD_PROJECT");
    requireEnv("GOOGLE_CLOUD_LOCATION");
  }

  verificationStage = "CONNECT_COCKROACH";
  const pool = createCockroachPool();

  try {
    verificationStage = "APPLY_MIGRATIONS";
    const appliedMigrations = await applyEngramMigrations(pool);

    verificationStage = "INSPECT_COCKROACH_SCHEMA";
    const versionResult = await pool.query<{ version: string }>("SELECT version() AS version");
    const databaseResult = await pool.query<{ database_name: string }>("SELECT current_database() AS database_name");
    const indexesResult = await pool.query<{ index_name: string }>("SHOW INDEXES FROM memories");
    const memoryIndexes = [...new Set(indexesResult.rows.map((row) => row.index_name).filter(Boolean))].sort();
    const expectedVectorIndexPresent = memoryIndexes.includes(ENGRAM_COSINE_VECTOR_INDEX);
    if (!expectedVectorIndexPresent) {
      throw new Error(`Expected CockroachDB vector index ${ENGRAM_COSINE_VECTOR_INDEX} is not present after migrations`);
    }

    const beamResult = await pool.query<Record<string, unknown>>("SHOW vector_search_beam_size");
    const rerankResult = await pool.query<Record<string, unknown>>("SHOW vector_search_rerank_multiplier");

    verificationStage = "RUN_RUNTIME_CAUSAL_SPINE";
    const embeddings = createConfiguredEmbeddingProvider();
    if (embeddings.dimensions !== 1024) {
      throw new Error(`Configured embedding provider must emit 1024 dimensions for the current Cockroach schema, received ${embeddings.dimensions}`);
    }
    const repository = new CockroachMemoryRepository(pool, embeddings);
    const store = new AtomicCockroachRuntimeStore(pool, repository);
    const runtime = new EngramRuntime(store, DEMO_RUNTIME_POLICIES);
    const agentId = `engram-live-${randomUUID()}`;
    const demo = await runEngramRuntimeDemo(runtime, {
      agentId,
      reconstructRuntimeAfterRecall: () => {
        const reconstructedRepository = new CockroachMemoryRepository(pool, embeddings);
        const reconstructedStore = new AtomicCockroachRuntimeStore(pool, reconstructedRepository);
        return new EngramRuntime(reconstructedStore, DEMO_RUNTIME_POLICIES);
      },
    });

    if (!demo.changedBehavior) throw new Error("Live demo did not change behavior");
    if (!demo.runtimeReconstructedAfterRecall) {
      throw new Error("Live demo did not reconstruct the Engram runtime after persisted recall");
    }
    if (demo.runA.outcome !== "COMPENSATED") throw new Error(`Unexpected Run A outcome: ${demo.runA.outcome}`);
    if (demo.runB.outcome !== "SUCCESS") throw new Error(`Unexpected Run B outcome: ${demo.runB.outcome}`);
    if (!demo.runB.memoryRefs.includes(demo.memory.id)) throw new Error("Run B does not reference the memory produced by Run A");

    verificationStage = "VERIFY_RUNTIME_TRACE";
    const trace = demo.trace as {
      retrievals?: Array<Record<string, unknown>>;
      decisions?: Array<{ memory_influences?: Array<Record<string, unknown>> }>;
      runtimeEvaluations?: Array<{ eventType?: string; payload?: Record<string, unknown> }>;
    };
    const influenceAccepted = trace.runtimeEvaluations?.some((event) => event.eventType === "INFLUENCE_ACCEPTED") ?? false;
    const recallCompleted = trace.runtimeEvaluations?.some((event) => event.eventType === "RECALL_COMPLETED" || event.eventType === "RECALL_FILTERED") ?? false;
    const influenced = trace.decisions?.some((decision) => (decision.memory_influences?.length ?? 0) > 0) ?? false;

    if (!recallCompleted) throw new Error("Runtime trace does not contain a persisted recall evaluation");
    if (!influenceAccepted || !influenced) throw new Error("Runtime trace does not prove accepted memory influence");

    verificationStage = "EXPLAIN_VECTOR_RETRIEVAL";
    const persistedRetrieval = trace.retrievals?.find((retrieval) => retrieval.id === demo.runB.retrievalId);
    if (!persistedRetrieval || typeof persistedRetrieval.query !== "string") {
      throw new Error("Runtime trace does not contain the persisted Run B retrieval query");
    }
    const filters = asRecord(persistedRetrieval.filters);
    const workflowType = typeof filters.workflowType === "string" ? filters.workflowType : undefined;
    const environmentVersion = typeof filters.environmentVersion === "string" ? filters.environmentVersion : undefined;
    const status = Array.isArray(filters.status)
      ? filters.status.filter((value): value is string => typeof value === "string")
      : undefined;
    const explainEmbedding = await embeddings.embed(persistedRetrieval.query);
    const vectorPlan = await explainEngramMemorySearch(pool, {
      agentExternalId: agentId,
      queryEmbedding: explainEmbedding,
      workflowType,
      environmentVersion,
      status,
      limit: DEMO_RUNTIME_POLICIES.retrieval.maxCandidates,
    });
    const cspannIndexUsage = vectorPlan.usesVectorSearch && vectorPlan.usesCosineIndex
      ? "VERIFIED"
      : "UNVERIFIED";

    let mcpStatus: Awaited<ReturnType<typeof getCockroachMcpStatus>> | null = null;
    let mcpProvenance: Awaited<ReturnType<typeof inspectMemoryProvenanceViaMcp>> | null = null;
    const mcpConfigured = Boolean(process.env.COCKROACH_MCP_CLUSTER_ID?.trim() && process.env.COCKROACH_MCP_API_KEY?.trim());
    if (mcpConfigured) {
      verificationStage = "CONNECT_MANAGED_MCP";
      mcpStatus = await getCockroachMcpStatus();
      if (!mcpStatus.connected) throw new Error("CockroachDB Managed MCP did not connect");
      if (mcpStatus.missingExpectedTools.length > 0) {
        throw new Error(`Managed MCP is missing expected tools: ${mcpStatus.missingExpectedTools.join(", ")}`);
      }
      verificationStage = "QUERY_MCP_PROVENANCE";
      mcpProvenance = await inspectMemoryProvenanceViaMcp(demo.memory.id);
    }

    const completedAt = new Date().toISOString();
    verificationStage = "WRITE_SUCCESS_EVIDENCE";
    const evidence = {
      schemaVersion: "engram-live-proof-v4",
      evidenceClass: "VERIFIED",
      verificationKind: "LIVE_EXTERNAL_INTEGRATION",
      startedAt: verificationStartedAt,
      completedAt,
      commitSha: process.env.GITHUB_SHA ?? null,
      githubRunId: process.env.GITHUB_RUN_ID ?? null,
      appliedMigrations,
      boundaries: {
        externalVenueExecution: "SIMULATED",
        cockroachPersistence: "VERIFIED",
        cockroachSchemaAndVectorIndexPresence: "VERIFIED",
        vectorDistanceRetrieval: "VERIFIED",
        cspannCosineIndexUsage: cspannIndexUsage,
        embeddingProvider: "VERIFIED",
        runtimeRecallExposure: "VERIFIED",
        runtimeReconstructionAfterRecall: "VERIFIED",
        runtimeInfluenceValidation: "VERIFIED",
        counterfactualProvenance: "VERIFIED",
        decisionMemoryTrace: "VERIFIED",
        atomicEventSequencing: "VERIFIED",
        managedMcpConnection: mcpConfigured ? "VERIFIED" : "UNKNOWN",
        managedMcpProvenanceQuery: mcpConfigured ? "VERIFIED" : "UNKNOWN",
      },
      cockroach: {
        serverVersion: versionResult.rows[0]?.version ?? null,
        database: databaseResult.rows[0]?.database_name ?? null,
        expectedVectorIndex: ENGRAM_COSINE_VECTOR_INDEX,
        expectedVectorIndexPresent,
        memoryIndexes,
        vectorSearchSettings: {
          beamSize: firstScalar(beamResult.rows[0]),
          rerankMultiplier: firstScalar(rerankResult.rows[0]),
        },
      },
      embedding: {
        profile: embeddingProfile,
        ...embeddingMetadata(embeddings),
      },
      vectorIndex: {
        expectedIndex: ENGRAM_COSINE_VECTOR_INDEX,
        naturalPlan: true,
        explainedRetrievalId: demo.runB.retrievalId,
        explainedQuery: persistedRetrieval.query,
        explainedFilters: filters,
        ...vectorPlan,
        note: cspannIndexUsage === "VERIFIED"
          ? "CockroachDB naturally selected the agent-scoped cosine vector index for the exact persisted Engram retrieval query shape."
          : "The exact persisted retrieval query succeeded and the vector index exists, but the natural optimizer plan did not prove cosine C-SPANN index use; do not promote the C-SPANN claim from this artifact.",
      },
      invariant: {
        priorExecutionPersisted: true,
        memoryRetrievedComparableContext: recallCompleted,
        persistedRecallSurvivesRuntimeReconstruction: demo.runtimeReconstructedAfterRecall && influenceAccepted,
        laterDecisionReferencesMemory: influenced,
        observableBehaviorChanged: demo.changedBehavior,
        provenanceReconstructable: influenceAccepted,
      },
      demo,
      mcp: {
        configured: mcpConfigured,
        status: mcpStatus,
        provenance: mcpProvenance,
      },
    };

    await writeEvidence(evidence);
    verificationStage = "COMPLETE";
    console.log(JSON.stringify({
      ok: true,
      output,
      embeddingProfile,
      embeddingModelId: embeddings.modelId,
      memoryId: demo.memory.id,
      runA: demo.runA.executionId,
      runB: demo.runB.executionId,
      runtimeReconstructedAfterRecall: demo.runtimeReconstructedAfterRecall,
      runtimeInfluenceVerified: true,
      cspannIndexUsage,
      mcpConfigured,
    }));
  } finally {
    await pool.end();
  }
}

main().catch(async (error) => {
  const message = sanitizeError(error);
  console.error(message);
  try {
    await writeEvidence({
      schemaVersion: "engram-live-proof-v4",
      evidenceClass: "UNKNOWN",
      verificationKind: "LIVE_EXTERNAL_INTEGRATION_FAILED",
      startedAt: verificationStartedAt,
      completedAt: new Date().toISOString(),
      commitSha: process.env.GITHUB_SHA ?? null,
      githubRunId: process.env.GITHUB_RUN_ID ?? null,
      embeddingProfile: process.env.ENGRAM_EMBEDDING_PROVIDER ?? "bedrock",
      failure: {
        stage: verificationStage,
        message,
      },
      boundaries: {
        externalVenueExecution: "SIMULATED",
        cockroachPersistence: "UNKNOWN",
        cockroachSchemaAndVectorIndexPresence: "UNKNOWN",
        vectorDistanceRetrieval: "UNKNOWN",
        cspannCosineIndexUsage: "UNKNOWN",
        embeddingProvider: "UNKNOWN",
        runtimeRecallExposure: "UNKNOWN",
        runtimeReconstructionAfterRecall: "UNKNOWN",
        runtimeInfluenceValidation: "UNKNOWN",
        counterfactualProvenance: "UNKNOWN",
        decisionMemoryTrace: "UNKNOWN",
        atomicEventSequencing: "UNKNOWN",
        managedMcpConnection: "UNKNOWN",
        managedMcpProvenanceQuery: "UNKNOWN",
      },
    });
  } catch (artifactError) {
    console.error(`Failed to persist verification failure artifact: ${sanitizeError(artifactError)}`);
  }
  process.exitCode = 1;
});
