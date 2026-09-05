import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MemoryRecall } from "../../packages/core/src/protocol.js";
import type { ExecutionContext, ExecutionEvent, MemorySearchInput, OperationalMemory, Outcome } from "../../packages/memory-core/src/domain.js";
import { decideCodingStrategy, executeCodingTask, type CodingContext } from "../../packages/scenarios/coding/src/index.js";
import { DEFAULT_RUNTIME_POLICIES } from "../../packages/runtime/src/defaults.js";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import type { EngramRuntimeStore } from "../../packages/runtime/src/store.js";
import type { RecallExposureUpdate, RuntimeDecisionRecord, RuntimeEvaluationEvent, RuntimeExecutionRecord } from "../../packages/runtime/src/types.js";

class CodingStore implements EngramRuntimeStore {
  executions = new Map<string, RuntimeExecutionRecord>();
  memories: OperationalMemory[] = [];
  recalls: MemoryRecall[] = [];
  decisions: RuntimeDecisionRecord[] = [];
  evaluations: RuntimeEvaluationEvent[] = [];
  outcomes = new Map<string, Outcome>();
  events = new Map<string, ExecutionEvent[]>();
  private pending = new Map<string, { executionId: string; query: string }>();

  async startExecution(input: ExecutionContext) {
    const id = randomUUID();
    this.executions.set(id, {
      id,
      agentId: input.agentId,
      agentVersion: input.agentVersion,
      workflowType: input.workflowType,
      intent: input.intent,
      context: input.context,
      constraints: input.constraints,
      environmentVersion: input.environmentVersion,
      toolVersion: input.toolVersion,
      policyVersion: input.policyVersion,
      status: "RUNNING",
      startedAt: new Date(),
    });
    this.events.set(id, []);
    return { executionId: id };
  }
  async getExecution(id: string) { return this.executions.get(id) ?? null; }
  async appendEvent(event: ExecutionEvent) { this.events.get(event.executionId)?.push(event); }
  async recordOutcome(outcome: Outcome) {
    this.outcomes.set(outcome.executionId, outcome);
    const execution = this.executions.get(outcome.executionId);
    if (execution) execution.status = outcome.status;
  }
  async persistMemory(memory: OperationalMemory, _sources: string[]) { this.memories.push(memory); }
  async getMemory(id: string) { return this.memories.find((memory) => memory.id === id) ?? null; }
  async searchMemory(input: MemorySearchInput) {
    const retrievalId = randomUUID();
    if (!input.executionId) throw new Error("executionId required");
    this.pending.set(retrievalId, { executionId: input.executionId, query: input.query });
    return {
      retrievalId,
      candidates: this.memories.filter((memory) => memory.agentId === input.agentId).map((memory, index) => ({
        memoryId: memory.id,
        memory,
        semanticScore: 0.97,
        contextScore: 1,
        outcomeScore: 1,
        confidenceScore: memory.confidence,
        recencyScore: 1,
        finalScore: 0.97 - index * 0.01,
        rank: index + 1,
      })),
    };
  }
  async getRecalls(executionId: string) { return this.recalls.filter((recall) => recall.executionId === executionId); }
  async updateRecallExposure(update: RecallExposureUpdate) {
    const memoryStateById = new Map(update.exposedMemoryStates.map((state) => [state.memoryId, state.memoryStateDigest]));
    const pending = this.pending.get(update.retrievalId);
    if (!pending) throw new Error("unknown retrieval");
    this.recalls.push({
      id: update.retrievalId,
      executionId: pending.executionId,
      query: pending.query,
      policyVersion: DEFAULT_RUNTIME_POLICIES.retrieval.policyVersion,
      recalledAt: new Date(),
      candidates: update.exposedMemoryIds.map((memoryId, index) => ({
        retrievalId: update.retrievalId,
        memoryId,
        memoryStateDigest: memoryStateById.get(memoryId),
        rank: index + 1,
        score: 0.97 - index * 0.01,
      })),
    });
  }
  async recordRuntimeDecision(decision: RuntimeDecisionRecord) { this.decisions.push(decision); }
  async appendRuntimeEvaluationEvent(event: RuntimeEvaluationEvent) { this.evaluations.push(event); }
  async getTrace(executionId: string) {
    return {
      decisions: this.decisions.filter((decision) => decision.executionId === executionId),
      evaluations: this.evaluations.filter((event) => event.executionId === executionId),
      events: this.events.get(executionId) ?? [],
      outcome: this.outcomes.get(executionId) ?? null,
    };
  }
}

const codingContext: CodingContext = {
  workflowType: "autonomous_coding",
  repository: "engram-fixture",
  subsystem: "parser",
  behaviorIsImplicit: true,
  environmentVersion: "repo-v2",
};

const executionContext = {
  agentId: "coding-agent",
  workflowType: codingContext.workflowType,
  intent: "Modify parser behavior without regressing implicit compatibility",
  context: codingContext,
  constraints: { preserveImplicitBehavior: true, testsMustPass: true },
  environmentVersion: codingContext.environmentVersion,
  toolVersion: "coding-agent-2.0.0",
} as const;

