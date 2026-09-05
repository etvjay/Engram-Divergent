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

class ContextCompletenessStore implements EngramRuntimeStore {
  readonly retrievalId = randomUUID();
  readonly recalls: MemoryRecall[] = [];
  readonly exposureUpdates: RecallExposureUpdate[] = [];
  readonly evaluations: RuntimeEvaluationEvent[] = [];
  readonly decisions: RuntimeDecisionRecord[] = [];

  constructor(
    readonly memory: OperationalMemory,
    readonly execution: RuntimeExecutionRecord,
  ) {}

  async startExecution(_input: ExecutionContext) { return { executionId: this.execution.id }; }
  async getExecution(executionId: string) { return executionId === this.execution.id ? this.execution : null; }
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
      executionId: this.execution.id,
      query: "prior production recovery",
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

const memory: OperationalMemory = {
  id: randomUUID(),
  agentId: "release-agent",
  memoryType: "SUCCESSFUL_RECOVERY",
  summary: "Use staged rollout after the v2 migration lock incident.",
  structuredContext: { workflowType: "deployment", strategy: "STAGED_ROLLOUT" },
  confidence: 0.96,
  evidenceState: "OBSERVED",
  validFrom: new Date("2026-08-15T00:00:00Z"),
  environmentVersion: "prod-v2",
  toolVersion: "2.4.0",
};

function execution(overrides: Partial<RuntimeExecutionRecord>): RuntimeExecutionRecord {
  return {
    id: randomUUID(),
    agentId: "release-agent",
    workflowType: "deployment",
    intent: "deploy current release",
    context: { service: "checkout" },
    constraints: {},
    status: "RUNNING",
    startedAt: new Date("2026-08-16T00:00:00Z"),
    ...overrides,
  };
}

describe("EXP-014 context completeness authority boundary", () => {
  it("rejects a high-scoring version-bound memory when the execution omits environment and tool comparison context", async () => {
    const store = new ContextCompletenessStore(memory, execution({}));
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const recall = await runtime.recall({
      executionId: store.execution.id,
      query: "prior production recovery",
    });

    expect(recall.candidates).toEqual([]);
    expect(recall.rejected).toEqual([{
      memoryId: memory.id,
      reasons: expect.arrayContaining([
        "EXECUTION_ENVIRONMENT_UNSPECIFIED",
        "EXECUTION_TOOL_VERSION_UNSPECIFIED",
      ]),
    }]);
    expect(store.exposureUpdates[0]?.exposedMemoryIds).toEqual([]);
    expect(store.evaluations.some((event) => event.eventType === "RECALL_FILTERED")).toBe(true);
  });

  it("exposes the same memory once the execution supplies matching environment and tool context", async () => {
    const store = new ContextCompletenessStore(memory, execution({
      environmentVersion: "prod-v2",
      toolVersion: "2.9.1",
    }));
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const recall = await runtime.recall({
      executionId: store.execution.id,
      query: "prior production recovery",
    });

    expect(recall.rejected).toEqual([]);
    expect(recall.candidates.map((candidate) => candidate.memory.id)).toEqual([memory.id]);
    expect(store.exposureUpdates[0]?.exposedMemoryIds).toEqual([memory.id]);
  });

  it("still rejects the memory when explicit comparison context proves incompatibility", async () => {
    const store = new ContextCompletenessStore(memory, execution({
      environmentVersion: "prod-v3",
      toolVersion: "3.0.0",
    }));
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const recall = await runtime.recall({
      executionId: store.execution.id,
      query: "prior production recovery",
    });

    expect(recall.candidates).toEqual([]);
    expect(recall.rejected[0]?.reasons).toEqual(expect.arrayContaining([
      "INVALIDATED_ENVIRONMENT_CHANGE",
      "INVALIDATED_TOOL_MAJOR_VERSION_CHANGE",
    ]));
  });
});
