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

function memory(id: string, summary: string): OperationalMemory {
  return {
    id,
    agentId: "agent-a",
    memoryType: "UNEXPECTED_FAILURE",
    summary,
    structuredContext: { workflowType: "deployment" },
    confidence: 0.95,
    evidenceState: "OBSERVED",
    validFrom: new Date("2026-08-15T00:00:00Z"),
    environmentVersion: "prod-v2",
    toolVersion: "2.0.0",
  };
}

class CompetingMemoryStore implements EngramRuntimeStore {
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
  };
  readonly memoryA = memory(randomUUID(), "Dependency alpha failed under production load.");
  readonly memoryB = memory(randomUUID(), "Dependency beta caused a rollback under production load.");
  readonly recalls: MemoryRecall[] = [];
  readonly decisions: RuntimeDecisionRecord[] = [];
  readonly evaluations: RuntimeEvaluationEvent[] = [];
  private readonly pending = new Map<string, string>();

  async startExecution(_input: ExecutionContext) { return { executionId: this.execution.id }; }
  async getExecution(id: string) { return id === this.execution.id ? this.execution : null; }
  async appendEvent(_event: ExecutionEvent) {}
  async recordOutcome(_outcome: Outcome) {}
  async persistMemory(_memory: OperationalMemory, _sources: string[]) {}
  async getMemory(id: string) {
    if (id === this.memoryA.id) return this.memoryA;
    if (id === this.memoryB.id) return this.memoryB;
    return null;
  }
  async getRecalls(executionId: string) { return this.recalls.filter((recall) => recall.executionId === executionId); }
  async recordRuntimeDecision(decision: RuntimeDecisionRecord) { this.decisions.push(decision); }
  async appendRuntimeEvaluationEvent(event: RuntimeEvaluationEvent) { this.evaluations.push(event); }
  async getTrace(_executionId: string) { return { events: [] }; }

  async searchMemory(input: MemorySearchInput) {
    const retrievalId = randomUUID();
    this.pending.set(retrievalId, input.query);
    const selected = input.query.includes("alpha") ? this.memoryA : this.memoryB;
    return {
      retrievalId,
      candidates: [{
        memoryId: selected.id,
        memory: selected,
        semanticScore: 0.96,
        contextScore: 1,
        outcomeScore: 1,
        confidenceScore: selected.confidence,
        recencyScore: 1,
        finalScore: 0.96,
        rank: 1,
      }],
    };
  }

  async updateRecallExposure(update: RecallExposureUpdate) {
    const memoryStateById = new Map(update.exposedMemoryStates.map((state) => [state.memoryId, state.memoryStateDigest]));
    this.recalls.push({
      id: update.retrievalId,
      executionId: this.execution.id,
      query: this.pending.get(update.retrievalId) ?? "unknown",
      policyVersion: DEFAULT_RUNTIME_POLICIES.retrieval.policyVersion,
      recalledAt: new Date(),
      candidates: update.exposedMemoryIds.map((memoryId, index) => ({
        retrievalId: update.retrievalId,
        memoryId,
        memoryStateDigest: memoryStateById.get(memoryId),
        rank: index + 1,
        score: 0.96,
      })),
    });
  }
}

describe("competing memory provenance", () => {
  it("preserves the exact retrieval that exposed each influential memory", async () => {
    const store = new CompetingMemoryStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const alphaRecall = await runtime.recall({ executionId: store.execution.id, query: "alpha dependency failure" });
    const betaRecall = await runtime.recall({ executionId: store.execution.id, query: "beta rollback failure" });

    expect(alphaRecall.recall.id).not.toBe(betaRecall.recall.id);
    expect(alphaRecall.recall.candidates[0]?.memoryId).toBe(store.memoryA.id);
    expect(betaRecall.recall.candidates[0]?.memoryId).toBe(store.memoryB.id);

    const alphaDecision = await runtime.recordDecision({
      executionId: store.execution.id,
      decisionType: "ALPHA_POLICY",
      selectedAction: { allowAlpha: false },
      reasoningSummary: "The recalled alpha failure supports blocking alpha.",
      influences: [{
        memoryId: store.memoryA.id,
        retrievalId: alphaRecall.recall.id,
        influenceType: "SUPPORTED_ACTION",
        summary: "Alpha failure supports the block.",
      }],
    });

    const betaDecision = await runtime.recordDecision({
      executionId: store.execution.id,
      decisionType: "BETA_POLICY",
      selectedAction: { allowBeta: false },
      reasoningSummary: "The recalled beta rollback supports blocking beta.",
      influences: [{
        memoryId: store.memoryB.id,
        retrievalId: betaRecall.recall.id,
        influenceType: "SUPPORTED_ACTION",
        summary: "Beta rollback supports the block.",
      }],
    });

    expect(alphaDecision.influences[0]?.retrievalId).toBe(alphaRecall.recall.id);
    expect(betaDecision.influences[0]?.retrievalId).toBe(betaRecall.recall.id);
    expect(store.decisions).toHaveLength(2);
  });

  it("rejects a valid memory paired with the wrong recall provenance", async () => {
    const store = new CompetingMemoryStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const alphaRecall = await runtime.recall({ executionId: store.execution.id, query: "alpha dependency failure" });
    const betaRecall = await runtime.recall({ executionId: store.execution.id, query: "beta rollback failure" });
    expect(alphaRecall.recall.id).not.toBe(betaRecall.recall.id);

    await expect(runtime.recordDecision({
      executionId: store.execution.id,
      decisionType: "BROKEN_PROVENANCE",
      selectedAction: { allowAlpha: false },
      reasoningSummary: "This intentionally pairs alpha with beta's recall.",
      influences: [{
        memoryId: store.memoryA.id,
        retrievalId: betaRecall.recall.id,
        influenceType: "SUPPORTED_ACTION",
        summary: "Intentionally incorrect retrieval linkage.",
      }],
    })).rejects.toThrow("RETRIEVAL_MISMATCH");

    expect(store.decisions).toHaveLength(0);
    expect(store.evaluations.some((event) => event.eventType === "INFLUENCE_REJECTED")).toBe(true);
  });
});
