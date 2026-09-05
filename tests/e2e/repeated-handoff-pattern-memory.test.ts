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
import {
  decideHandoffStrategy,
  executeHandoff,
  type HandoffContext,
} from "../../packages/scenarios/handoff-pattern/src/index.js";
import { DEFAULT_RUNTIME_POLICIES } from "../../packages/runtime/src/defaults.js";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import type { EngramRuntimeStore } from "../../packages/runtime/src/store.js";
import type {
  RecallExposureUpdate,
  RuntimeDecisionRecord,
  RuntimeEvaluationEvent,
  RuntimeExecutionRecord,
} from "../../packages/runtime/src/types.js";

class HandoffPatternStore implements EngramRuntimeStore {
  executions = new Map<string, RuntimeExecutionRecord>();
  events = new Map<string, ExecutionEvent[]>();
  outcomes = new Map<string, Outcome>();
  memories: OperationalMemory[] = [];
  memorySources = new Map<string, string[]>();
  recalls: MemoryRecall[] = [];
  decisions: RuntimeDecisionRecord[] = [];
  evaluations: RuntimeEvaluationEvent[] = [];
  private pendingRetrievals = new Map<string, { executionId: string; query: string }>();

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

  async getExecution(executionId: string) {
    return this.executions.get(executionId) ?? null;
  }

  async appendEvent(event: ExecutionEvent) {
    this.events.get(event.executionId)?.push(event);
  }

  async recordOutcome(outcome: Outcome) {
    this.outcomes.set(outcome.executionId, outcome);
    const execution = this.executions.get(outcome.executionId);
    if (execution) {
      execution.status = outcome.status;
      execution.completedAt = new Date();
    }
  }

  async getOutcomeEvidenceState(executionId: string) {
    return this.outcomes.get(executionId)?.evidenceState ?? null;
  }

  async searchMemory(input: MemorySearchInput) {
    const retrievalId = randomUUID();
    if (!input.executionId) throw new Error("executionId required");
    this.pendingRetrievals.set(retrievalId, {
      executionId: input.executionId,
      query: input.query,
    });
    return {
      retrievalId,
      candidates: this.memories
        .filter((memory) => memory.agentId === input.agentId)
        .map((memory, index) => ({
          memoryId: memory.id,
          memory,
          semanticScore: 0.98 - index * 0.01,
          contextScore: 1,
          outcomeScore: 1,
          confidenceScore: memory.confidence,
          recencyScore: 1,
          finalScore: 0.98 - index * 0.01,
          rank: index + 1,
        })),
    };
  }

  async getMemory(memoryId: string) {
    return this.memories.find((memory) => memory.id === memoryId) ?? null;
  }

  async persistMemory(memory: OperationalMemory, sourceExecutionIds: string[]) {
    this.memories.push(memory);
    this.memorySources.set(memory.id, [...sourceExecutionIds]);
  }

  async getRecalls(executionId: string) {
    return this.recalls.filter((recall) => recall.executionId === executionId);
  }

