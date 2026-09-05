import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MemoryRecall } from "../../packages/core/src/protocol.js";
import type {
  ExecutionContext,
  ExecutionEvent,
  MemorySearchInput,
  OperationalMemory,
  Outcome,
} from "../../packages/memory-core/src/domain.js";
import { DEFAULT_RUNTIME_POLICIES } from "../../packages/runtime/src/defaults.js";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import type { EngramRuntimeStore } from "../../packages/runtime/src/store.js";
import type {
  RecallExposureUpdate,
  RuntimeDecisionRecord,
  RuntimeEvaluationEvent,
  RuntimeExecutionRecord,
} from "../../packages/runtime/src/types.js";

class IsolationStore implements EngramRuntimeStore {
  readonly retrievalId = randomUUID();
  readonly recalls: MemoryRecall[] = [];
  readonly exposureUpdates: RecallExposureUpdate[] = [];
  readonly evaluations: RuntimeEvaluationEvent[] = [];
  readonly decisions: RuntimeDecisionRecord[] = [];

  constructor(
    readonly current: RuntimeExecutionRecord,
    readonly memory: OperationalMemory,
  ) {}

  async startExecution(_input: ExecutionContext) { return { executionId: this.current.id }; }
  async getExecution(executionId: string) {
    if (executionId === this.current.id) return this.current;
    return null;
  }
  async appendEvent(_event: ExecutionEvent) {}
  async recordOutcome(_outcome: Outcome) {}
  async persistMemory(_memory: OperationalMemory, _sourceExecutionIds: string[]) {}
  async getMemory(memoryId: string) { return memoryId === this.memory.id ? this.memory : null; }
  async getRecalls(executionId: string) { return this.recalls.filter((recall) => recall.executionId === executionId); }
  async recordRuntimeDecision(decision: RuntimeDecisionRecord) { this.decisions.push(decision); }
  async appendRuntimeEvaluationEvent(event: RuntimeEvaluationEvent) { this.evaluations.push(event); }
  async getTrace(_executionId: string) { return { events: [] }; }

  async searchMemory(_input: MemorySearchInput) {
    return {
      retrievalId: this.retrievalId,
      candidates: [{
        memoryId: this.memory.id,
        memory: this.memory,
        semanticScore: 0.99,
        contextScore: 0.99,
        outcomeScore: 1,
        confidenceScore: this.memory.confidence,
        recencyScore: 1,
        finalScore: 0.99,
        rank: 1,
      }],
    };
  }

  async updateRecallExposure(update: RecallExposureUpdate) {
    const memoryStateById = new Map(update.exposedMemoryStates.map((state) => [state.memoryId, state.memoryStateDigest]));
    this.exposureUpdates.push(update);
    this.recalls.push({
      id: update.retrievalId,
      executionId: this.current.id,
      query: "prior deployment memory",
      policyVersion: DEFAULT_RUNTIME_POLICIES.retrieval.policyVersion,
      recalledAt: new Date(),
      candidates: update.exposedMemoryIds.map((memoryId, index) => ({
        retrievalId: update.retrievalId,
        memoryId,
        memoryStateDigest: memoryStateById.get(memoryId),
        rank: index + 1,
        score: 0.99,
      })),
    });
  }
}

function execution(agentId: string): RuntimeExecutionRecord {
  return {
    id: randomUUID(),
    agentId,
    workflowType: "deployment",
    intent: "deploy release",
    context: { service: "checkout" },
    constraints: {},
    environmentVersion: "prod-v2",
    toolVersion: "2.4.0",
    status: "RUNNING",
    startedAt: new Date("2026-08-16T00:00:00Z"),
  };
}

function memory(agentId: string): OperationalMemory {
  return {
    id: randomUUID(),
    agentId,
    memoryType: "SUCCESSFUL_RECOVERY",
    summary: "Use staged rollout for this service class.",
    structuredContext: { workflowType: "deployment" },
    confidence: 0.96,
    evidenceState: "OBSERVED",
    validFrom: new Date("2026-08-15T00:00:00Z"),
    environmentVersion: "prod-v2",
    toolVersion: "2.4.0",
  };
}

describe("EXP-016 runtime agent isolation authority", () => {
  it("rejects a foreign-agent memory even if a mis-scoped store returns it as the top candidate", async () => {
    const current = execution("agent-a");
    const foreign = memory("agent-b");
    const store = new IsolationStore(current, foreign);
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const recall = await runtime.recall({ executionId: current.id, query: "prior deployment memory" });

    expect(recall.candidates).toEqual([]);
    expect(recall.rejected).toEqual([{ memoryId: foreign.id, reasons: expect.arrayContaining(["MEMORY_AGENT_MISMATCH"]) }]);
    expect(store.exposureUpdates[0]?.exposedMemoryIds).toEqual([]);
  });

  it("allows the same memory when its ownership matches the current execution agent", async () => {
    const current = execution("agent-a");
    const owned = memory("agent-a");
    const store = new IsolationStore(current, owned);
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const recall = await runtime.recall({ executionId: current.id, query: "prior deployment memory" });

    expect(recall.rejected).toEqual([]);
    expect(recall.candidates.map((candidate) => candidate.memory.id)).toEqual([owned.id]);
  });

  it("revalidates memory ownership before influence instead of trusting prior exposure", async () => {
    const current = execution("agent-a");
    const candidate = memory("agent-a");
    const store = new IsolationStore(current, candidate);
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const recall = await runtime.recall({ executionId: current.id, query: "prior deployment memory" });
    expect(recall.candidates.map((item) => item.memory.id)).toEqual([candidate.id]);

    candidate.agentId = "agent-b";

    await expect(runtime.recordDecision({
      executionId: current.id,
      decisionType: "DEPLOYMENT_STRATEGY",
      selectedAction: { strategy: "STAGED_ROLLOUT" },
      reasoningSummary: "Attempted to use a memory whose ownership changed after recall.",
      influences: [{
        memoryId: candidate.id,
        retrievalId: recall.recall.id,
        influenceType: "SUPPORTED_ACTION",
        summary: "Prior memory supports staged rollout.",
      }],
    })).rejects.toThrow("MEMORY_AGENT_MISMATCH");

    expect(store.decisions).toHaveLength(0);
    expect(store.evaluations.some((event) => event.eventType === "INFLUENCE_REJECTED")).toBe(true);
  });
});