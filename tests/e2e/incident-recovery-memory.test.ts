import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MemoryRecall } from "../../packages/core/src/protocol.js";
import type { ExecutionContext, ExecutionEvent, MemorySearchInput, OperationalMemory, Outcome } from "../../packages/memory-core/src/domain.js";
import { decideRecoveryStrategy, executeRecovery, type IncidentContext } from "../../packages/scenarios/incident-response/src/index.js";
import { DEFAULT_RUNTIME_POLICIES } from "../../packages/runtime/src/defaults.js";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import type { EngramRuntimeStore } from "../../packages/runtime/src/store.js";
import type { RecallExposureUpdate, RuntimeDecisionRecord, RuntimeEvaluationEvent, RuntimeExecutionRecord } from "../../packages/runtime/src/types.js";

class IncidentStore implements EngramRuntimeStore {
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
      candidates: this.memories.filter((m) => m.agentId === input.agentId).map((memory, index) => ({
        memoryId: memory.id,
        memory,
        semanticScore: 0.96,
        contextScore: 1,
        outcomeScore: 1,
        confidenceScore: memory.confidence,
        recencyScore: 1,
        finalScore: 0.96 - index * 0.01,
        rank: index + 1,
      })),
    };
  }
  async getRecalls(executionId: string) { return this.recalls.filter((r) => r.executionId === executionId); }
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
        score: 0.96 - index * 0.01,
      })),
    });
  }
  async recordRuntimeDecision(decision: RuntimeDecisionRecord) { this.decisions.push(decision); }
  async appendRuntimeEvaluationEvent(event: RuntimeEvaluationEvent) { this.evaluations.push(event); }
  async getTrace(executionId: string) {
    return {
      decisions: this.decisions.filter((d) => d.executionId === executionId),
      evaluations: this.evaluations.filter((e) => e.executionId === executionId),
      events: this.events.get(executionId) ?? [],
      outcome: this.outcomes.get(executionId) ?? null,
    };
  }
}

const incident: IncidentContext = {
  workflowType: "incident_response",
  service: "checkout-worker",
  failureMode: "SATURATED_DEPENDENCY",
  fleetSize: "LARGE",
  environmentVersion: "prod-v9",
};

const executionContext = {
  agentId: "incident-agent",
  workflowType: incident.workflowType,
  intent: "Restore checkout processing without triggering a secondary overload",
  context: incident,
  constraints: { avoidSecondaryIncident: true, preserveQueueIntegrity: true },
  environmentVersion: incident.environmentVersion,
  toolVersion: "opsctl-5.1.0",
} as const;

