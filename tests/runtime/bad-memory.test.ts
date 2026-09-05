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

class AdversarialMemoryStore implements EngramRuntimeStore {
  readonly executionId = randomUUID();
  readonly retrievalId = randomUUID();
  readonly recalls: MemoryRecall[] = [];
  readonly exposureUpdates: RecallExposureUpdate[] = [];
  readonly evaluations: RuntimeEvaluationEvent[] = [];
  readonly decisions: RuntimeDecisionRecord[] = [];

  constructor(
    readonly memory: OperationalMemory,
    readonly execution: RuntimeExecutionRecord = {
      id: randomUUID(),
      agentId: "agent-a",
      workflowType: "deployment",
      intent: "deploy service",
      context: {},
      constraints: {},
      environmentVersion: "prod-v2",
      toolVersion: "2.0.0",
      status: "RUNNING",
      startedAt: new Date("2026-08-16T00:00:00Z"),
    },
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
        semanticScore: 0.95,
        contextScore: 1,
        outcomeScore: 1,
        confidenceScore: this.memory.confidence,
        recencyScore: 1,
        finalScore: 0.95,
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
      query: "prior execution",
      policyVersion: DEFAULT_RUNTIME_POLICIES.retrieval.policyVersion,
      recalledAt: new Date(),
      candidates: update.exposedMemoryIds.map((memoryId, index) => ({
        retrievalId: update.retrievalId,
        memoryId,
        memoryStateDigest: memoryStateById.get(memoryId),
        rank: index + 1,
        score: 0.95,
      })),
    });
  }
}

describe("adversarial operational memory", () => {
  it("does not expose a high-scoring memory that is stale for the current execution", async () => {
    const memory: OperationalMemory = {
      id: randomUUID(),
      agentId: "agent-a",
      memoryType: "UNEXPECTED_FAILURE",
      summary: "A formerly valid deployment lesson",
      structuredContext: { workflowType: "deployment" },
      confidence: 0.95,
      evidenceState: "OBSERVED",
      validFrom: new Date("2026-01-01T00:00:00Z"),
      validUntil: new Date("2026-07-01T00:00:00Z"),
      environmentVersion: "prod-v1",
      toolVersion: "1.9.0",
    };
    const store = new AdversarialMemoryStore(memory);
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const result = await runtime.recall({ executionId: store.execution.id, query: "prior execution" });

    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toEqual([{ memoryId: memory.id, reasons: expect.arrayContaining([
      "MEMORY_EXPIRED",
      "INVALIDATED_ENVIRONMENT_CHANGE",
      "INVALIDATED_TOOL_MAJOR_VERSION_CHANGE",
    ]) }]);
    expect(store.exposureUpdates[0]?.exposedMemoryIds).toEqual([]);
    expect(store.evaluations.some((event) => event.eventType === "RECALL_FILTERED")).toBe(true);
  });

  it("rejects a low-confidence memory as influence even when it was recalled and exposed", async () => {
    const memory: OperationalMemory = {
      id: randomUUID(),
      agentId: "agent-a",
      memoryType: "UNEXPECTED_FAILURE",
      summary: "Weakly supported prior lesson",
      structuredContext: { workflowType: "deployment" },
      confidence: 0.2,
      evidenceState: "OBSERVED",
      validFrom: new Date("2026-08-15T00:00:00Z"),
      environmentVersion: "prod-v2",
      toolVersion: "2.0.0",
    };
    const store = new AdversarialMemoryStore(memory);
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const recall = await runtime.recall({ executionId: store.execution.id, query: "prior execution" });
    expect(recall.candidates.map((candidate) => candidate.memory.id)).toContain(memory.id);

    await expect(runtime.recordDecision({
      executionId: store.execution.id,
      decisionType: "DEPLOYMENT_STRATEGY",
      selectedAction: { strategy: "fallback" },
      alternatives: [{ strategy: "primary" }],
      reasoningSummary: "Attempted to rely on a weak memory.",
      influences: [{
        memoryId: memory.id,
        retrievalId: recall.recall.id,
        influenceType: "SUPPORTED_ACTION",
        summary: "Weak prior lesson supposedly supports fallback.",
      }],
    })).rejects.toThrow("CONFIDENCE_BELOW_THRESHOLD");

    expect(store.decisions).toHaveLength(0);
    expect(store.evaluations.some((event) => event.eventType === "INFLUENCE_REJECTED")).toBe(true);
  });
});
