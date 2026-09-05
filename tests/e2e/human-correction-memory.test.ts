import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MemoryRecall } from "../../packages/core/src/protocol.js";
import type { ExecutionContext, ExecutionEvent, MemorySearchInput, OperationalMemory, Outcome } from "../../packages/memory-core/src/domain.js";
import { decideMaintenanceStrategy, type MaintenanceContext } from "../../packages/scenarios/operator-safety/src/index.js";
import { DEFAULT_RUNTIME_POLICIES } from "../../packages/runtime/src/defaults.js";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import type { EngramRuntimeStore } from "../../packages/runtime/src/store.js";
import type { RecallExposureUpdate, RuntimeDecisionRecord, RuntimeEvaluationEvent, RuntimeExecutionRecord } from "../../packages/runtime/src/types.js";

class CorrectionStore implements EngramRuntimeStore {
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

const maintenance: MaintenanceContext = {
  workflowType: "production_maintenance",
  resourceType: "DATABASE_INDEX",
  trafficClass: "PEAK",
  environmentVersion: "prod-v6",
};

const executionContext = {
  agentId: "maintenance-agent",
  workflowType: maintenance.workflowType,
  intent: "Rebuild a degraded production database index without unacceptable service disruption",
  context: maintenance,
  constraints: { humanApprovalRequiredForBlockingMaintenance: true, preserveAvailability: true },
  environmentVersion: maintenance.environmentVersion,
  toolVersion: "ops-agent-4.0.0",
} as const;

describe("human correction execution memory", () => {
  it("turns a prior operator correction into a changed later autonomous proposal", async () => {
    const store = new CorrectionStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    // Source: the autonomous application proposes the risky baseline, but a human rejects it before execution.
    const source = await runtime.startExecution(executionContext);
    const emptyRecall = await runtime.recall({ executionId: source.executionId, query: "peak traffic index rebuild operator correction" });
    expect(emptyRecall.candidates).toHaveLength(0);

    const sourceDecision = decideMaintenanceStrategy({ context: maintenance, memories: [] });
    expect(sourceDecision.strategy).toBe("IMMEDIATE_BLOCKING_REBUILD");
    await runtime.recordDecision({
      executionId: source.executionId,
      decisionType: "MAINTENANCE_STRATEGY",
      selectedAction: { strategy: sourceDecision.strategy },
      alternatives: [{ strategy: "ONLINE_STAGED_REBUILD" }],
      reasoningSummary: "No prior correction memory constrains the blocking-maintenance baseline.",
    });
    await runtime.observe({
      executionId: source.executionId,
      type: "HUMAN_ACTION_REJECTED",
      payload: {
        rejectedStrategy: sourceDecision.strategy,
        correctedStrategy: "ONLINE_STAGED_REBUILD",
        reason: "Do not run a blocking rebuild during peak traffic.",
      },
      evidenceState: "OBSERVED",
      provenance: [{ sourceType: "HUMAN", sourceId: "operator-approval", evidenceState: "OBSERVED" }],
    });
    const completed = await runtime.complete({
      executionId: source.executionId,
      status: "ABORTED",
      summary: "Human operator rejected blocking index maintenance during peak traffic and required an online staged rebuild.",
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "HUMAN_CORRECTION",
        summary: "Human correction: for DATABASE_INDEX maintenance during PEAK traffic reject IMMEDIATE_BLOCKING_REBUILD and use ONLINE_STAGED_REBUILD.",
        evidenceState: "OBSERVED",
        confidence: 0.98,
        details: {
          workflowType: maintenance.workflowType,
          correctionType: "HUMAN_CORRECTION",
          resourceType: maintenance.resourceType,
          trafficClass: maintenance.trafficClass,
          rejectedStrategy: "IMMEDIATE_BLOCKING_REBUILD",
          correctedStrategy: "ONLINE_STAGED_REBUILD",
          correctionSource: "HUMAN_OPERATOR",
        },
      }],
    });
    const correctionMemory = completed.admittedMemories[0]!;

    // Same-context control deliberately excludes recall and repeats the proposal.
    const control = await runtime.startExecution(executionContext);
    const controlDecision = decideMaintenanceStrategy({ context: maintenance, memories: [] });
    expect(controlDecision.strategy).toBe("IMMEDIATE_BLOCKING_REBUILD");
    await runtime.recordDecision({
      executionId: control.executionId,
      decisionType: "MAINTENANCE_STRATEGY",
      selectedAction: { strategy: controlDecision.strategy },
      reasoningSummary: "Control deliberately excludes execution-memory recall.",
    });
    await runtime.complete({
      executionId: control.executionId,
      status: "ABORTED",
      summary: "Memory-free control repeats the proposal previously rejected by the human operator.",
      evidenceState: "OBSERVED",
    });

    // Treatment retrieves the human correction before proposing an action.
    const treatment = await runtime.startExecution(executionContext);
    const recall = await runtime.recall({ executionId: treatment.executionId, query: "peak traffic index rebuild operator correction" });
    expect(recall.candidates.map((candidate) => candidate.memory.id)).toContain(correctionMemory.id);

    const treatmentDecision = decideMaintenanceStrategy({
      context: maintenance,
      memories: recall.candidates.map((candidate) => ({ memory: candidate.memory, finalScore: candidate.score })),
    });
    expect(treatmentDecision.strategy).toBe("ONLINE_STAGED_REBUILD");

    await runtime.recordDecision({
      executionId: treatment.executionId,
      decisionType: "MAINTENANCE_STRATEGY",
      selectedAction: { strategy: treatmentDecision.strategy },
      alternatives: [{ strategy: controlDecision.strategy }],
      reasoningSummary: "Prior human correction changes the autonomous proposal before approval is requested again.",
      influences: [{
        memoryId: correctionMemory.id,
        retrievalId: recall.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "The remembered human correction changed the maintenance proposal.",
        relevance: 0.98,
        counterfactual: {
          action: { strategy: controlDecision.strategy },
          source: "CONTROL_RUN",
          evidenceState: "OBSERVED",
          explanation: "The same-context control omitted recall and repeated IMMEDIATE_BLOCKING_REBUILD.",
          comparisonExecutionId: control.executionId,
        },
      }],
    });
    await runtime.observe({
      executionId: treatment.executionId,
      type: "CORRECTED_STRATEGY_PROPOSED",
      payload: { strategy: treatmentDecision.strategy, humanReinterventionRequired: false },
      evidenceState: "OBSERVED",
    });
    await runtime.complete({
      executionId: treatment.executionId,
      status: "SUCCESS",
      summary: "The application proposed the previously corrected online staged strategy without repeating the blocking-maintenance proposal.",
      result: { strategy: treatmentDecision.strategy },
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
    expect(trace.decisions[0]?.influences[0]?.counterfactual?.comparisonExecutionId).toBe(control.executionId);
    expect(trace.evaluations.some((event) => event.eventType === "INFLUENCE_ACCEPTED")).toBe(true);
  });
});