describe("autonomous coding execution memory runtime proof", () => {
  it("turns a prior reverted regression into a test-first later action with real control evidence", async () => {
    const store = new CodingStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const source = await runtime.startExecution(executionContext);
    const sourceRecall = await runtime.recall({ executionId: source.executionId, query: "parser implicit behavior regression" });
    expect(sourceRecall.candidates).toHaveLength(0);
    const sourceDecision = decideCodingStrategy({ context: codingContext, memories: [] });
    expect(sourceDecision.strategy).toBe("PATCH_FIRST");
    await runtime.recordDecision({
      executionId: source.executionId,
      decisionType: "CODING_STRATEGY",
      selectedAction: { strategy: sourceDecision.strategy },
      alternatives: [{ strategy: "REGRESSION_TEST_THEN_PATCH" }],
      reasoningSummary: "No comparable execution memory constrains the patch-first baseline.",
    });
    const sourceResult = executeCodingTask(sourceDecision.strategy, codingContext);
    expect(sourceResult).toMatchObject({ status: "COMPENSATED", failureType: "BEHAVIORAL_REGRESSION", recovery: "REVERT_PATCH" });
    await runtime.observe({
      executionId: source.executionId,
      type: "BEHAVIORAL_REGRESSION",
      payload: { subsystem: codingContext.subsystem, strategy: sourceDecision.strategy },
      evidenceState: "OBSERVED",
    });
    await runtime.observe({
      executionId: source.executionId,
      type: "PATCH_REVERTED",
      payload: { recovery: sourceResult.recovery },
      evidenceState: "OBSERVED",
    });
    const completed = await runtime.complete({
      executionId: source.executionId,
      status: "COMPENSATED",
      failureType: "BEHAVIORAL_REGRESSION",
      summary: "Patch-first changed implicit parser behavior; CI caught the regression and the patch was reverted.",
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "SUCCESSFUL_RECOVERY",
        summary: "A PATCH_FIRST parser change regressed implicit behavior and required REVERT_PATCH; for comparable implicit parser work prefer REGRESSION_TEST_THEN_PATCH.",
        evidenceState: "OBSERVED",
        confidence: 0.94,
        details: {
          workflowType: codingContext.workflowType,
          failureType: "BEHAVIORAL_REGRESSION",
          subsystem: codingContext.subsystem,
          behaviorWasImplicit: true,
          recoveryStrategy: "REVERT_PATCH",
          recommendedStrategy: "REGRESSION_TEST_THEN_PATCH",
        },
      }],
    });
    const memory = completed.admittedMemories[0]!;

    const control = await runtime.startExecution(executionContext);
    const controlDecision = decideCodingStrategy({ context: codingContext, memories: [] });
    const controlResult = executeCodingTask(controlDecision.strategy, codingContext);
    expect(controlResult.status).toBe("COMPENSATED");
    await runtime.recordDecision({
      executionId: control.executionId,
      decisionType: "CODING_STRATEGY",
      selectedAction: { strategy: controlDecision.strategy },
      reasoningSummary: "Control deliberately excludes execution-memory recall.",
    });
    await runtime.complete({
      executionId: control.executionId,
      status: "COMPENSATED",
      failureType: "BEHAVIORAL_REGRESSION",
      summary: "Control repeated patch-first and reproduced the regression.",
      evidenceState: "OBSERVED",
    });

    const treatment = await runtime.startExecution(executionContext);
    const recall = await runtime.recall({ executionId: treatment.executionId, query: "parser implicit behavior regression" });
    expect(recall.candidates.map((candidate) => candidate.memory.id)).toContain(memory.id);
    const treatmentDecision = decideCodingStrategy({
      context: codingContext,
      memories: recall.candidates.map((candidate) => ({ memory: candidate.memory, finalScore: candidate.score })),
    });
    expect(treatmentDecision.strategy).toBe("REGRESSION_TEST_THEN_PATCH");
    await runtime.recordDecision({
      executionId: treatment.executionId,
      decisionType: "CODING_STRATEGY",
      selectedAction: { strategy: treatmentDecision.strategy },
      alternatives: [{ strategy: controlDecision.strategy }],
      reasoningSummary: "Prior reverted regression makes regression-test-first the safer application action.",
      influences: [{
        memoryId: memory.id,
        retrievalId: recall.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "The prior implicit-behavior regression changed the coding strategy.",
        relevance: 0.97,
        counterfactual: {
          action: { strategy: controlDecision.strategy },
          source: "CONTROL_RUN",
          evidenceState: "OBSERVED",
          explanation: "The same-context control omitted recall, selected PATCH_FIRST, and reproduced BEHAVIORAL_REGRESSION.",
          comparisonExecutionId: control.executionId,
        },
      }],
    });
    const treatmentResult = executeCodingTask(treatmentDecision.strategy, codingContext);
    expect(treatmentResult).toEqual({
      status: "SUCCESS",
      strategy: "REGRESSION_TEST_THEN_PATCH",
      regressionTestAdded: true,
    });
    await runtime.observe({
      executionId: treatment.executionId,
      type: "REGRESSION_TEST_ADDED",
      payload: { subsystem: codingContext.subsystem },
      evidenceState: "OBSERVED",
    });
    await runtime.complete({
      executionId: treatment.executionId,
      status: "SUCCESS",
      summary: "Regression test pinned implicit behavior before the patch and the task succeeded.",
      evidenceState: "OBSERVED",
    });

    const trace = await runtime.trace(treatment.executionId) as {
      decisions: RuntimeDecisionRecord[];
      evaluations: RuntimeEvaluationEvent[];
      outcome: Outcome;
    };
    expect(trace.outcome.status).toBe("SUCCESS");
    expect(trace.decisions[0]?.influences[0]?.influenceType).toBe("CHANGED_ACTION");
    expect(trace.decisions[0]?.influences[0]?.counterfactual?.comparisonExecutionId).toBe(control.executionId);
    expect(trace.evaluations.some((event) => event.eventType === "INFLUENCE_ACCEPTED")).toBe(true);
  });
});