  async updateRecallExposure(update: RecallExposureUpdate) {
    const memoryStateById = new Map(update.exposedMemoryStates.map((state) => [state.memoryId, state.memoryStateDigest]));
    const pending = this.pendingRetrievals.get(update.retrievalId);
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

  async recordRuntimeDecision(decision: RuntimeDecisionRecord) {
    this.decisions.push(decision);
  }

  async appendRuntimeEvaluationEvent(event: RuntimeEvaluationEvent) {
    this.evaluations.push(event);
  }

  async getTrace(executionId: string) {
    return {
      execution: this.executions.get(executionId) ?? null,
      events: this.events.get(executionId) ?? [],
      outcome: this.outcomes.get(executionId) ?? null,
      recalls: this.recalls.filter((recall) => recall.executionId === executionId),
      decisions: this.decisions.filter((decision) => decision.executionId === executionId),
      evaluations: this.evaluations.filter((event) => event.executionId === executionId),
    };
  }
}

const handoffContext: HandoffContext = {
  workflowType: "multi_agent_handoff_pattern",
  rolePair: "PLANNER_EXECUTOR",
  artifactClass: "CHANGE_PLAN",
  constraintVisibility: "IMPLICIT",
  environmentVersion: "handoff-v1",
};

const executionContext = {
  agentId: "handoff-coordinator",
  workflowType: handoffContext.workflowType,
  intent: "Delegate a change plan to an executor with minimal coordination delay",
  context: handoffContext,
  constraints: { outputMustBeAccepted: true },
  environmentVersion: handoffContext.environmentVersion,
  toolVersion: "handoff-agent-1.0.0",
} as const;

async function runMinimalSuccessfulHandoff(runtime: EngramRuntime) {
  const run = await runtime.startExecution(executionContext);
  const decision = decideHandoffStrategy({ context: handoffContext, memories: [] });
  expect(decision.strategy).toBe("MINIMAL_HANDOFF");
  await runtime.recordDecision({
    executionId: run.executionId,
    decisionType: "HANDOFF_STRATEGY",
    selectedAction: { strategy: decision.strategy },
    alternatives: [{ strategy: "CONSTRAINT_COMPLETE_HANDOFF" }],
    reasoningSummary: "No repeated-pattern memory constrains the minimal handoff baseline.",
  });
  const result = executeHandoff(decision.strategy, handoffContext);
  await runtime.observe({
    executionId: run.executionId,
    type: "EXECUTOR_CLARIFICATION_REQUIRED",
    payload: {
      clarificationRounds: result.clarificationRounds,
      coordinationLatencyMinutes: result.coordinationLatencyMinutes,
    },
    evidenceState: "OBSERVED",
  });
  return { run, result };
}

describe("repeated-pattern multi-source execution memory", () => {
  it("uses three successful source executions to change a later comparable handoff", async () => {
    const store = new HandoffPatternStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const sourceA = await runMinimalSuccessfulHandoff(runtime);
    await runtime.complete({
      executionId: sourceA.run.executionId,
      status: "SUCCESS",
      summary: "Output was accepted after two clarification rounds.",
      result: sourceA.result,
      evidenceState: "OBSERVED",
    });

    const sourceB = await runMinimalSuccessfulHandoff(runtime);
    await runtime.complete({
      executionId: sourceB.run.executionId,
      status: "SUCCESS",
      summary: "Second comparable output was accepted after the same clarification pattern.",
      result: sourceB.result,
      evidenceState: "OBSERVED",
    });

    const sourceC = await runMinimalSuccessfulHandoff(runtime);
    const completedC = await runtime.complete({
      executionId: sourceC.run.executionId,
      status: "SUCCESS",
      summary: "Third comparable successful handoff confirmed a recurring clarification pattern.",
      result: sourceC.result,
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "REPEATED_PATTERN",
        summary: "Comparable planner-to-executor change-plan handoffs repeatedly required clarification when constraints were implicit.",
        evidenceState: "OBSERVED",
        confidence: 0.94,
        sourceExecutionIds: [
          sourceA.run.executionId,
          sourceB.run.executionId,
          sourceC.run.executionId,
        ],
        details: {
          pattern: "MISSING_CONSTRAINTS_CAUSES_CLARIFICATION",
          rolePair: handoffContext.rolePair,
          artifactClass: handoffContext.artifactClass,
          constraintVisibility: handoffContext.constraintVisibility,
          baselineStrategy: "MINIMAL_HANDOFF",
          recommendedStrategy: "CONSTRAINT_COMPLETE_HANDOFF",
          observedClarificationRounds: 2,
        },
      }],
    });

    expect(completedC.rejectedSignals).toEqual([]);
    expect(completedC.admittedMemories).toHaveLength(1);
    const patternMemory = completedC.admittedMemories[0]!;
    expect(store.memorySources.get(patternMemory.id)).toEqual([
      sourceA.run.executionId,
      sourceB.run.executionId,
      sourceC.run.executionId,
    ]);
    expect(patternMemory.structuredContext.sourceExecutionIds).toEqual([
      sourceA.run.executionId,
      sourceB.run.executionId,
      sourceC.run.executionId,
    ]);

    const control = await runtime.startExecution(executionContext);
    const controlDecision = decideHandoffStrategy({ context: handoffContext, memories: [] });
    const controlResult = executeHandoff(controlDecision.strategy, handoffContext);
    expect(controlResult).toMatchObject({
      status: "SUCCESS",
      clarificationRounds: 2,
      coordinationLatencyMinutes: 14,
    });
    await runtime.recordDecision({
      executionId: control.executionId,
      decisionType: "HANDOFF_STRATEGY",
      selectedAction: { strategy: controlDecision.strategy },
      reasoningSummary: "Control deliberately excludes execution-memory recall.",
    });
    await runtime.complete({
      executionId: control.executionId,
      status: "SUCCESS",
      summary: "Memory-free control repeated the clarification pattern.",
      result: controlResult,
      evidenceState: "OBSERVED",
    });

    const treatment = await runtime.startExecution(executionContext);
    const recall = await runtime.recall({
      executionId: treatment.executionId,
      query: "planner executor handoff clarification implicit constraints",
    });
    expect(recall.candidates.map((candidate) => candidate.memory.id)).toContain(patternMemory.id);

    const treatmentDecision = decideHandoffStrategy({
      context: handoffContext,
      memories: recall.candidates.map((candidate) => ({
        memory: candidate.memory,
        finalScore: candidate.score,
      })),
    });
    expect(treatmentDecision.strategy).toBe("CONSTRAINT_COMPLETE_HANDOFF");

    await runtime.recordDecision({
      executionId: treatment.executionId,
      decisionType: "HANDOFF_STRATEGY",
      selectedAction: { strategy: treatmentDecision.strategy },
      alternatives: [{ strategy: controlDecision.strategy }],
      reasoningSummary: "Three comparable prior executions established a repeated clarification pattern, so constraints are made explicit before delegation.",
      influences: [{
        memoryId: patternMemory.id,
        retrievalId: recall.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "The multi-source repeated-pattern memory changed the handoff strategy.",
        relevance: 0.98,
        counterfactual: {
          action: { strategy: controlDecision.strategy },
          source: "CONTROL_RUN",
          evidenceState: "OBSERVED",
          explanation: "The same-context control omitted recall and repeated the two-round clarification pattern.",
          comparisonExecutionId: control.executionId,
        },
      }],
    });

    const treatmentResult = executeHandoff(treatmentDecision.strategy, handoffContext);
    expect(treatmentResult).toEqual({
      status: "SUCCESS",
      strategy: "CONSTRAINT_COMPLETE_HANDOFF",
      clarificationRounds: 0,
      coordinationLatencyMinutes: 5,
      outputAccepted: true,
    });
    await runtime.observe({
      executionId: treatment.executionId,
      type: "HANDOFF_ACCEPTED_WITHOUT_CLARIFICATION",
      payload: {
        clarificationRounds: treatmentResult.clarificationRounds,
        coordinationLatencyMinutes: treatmentResult.coordinationLatencyMinutes,
      },
      evidenceState: "OBSERVED",
    });
    await runtime.complete({
      executionId: treatment.executionId,
      status: "SUCCESS",
      summary: "Constraint-complete handoff preserved accepted output while eliminating clarification rounds.",
      result: treatmentResult,
      evidenceState: "OBSERVED",
    });

    const trace = await runtime.trace(treatment.executionId) as {
      decisions: RuntimeDecisionRecord[];
      evaluations: RuntimeEvaluationEvent[];
      outcome: Outcome;
    };
    expect(trace.outcome.status).toBe("SUCCESS");
    expect(trace.decisions[0]?.influences[0]?.memoryId).toBe(patternMemory.id);
    expect(trace.decisions[0]?.influences[0]?.retrievalId).toBe(recall.recall.id);
    expect(trace.decisions[0]?.influences[0]?.counterfactual?.comparisonExecutionId).toBe(control.executionId);
    expect(trace.evaluations.some((event) => event.eventType === "INFLUENCE_ACCEPTED")).toBe(true);
  });
});
