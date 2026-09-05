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

class CounterfactualStore implements EngramRuntimeStore {
  readonly retrievalId = randomUUID();
  readonly recalls: MemoryRecall[] = [];
  readonly decisions: RuntimeDecisionRecord[] = [];
  readonly evaluations: RuntimeEvaluationEvent[] = [];

  constructor(
    readonly current: RuntimeExecutionRecord,
    readonly memory: OperationalMemory,
    readonly comparisons: RuntimeExecutionRecord[],
  ) {}

  async startExecution(_input: ExecutionContext) { return { executionId: this.current.id }; }
  async getExecution(executionId: string) {
    if (executionId === this.current.id) return this.current;
    return this.comparisons.find((execution) => execution.id === executionId) ?? null;
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
        contextScore: 1,
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
    this.recalls.push({
      id: update.retrievalId,
      executionId: this.current.id,
      query: "prior release memory",
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

function execution(agentId: string, status: RuntimeExecutionRecord["status"]): RuntimeExecutionRecord {
  return {
    id: randomUUID(),
    agentId,
    workflowType: "deployment",
    intent: "deploy checkout",
    context: { service: "checkout", release: "2026.08" },
    constraints: { region: "eu" },
    environmentVersion: "prod-v2",
    toolVersion: "2.4.0",
    status,
    startedAt: new Date("2026-08-16T00:00:00Z"),
    completedAt: status === "RUNNING" ? undefined : new Date("2026-08-16T00:05:00Z"),
  };
}

function operationalMemory(): OperationalMemory {
  return {
    id: randomUUID(),
    agentId: "release-agent",
    memoryType: "SUCCESSFUL_RECOVERY",
    summary: "Use staged rollout for this release class.",
    structuredContext: { workflowType: "deployment" },
    confidence: 0.94,
    evidenceState: "OBSERVED",
    validFrom: new Date("2026-08-15T00:00:00Z"),
    environmentVersion: "prod-v2",
    toolVersion: "2.4.0",
  };
}

async function recalledRuntime(comparisons: RuntimeExecutionRecord[] = []) {
  const current = execution("release-agent", "RUNNING");
  const memory = operationalMemory();
  const store = new CounterfactualStore(current, memory, comparisons);
  const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
  const recall = await runtime.recall({ executionId: current.id, query: "prior release memory" });
  expect(recall.candidates.map((candidate) => candidate.memory.id)).toEqual([memory.id]);
  return { current, memory, store, runtime, recall };
}

function changedActionInfluence(memoryId: string, retrievalId: string, comparisonExecutionId?: string) {
  return {
    memoryId,
    retrievalId,
    influenceType: "CHANGED_ACTION" as const,
    summary: "The prior lesson changed rollout strategy.",
    counterfactual: {
      action: { strategy: "COMPAT_MODE" },
      source: "CONTROL_RUN" as const,
      evidenceState: "OBSERVED" as const,
      explanation: "Memory-free control used compatibility mode.",
      comparisonExecutionId,
    },
  };
}

async function recordChangedAction(
  runtime: EngramRuntime,
  current: RuntimeExecutionRecord,
  memory: OperationalMemory,
  retrievalId: string,
  comparisonExecutionId?: string,
) {
  return runtime.recordDecision({
    executionId: current.id,
    decisionType: "DEPLOYMENT_STRATEGY",
    selectedAction: { strategy: "STAGED_CURRENT" },
    alternatives: [{ strategy: "COMPAT_MODE" }],
    reasoningSummary: "Memory changed the rollout strategy.",
    influences: [changedActionInfluence(memory.id, retrievalId, comparisonExecutionId)],
  });
}

describe("EXP-018 counterfactual authenticity", () => {
  it("rejects CONTROL_RUN without a comparison execution id", async () => {
    const { current, memory, store, runtime, recall } = await recalledRuntime();

    await expect(recordChangedAction(runtime, current, memory, recall.recall.id)).rejects.toThrow(
      "COUNTERFACTUAL_COMPARISON_EXECUTION_REQUIRED",
    );
    expect(store.decisions).toHaveLength(0);
  });

  it("rejects a nonexistent comparison execution", async () => {
    const missing = randomUUID();
    const { current, memory, store, runtime, recall } = await recalledRuntime();

    await expect(recordChangedAction(runtime, current, memory, recall.recall.id, missing)).rejects.toThrow(
      `COUNTERFACTUAL_COMPARISON_EXECUTION_NOT_FOUND:${missing}`,
    );
    expect(store.decisions).toHaveLength(0);
  });

  it("rejects self-reference as a control execution", async () => {
    const { current, memory, store, runtime, recall } = await recalledRuntime();

    await expect(recordChangedAction(runtime, current, memory, recall.recall.id, current.id)).rejects.toThrow(
      "COUNTERFACTUAL_COMPARISON_EXECUTION_SELF_REFERENCE",
    );
    expect(store.decisions).toHaveLength(0);
  });

  it("rejects a completed control execution owned by another agent", async () => {
    const foreign = execution("other-agent", "SUCCESS");
    const { current, memory, store, runtime, recall } = await recalledRuntime([foreign]);

    await expect(recordChangedAction(runtime, current, memory, recall.recall.id, foreign.id)).rejects.toThrow(
      `COUNTERFACTUAL_COMPARISON_AGENT_MISMATCH:${foreign.id}`,
    );
    expect(store.decisions).toHaveLength(0);
  });

  it("rejects a comparison execution that is still running", async () => {
    const running = execution("release-agent", "RUNNING");
    const { current, memory, store, runtime, recall } = await recalledRuntime([running]);

    await expect(recordChangedAction(runtime, current, memory, recall.recall.id, running.id)).rejects.toThrow(
      `COUNTERFACTUAL_COMPARISON_EXECUTION_INCOMPLETE:${running.id}`,
    );
    expect(store.decisions).toHaveLength(0);
  });

  it("accepts a real distinct completed same-agent control execution", async () => {
    const control = execution("release-agent", "PARTIAL");
    const { current, memory, store, runtime, recall } = await recalledRuntime([control]);

    const decision = await recordChangedAction(runtime, current, memory, recall.recall.id, control.id);

    expect(decision.influences[0]?.counterfactual?.source).toBe("CONTROL_RUN");
    expect(decision.influences[0]?.counterfactual?.comparisonExecutionId).toBe(control.id);
    expect(store.decisions).toHaveLength(1);
  });
});