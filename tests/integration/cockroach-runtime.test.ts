import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { EmbeddingProvider, OperationalMemory } from "../../packages/memory-core/src/domain.js";
import { createCockroachPool } from "../../packages/cockroach/src/client.js";
import { applyEngramMigrations } from "../../packages/cockroach/src/migrations.js";
import { CockroachMemoryRepository } from "../../packages/cockroach/src/repository.js";
import { CockroachRuntimeStore } from "../../packages/cockroach/src/runtime-store.js";
import { AtomicCockroachRuntimeStore } from "../../packages/cockroach/src/atomic-runtime-store.js";
import type { EngramRuntimeStore } from "../../packages/runtime/src/store.js";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import { DEFAULT_RUNTIME_POLICIES } from "../../packages/runtime/src/defaults.js";

const live = Boolean(process.env.DATABASE_URL);
const suite = live ? describe : describe.skip;

class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1024;
  async embed(text: string): Promise<number[]> {
    const safeText = text || "engram";
    const vector = Array.from({ length: 1024 }, (_, index) => ((safeText.charCodeAt(index % safeText.length) || 1) % 97) / 97);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    return vector.map((value) => value / norm);
  }
}

suite("Cockroach-backed Engram runtime", () => {
  let pool: pg.Pool;
  let repository: CockroachMemoryRepository;
  let store: CockroachRuntimeStore;

  beforeAll(async () => {
    pool = createCockroachPool();
    await applyEngramMigrations(pool);
    repository = new CockroachMemoryRepository(pool, new DeterministicEmbeddingProvider());
    store = new CockroachRuntimeStore(pool, repository);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("allocates unique contiguous event sequences under concurrent callers", async () => {
    const atomicStore = new AtomicCockroachRuntimeStore(pool, repository);
    const started = await repository.startExecution({
      agentId: `sequence-agent-${randomUUID()}`,
      workflowType: "concurrency-proof",
      intent: "allocate event sequences",
      context: {},
      constraints: {},
    });

    const count = 16;
    const allocated = await Promise.all(
      Array.from({ length: count }, () => atomicStore.nextEventSequence(started.executionId)),
    );

    expect(new Set(allocated).size).toBe(count);
    expect([...allocated].sort((a, b) => a - b)).toEqual(
      Array.from({ length: count }, (_, index) => index),
    );
  });

  it("reloads recalls after cold starts and preserves distinct retrieval-to-decision linkage", async () => {
    const agentId = `runtime-agent-${randomUUID()}`;
    const source = await repository.startExecution({
      agentId,
      workflowType: "deployment",
      intent: "Deploy API",
      context: { service: "api" },
      constraints: {},
      environmentVersion: "prod-v1",
      toolVersion: "1.4.0",
      policyVersion: "agent-policy-v1",
    });
    await repository.recordOutcome({
      id: randomUUID(),
      executionId: source.executionId,
      status: "FAILURE",
      failureType: "DEPENDENCY_UNAVAILABLE",
      summary: "Dependency alpha was unavailable during deployment.",
      result: { dependency: "alpha" },
      evidenceState: "OBSERVED",
    });

    const memory: OperationalMemory = {
      id: randomUUID(),
      agentId,
      memoryType: "UNEXPECTED_FAILURE",
      summary: "Dependency alpha was unavailable during a comparable production deployment.",
      structuredContext: {
        workflowType: "deployment",
        sourceExecutionId: source.executionId,
        failureType: "DEPENDENCY_UNAVAILABLE",
        dependency: "alpha",
      },
      confidence: 0.93,
      evidenceState: "OBSERVED",
      validFrom: new Date(),
      environmentVersion: "prod-v1",
      toolVersion: "1.3.0",
      policyVersion: "engram-admission-v1",
    };
    await repository.persistMemory(memory, [source.executionId]);

    const firstInvocation = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
    const current = await firstInvocation.startExecution({
      agentId,
      workflowType: "deployment",
      intent: "Deploy API",
      context: { service: "api" },
      constraints: {},
      environmentVersion: "prod-v1",
      toolVersion: "1.4.0",
      policyVersion: "agent-policy-v1",
    });

    const firstRecall = await firstInvocation.recall({
      executionId: current.executionId,
      query: "production deployment dependency failures",
      status: ["FAILURE", "COMPENSATED", "PARTIAL"],
    });
    expect(firstRecall.recall.candidates.some((candidate) => candidate.memoryId === memory.id)).toBe(true);

    const secondInvocation = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
    await secondInvocation.recordDecision({
      executionId: current.executionId,
      decisionType: "DEPENDENCY_SELECTION",
      selectedAction: { dependency: "beta" },
      alternatives: [{ dependency: "alpha" }],
      reasoningSummary: "Prior execution memory changed the selected dependency.",
      influences: [{
        memoryId: memory.id,
        retrievalId: firstRecall.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "Comparable dependency failure caused alpha to be replaced by beta.",
        relevance: firstRecall.candidates.find((candidate) => candidate.memory.id === memory.id)?.score,
        counterfactual: {
          action: { dependency: "alpha" },
          source: "APPLICATION_DECLARED",
          evidenceState: "OBSERVED",
          explanation: "The application recorded alpha as the memory-free baseline.",
        },
      }],
    });

    const secondRecall = await secondInvocation.recall({
      executionId: current.executionId,
      query: "dependency alpha production failure history",
      status: ["FAILURE", "COMPENSATED", "PARTIAL"],
    });
    expect(secondRecall.recall.id).not.toBe(firstRecall.recall.id);
    expect(secondRecall.recall.candidates.some((candidate) => candidate.memoryId === memory.id)).toBe(true);

    const thirdInvocation = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
    await thirdInvocation.recordDecision({
      executionId: current.executionId,
      decisionType: "RETRY_POLICY",
      selectedAction: { retry: false },
      alternatives: [{ retry: true }],
      reasoningSummary: "The same prior failure supports keeping retries disabled for alpha.",
      influences: [{
        memoryId: memory.id,
        retrievalId: secondRecall.recall.id,
        influenceType: "SUPPORTED_ACTION",
        summary: "The recalled failure supports the existing no-retry policy.",
        relevance: secondRecall.candidates.find((candidate) => candidate.memory.id === memory.id)?.score,
      }],
    });

    const persistedRecalls = await store.getRecalls(current.executionId);
    expect(persistedRecalls.map((recall) => recall.id)).toEqual(expect.arrayContaining([
      firstRecall.recall.id,
      secondRecall.recall.id,
    ]));

    const runtimeStore: EngramRuntimeStore = store;
    const trace = await runtimeStore.getTrace(current.executionId) as {
      decisions: Array<{
        id: string;
        decision_type: string;
        memory_influences: Array<{ retrieval_id?: string; memory_id?: string; influence_type?: string }>;
      }>;
      retrievals: Array<{ id: string }>;
      runtimeEvaluations?: Array<Record<string, unknown>>;
    };

    expect(trace.retrievals).toHaveLength(2);
    expect(new Set(trace.retrievals.map((retrieval) => retrieval.id))).toEqual(
      new Set([firstRecall.recall.id, secondRecall.recall.id]),
    );
    expect(trace.decisions).toHaveLength(2);

    const dependencyDecision = trace.decisions.find((decision) => decision.decision_type === "DEPENDENCY_SELECTION");
    const retryDecision = trace.decisions.find((decision) => decision.decision_type === "RETRY_POLICY");
    expect(dependencyDecision?.memory_influences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        retrieval_id: firstRecall.recall.id,
        memory_id: memory.id,
        influence_type: "CHANGED_ACTION",
      }),
    ]));
    expect(retryDecision?.memory_influences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        retrieval_id: secondRecall.recall.id,
        memory_id: memory.id,
        influence_type: "SUPPORTED_ACTION",
      }),
    ]));
  });
});
