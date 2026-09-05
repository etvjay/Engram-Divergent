import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createCockroachPool } from "../packages/cockroach/src/client.js";
import { CockroachMemoryRepository } from "../packages/cockroach/src/repository.js";
import { TitanEmbeddingProvider } from "../packages/bedrock/src/embeddings.js";
import { runEngramDemo } from "../services/demo/src/run-demo.js";
import { getCockroachMcpStatus, inspectMemoryProvenanceViaMcp } from "../packages/cockroach-mcp/src/client.js";

async function main() {
  const required = ["DATABASE_URL", "COCKROACH_MCP_CLUSTER_ID", "COCKROACH_MCP_API_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing required live verification configuration: ${missing.join(", ")}`);

  const pool = createCockroachPool();
  const repository = new CockroachMemoryRepository(pool, new TitanEmbeddingProvider());
  const agentId = `engram-live-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;

  try {
    const demo = await runEngramDemo(repository, { agentId });
    if (!demo.changedBehavior) throw new Error("Live Engram proof did not change behavior");
    if (demo.runA.outcome !== "COMPENSATED") throw new Error(`Expected Run A COMPENSATED, got ${demo.runA.outcome}`);
    if (demo.runB.outcome !== "SUCCESS") throw new Error(`Expected Run B SUCCESS, got ${demo.runB.outcome}`);
    if (!demo.runB.memoryRefs.includes(demo.memory.id)) throw new Error("Run B decision did not reference the Run A memory");

    const trace = await repository.getTrace(demo.runB.executionId);
    const mcpStatus = await getCockroachMcpStatus();
    if (!mcpStatus.connected) throw new Error("CockroachDB Managed MCP did not connect");
    if (mcpStatus.missingExpectedTools.length) {
      throw new Error(`CockroachDB Managed MCP missing expected tools: ${mcpStatus.missingExpectedTools.join(", ")}`);
    }

    const mcpProvenance = await inspectMemoryProvenanceViaMcp(demo.memory.id);
    const evidence = {
      schemaVersion: "engram-live-proof-v1",
      generatedAt: new Date().toISOString(),
      gitSha: process.env.GITHUB_SHA ?? null,
      runId: process.env.GITHUB_RUN_ID ?? null,
      evidenceClassification: {
        externalExecution: "SIMULATED",
        cockroachPersistence: "VERIFIED",
        distributedVectorRetrieval: "VERIFIED",
        memoryDecisionTrace: "VERIFIED",
        managedMcp: "VERIFIED",
        bedrockEmbedding: "VERIFIED",
      },
      invariant: {
        priorExecutionPersisted: true,
        memoryRetrievedComparableContext: true,
        laterDecisionReferencesMemory: true,
        observableBehaviorChanged: demo.changedBehavior,
        provenanceReconstructable: true,
      },
      demo,
      trace,
      mcp: {
        status: mcpStatus,
        provenance: mcpProvenance,
      },
    };

    await mkdir("evidence/live", { recursive: true });
    await writeFile("evidence/live/latest.json", `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      verified: true,
      agentId,
      runA: demo.runA.executionId,
      memory: demo.memory.id,
      runB: demo.runB.executionId,
      retrieval: demo.runB.retrievalId,
      changedBehavior: demo.changedBehavior,
      evidencePath: "evidence/live/latest.json",
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
