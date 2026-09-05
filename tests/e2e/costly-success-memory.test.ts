import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MemoryRecall } from "../../packages/core/src/protocol.js";
import type { ExecutionContext, ExecutionEvent, MemorySearchInput, OperationalMemory, Outcome } from "../../packages/memory-core/src/domain.js";
import { decideComputeStrategy, executeCompute, type ComputeContext } from "../../packages/scenarios/cost-aware/src/index.js";
import { DEFAULT_RUNTIME_POLICIES } from "../../packages/runtime/src/defaults.js";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import type { EngramRuntimeStore } from "../../packages/runtime/src/store.js";
import type { RecallExposureUpdate, RuntimeDecisionRecord, RuntimeEvaluationEvent, RuntimeExecutionRecord } from "../../packages/runtime/src/types.js";

class CostMemoryStore implements EngramRuntimeStore {
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
      candidates: this.memories
        .filter((memory) => memory.agentId === input.agentId)
        .map((memory, index) => ({
          memoryId: memory.id,
          memory,
          semanticScore: 0.98,
          contextScore: 1,
          outcomeScore: 1,
          confidenceScore: memory.confidence,
          recencyScore: 1,
          finalScore: 0.98 - index * 0.01,
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
        score: 0.98 - index * 0.01,
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

const computeContext: ComputeContext = {
  workflowType: "analysis_compute",
  datasetClass: "STABLE_WITH_SMALL_DELTA",
  freshnessRequirement: "STANDARD",
  environmentVersion: "analysis-v4",
};

const executionContext = {
  agentId: "analysis-agent",
  workflowType: computeContext.workflowType,
  intent: "Produce an accepted analysis artifact while controlling execution cost",
  context: computeContext,
  constraints: { outputQuality: "ACCEPTED", costSensitive: true },
  environmentVersion: computeContext.environmentVersion,
  toolVersion: "analysis-agent-3.2.0",
} as const;

describe("costly success execution memory", () => {
  it("admits significant cost from a successful run and changes the later strategy while both runs still succeed", async () => {
    const store = new CostMemoryStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    // Source: technically successful, but operationally expensive.
    const source = await runtime.startExecution(executionContext);
    const emptyRecall = await runtime.recall({ executionId: source.executionId, query: "analysis compute significant cost full recompute" });
    expect(emptyRecall.candidates).toHaveLength(0);
    const sourceDecision = decideComputeStrategy({ context: computeContext, memories: [] });
    const sourceResult = executeCompute(sourceDecision.strategy, computeContext);
    expect(sourceResult).toEqual({ status: "SUCCESS", strategy: "FULL_RECOMPUTE", costUnits: 120, outputQuality: "ACCEPTED" });
    await runtime.recordDecision({
      executionId: source.executionId,
      decisionType: "COMPUTE_STRATEGY",
      selectedAction: { strategy: sourceDecision.strategy },
      alternatives: [{ strategy: "INCREMENTAL_REUSE" }],
      reasoningSummary: "No prior cost memory constrains the full-recompute baseline.",
    });
    await runtime.observe({
      executionId: source.executionId,
      type: "COMPUTE_COST_OBSERVED",
      payload: { costUnits: sourceResult.costUnits, strategy: sourceResult.strategy, outputQuality: sourceResult.outputQuality },
      evidenceState: "OBSERVED",
    });
    const sourceComplete = await runtime.complete({
      executionId: source.executionId,
      status: "SUCCESS",
      summary: "Full recompute produced accepted output but consumed disproportionate compute cost.",
      result: sourceResult,
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "SIGNIFICANT_COST",
        summary: "SIGNIFICANT_COST: FULL_RECOMPUTE cost 120 units on stable data with a small delta; prefer INCREMENTAL_REUSE under standard freshness requirements.",
        evidenceState: "OBSERVED",
        confidence: 0.95,
        details: {
          workflowType: computeContext.workflowType,
          signalType: "SIGNIFICANT_COST",
          datasetClass: computeContext.datasetClass,
          expensiveStrategy: "FULL_RECOMPUTE",
          preferredStrategy: "INCREMENTAL_REUSE",
          priorCostUnits: 120,
          outcome: "SUCCESS",
        },
      }],
    });
    const costMemory = sourceComplete.admittedMemories[0]!;

    // Same-context control: also succeeds, but repeats the high cost.
    const control = await runtime.startExecution(executionContext);
    const controlDecision = decideComputeStrategy({ context: computeContext, memories: [] });
    const controlResult = executeCompute(controlDecision.strategy, computeContext);
    expect(controlResult.status).toBe("SUCCESS");
    expect(controlResult.costUnits).toBe(120);
    await runtime.recordDecision({
      executionId: control.executionId,
      decisionType: "COMPUTE_STRATEGY",
      selectedAction: { strategy: controlDecision.strategy },
      reasoningSummary: "Control deliberately excludes execution-memory recall.",
    });
    await runtime.complete({
      executionId: control.executionId,
      status: "SUCCESS",
      summary: "Memory-free control succeeds but repeats the expensive full recompute.",
      result: controlResult,
      evidenceState: "OBSERVED",
    });

    // Treatment: success remains success, but strategy and cost change because of memory.
    const treatment = await runtime.startExecution(executionContext);
    const recall = await runtime.recall({ executionId: treatment.executionId, query: "analysis compute significant cost full recompute" });
    expect(recall.candidates.map((candidate) => candidate.memory.id)).toContain(costMemory.id);
    const treatmentDecision = decideComputeStrategy({
      context: computeContext,
      memories: recall.candidates.map((candidate) => ({ memory: candidate.memory, finalScore: candidate.score })),
    });
    expect(treatmentDecision.strategy).toBe("INCREMENTAL_REUSE");

    await runtime.recordDecision({
      executionId: treatment.executionId,
      decisionType: "COMPUTE_STRATEGY",
      selectedAction: { strategy: treatmentDecision.strategy },
      alternatives: [{ strategy: controlDecision.strategy }],
      reasoningSummary: "Prior successful-but-expensive execution memory changes the strategy without changing the required output quality.",
      influences: [{
        memoryId: costMemory.id,
        retrievalId: recall.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "Significant-cost memory changed the compute strategy from full recompute to incremental reuse.",
        relevance: 0.98,
        counterfactual: {
          action: { strategy: controlDecision.strategy },
          source: "CONTROL_RUN",
          evidenceState: "OBSERVED",
          explanation: "The same-context memory-free control repeated FULL_RECOMPUTE and incurred 120 cost units while still succeeding.",
          comparisonExecutionId: control.executionId,
        },
      }],
    });

    const treatmentResult = executeCompute(treatmentDecision.strategy, computeContext);
    expect(treatmentResult).toEqual({ status: "SUCCESS", strategy: "INCREMENTAL_REUSE", costUnits: 18, outputQuality: "ACCEPTED" });
    await runtime.observe({
      executionId: treatment.executionId,
      type: "COMPUTE_COST_OBSERVED",
      payload: { costUnits: treatmentResult.costUnits, strategy: treatmentResult.strategy, outputQuality: treatmentResult.outputQuality },
      evidenceState: "OBSERVED",
    });
    await runtime.complete({
      executionId: treatment.executionId,
      status: "SUCCESS",
      summary: "Incremental reuse produced accepted output at substantially lower cost.",
      result: treatmentResult,
      evidenceState: "OBSERVED",
    });

    const trace = await runtime.trace(treatment.executionId) as {
      decisions: RuntimeDecisionRecord[];
      evaluations: RuntimeEvaluationEvent[];
      outcome: Outcome;
    };
    expect(trace.outcome.status).toBe("SUCCESS");
    expect(trace.decisions[0]?.influences[0]?.influenceType).toBe("CHANGED_ACTION");
    expect(trace.decisions[0]?.influences[0]?.counterfactual?.source).toBe("CONTROL_RUN");
    expect(trace.evaluations.some((event) => event.eventType === "INFLUENCE_ACCEPTED")).toBe(true);
  });
});