describe("incident recovery execution memory", () => {
  it("remembers degraded recovery quality and changes the later mitigation", async () => {
    const store = new IncidentStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const source = await runtime.startExecution(executionContext);
    const emptyRecall = await runtime.recall({ executionId: source.executionId, query: "dependency saturation restart thundering herd" });
    expect(emptyRecall.candidates).toHaveLength(0);
    const sourceChoice = decideRecoveryStrategy({ context: incident, memories: [] });
    expect(sourceChoice.strategy).toBe("RESTART_ALL");
    await runtime.recordDecision({
      executionId: source.executionId,
      decisionType: "INCIDENT_MITIGATION",
      selectedAction: { strategy: sourceChoice.strategy },
      alternatives: [{ strategy: "ISOLATE_DRAIN_STAGED_RESTART" }],
      reasoningSummary: "No prior execution memory constrains the restart-all baseline.",
    });
    const sourceResult = executeRecovery(sourceChoice.strategy, incident);
    expect(sourceResult).toMatchObject({
      status: "PARTIAL",
      secondaryFailure: "THUNDERING_HERD",
      customerImpact: "PROLONGED",
      timeToRecoveryMinutes: 24,
    });
    await runtime.observe({
      executionId: source.executionId,
      type: "PRIMARY_SERVICE_RECOVERED",
      payload: { strategy: sourceChoice.strategy },
      evidenceState: "OBSERVED",
    });
    await runtime.observe({
      executionId: source.executionId,
      type: "SECONDARY_THUNDERING_HERD",
      payload: { strategy: sourceChoice.strategy, customerImpact: sourceResult.customerImpact },
      evidenceState: "OBSERVED",
    });
    const sourceComplete = await runtime.complete({
      executionId: source.executionId,
      status: "PARTIAL",
      summary: "Restart-all restored the fleet but caused a thundering herd and prolonged customer impact.",
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "SUCCESSFUL_RECOVERY",
        summary: "RESTART_ALL under SATURATED_DEPENDENCY restored service but caused THUNDERING_HERD; for comparable large fleets prefer ISOLATE_DRAIN_STAGED_RESTART.",
        evidenceState: "OBSERVED",
        confidence: 0.95,
        details: {
          workflowType: incident.workflowType,
          failureMode: incident.failureMode,
          recoveryStrategy: "RESTART_ALL",
          failedStrategy: "RESTART_ALL",
          secondaryFailure: "THUNDERING_HERD",
          recommendedStrategy: "ISOLATE_DRAIN_STAGED_RESTART",
          customerImpact: sourceResult.customerImpact,
          timeToRecoveryMinutes: sourceResult.timeToRecoveryMinutes,
        },
      }],
    });
    const incidentMemory = sourceComplete.admittedMemories[0]!;

    const control = await runtime.startExecution(executionContext);
    const controlChoice = decideRecoveryStrategy({ context: incident, memories: [] });
    const controlResult = executeRecovery(controlChoice.strategy, incident);
    expect(controlResult).toMatchObject({ status: "PARTIAL", secondaryFailure: "THUNDERING_HERD" });
    await runtime.recordDecision({
      executionId: control.executionId,
      decisionType: "INCIDENT_MITIGATION",
      selectedAction: { strategy: controlChoice.strategy },
      reasoningSummary: "Control excludes execution-memory recall.",
    });
    await runtime.complete({
      executionId: control.executionId,
      status: "PARTIAL",
      summary: "Control repeats restart-all and the secondary thundering herd.",
      evidenceState: "OBSERVED",
    });

    const treatment = await runtime.startExecution(executionContext);
    const recall = await runtime.recall({ executionId: treatment.executionId, query: "dependency saturation restart thundering herd" });
    expect(recall.candidates.map((candidate) => candidate.memory.id)).toContain(incidentMemory.id);
    const choice = decideRecoveryStrategy({
      context: incident,
      memories: recall.candidates.map((candidate) => ({ memory: candidate.memory, finalScore: candidate.score })),
    });
    expect(choice.strategy).toBe("ISOLATE_DRAIN_STAGED_RESTART");
    await runtime.recordDecision({
      executionId: treatment.executionId,
      decisionType: "INCIDENT_MITIGATION",
      selectedAction: { strategy: choice.strategy },
      alternatives: [{ strategy: controlChoice.strategy }],
      reasoningSummary: "Prior recovery restored service but caused a thundering herd, so mitigation is isolated and staged.",
      influences: [{
        memoryId: incidentMemory.id,
        retrievalId: recall.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "The remembered secondary failure and prolonged impact changed the recovery strategy.",
        relevance: 0.96,
        counterfactual: {
          action: { strategy: controlChoice.strategy },
          source: "CONTROL_RUN",
          evidenceState: "OBSERVED",
          explanation: "The same-context control omitted recall, repeated RESTART_ALL, and reproduced the thundering herd.",
          comparisonExecutionId: control.executionId,
        },
      }],
    });
    const treatmentResult = executeRecovery(choice.strategy, incident);
    expect(treatmentResult).toMatchObject({
      status: "SUCCESS",
      customerImpact: "CONTAINED",
      timeToRecoveryMinutes: 9,
    });
    await runtime.observe({
      executionId: treatment.executionId,
      type: "INCIDENT_RECOVERED_CLEANLY",
      payload: { strategy: choice.strategy, customerImpact: treatmentResult.customerImpact },
      evidenceState: "OBSERVED",
    });
    await runtime.complete({
      executionId: treatment.executionId,
      status: "SUCCESS",
      summary: "Isolation, drain, and staged restart restored service without a thundering herd.",
      result: {
        customerImpact: treatmentResult.customerImpact,
        timeToRecoveryMinutes: treatmentResult.timeToRecoveryMinutes,
      },
      evidenceState: "OBSERVED",
    });

    const trace = await runtime.trace(treatment.executionId) as {
      decisions: RuntimeDecisionRecord[];
      evaluations: RuntimeEvaluationEvent[];
      outcome: Outcome;
    };
    expect(trace.outcome.status).toBe("SUCCESS");
    expect(trace.decisions[0]?.influences[0]?.influenceType).toBe("CHANGED_ACTION");
    expect(trace.evaluations.some((event) => event.eventType === "INFLUENCE_ACCEPTED")).toBe(true);
  });
});
