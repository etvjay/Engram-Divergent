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
import type { MemoryRelationship } from "../../packages/evaluation/src/domain.js";
import { RelationshipMemoryEligibilityAdvisor } from "../../packages/evaluation/src/eligibility-advisor.js";
import {
  decideEvolutionStrategy,
  executeEvolution,
  type EvolutionContext,
} from "../../packages/scenarios/environment-evolution/src/index.js";
import { DEFAULT_RUNTIME_POLICIES } from "../../packages/runtime/src/defaults.js";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import type { EngramRuntimeStore } from "../../packages/runtime/src/store.js";
import type {
  RecallExposureUpdate,
  RuntimeDecisionRecord,
  RuntimeEvaluationEvent,
  RuntimeExecutionRecord,
} from "../../packages/runtime/src/types.js";

class EvolutionStore implements EngramRuntimeStore {
  executions = new Map<string, RuntimeExecutionRecord>();
  memories: OperationalMemory[] = [];
  sources = new Map<string, string[]>();
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
  async persistMemory(memory: OperationalMemory, sourceExecutionIds: string[]) {
    this.memories.push(memory);
    this.sources.set(memory.id, [...sourceExecutionIds]);
  }
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
          semanticScore: 0.99 - index * 0.01,
          contextScore: 1,
          outcomeScore: 1,
          confidenceScore: memory.confidence,
          recencyScore: 1,
          finalScore: 0.99 - index * 0.01,
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
        score: 0.99 - index * 0.01,
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

class RelationshipStore {
  relationships: MemoryRelationship[] = [];
  async listRelationships(memoryId: string) {
    return this.relationships.filter((relationship) =>
      relationship.leftMemoryId === memoryId || relationship.rightMemoryId === memoryId,
    );
  }
}

function supersedes(newer: string, older: string): MemoryRelationship {
  return {
    id: randomUUID(),
    leftMemoryId: newer,
    rightMemoryId: older,
    relation: "SUPERSEDES",
    rationale: "Observed current-environment recovery evidence explicitly replaces the earlier compatible strategy.",
    evidenceState: "OBSERVED",
    method: "HUMAN_ASSESSMENT",
    assessedAt: new Date(),
  };
}

function context(environmentVersion: string, toolVersion: string): EvolutionContext {
  return {
    workflowType: "environment_evolution",
    environmentVersion,
    toolVersion,
    changeClass: "MAJOR_RUNTIME_UPGRADE",
  };
}

function executionContext(env: EvolutionContext) {
  return {
    agentId: "evolution-agent",
    workflowType: env.workflowType,
    intent: "Execute the runtime upgrade with current operational guidance",
    context: env,
    constraints: { preserveHistory: true, minimizeRollback: true },
    environmentVersion: env.environmentVersion,
    toolVersion: env.toolVersion,
  } as const;
}

describe("memory invalidation and supersession", () => {
  it("keeps obsolete memories historical while exposing only current authority", async () => {
    const store = new EvolutionStore();
    const relationships = new RelationshipStore();
    const advisor = new RelationshipMemoryEligibilityAdvisor(relationships, {
      supersededMemoryStages: ["RECALL", "INFLUENCE"],
    });
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES, undefined, advisor);

    // Historical environment: a once-valid compatibility lesson.
    const v1 = context("runtime-v1", "1.8.0");
    const sourceV1 = await runtime.startExecution(executionContext(v1));
    const completeV1 = await runtime.complete({
      executionId: sourceV1.executionId,
      status: "SUCCESS",
      summary: "Compatibility mode was valid for runtime-v1.",
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "NOVEL_CONDITION",
        summary: "For runtime-v1 major upgrades, compatibility mode is a safe strategy.",
        evidenceState: "OBSERVED",
        confidence: 0.95,
        details: {
          workflowType: v1.workflowType,
          changeClass: v1.changeClass,
          recommendedStrategy: "COMPAT_MODE",
        },
      }],
    });
    const environmentObsolete = completeV1.admittedMemories[0]!;

    // Current environment initially produced another compatibility lesson.
    const v2 = context("runtime-v2", "2.1.0");
    const initialV2 = await runtime.startExecution(executionContext(v2));
    const completeInitialV2 = await runtime.complete({
      executionId: initialV2.executionId,
      status: "PARTIAL",
      summary: "Compatibility mode completed but still required rollback under runtime-v2.",
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "NOVEL_CONDITION",
        summary: "Initial runtime-v2 evidence still suggested compatibility mode.",
        evidenceState: "OBSERVED",
        confidence: 0.9,
        details: {
          workflowType: v2.workflowType,
          changeClass: v2.changeClass,
          recommendedStrategy: "COMPAT_MODE",
        },
      }],
    });
    const supersededCompatible = completeInitialV2.admittedMemories[0]!;

    // Newer current-environment recovery evidence establishes the replacement strategy.
    const recoveryV2 = await runtime.startExecution(executionContext(v2));
    const completeRecoveryV2 = await runtime.complete({
      executionId: recoveryV2.executionId,
      status: "SUCCESS",
      summary: "A staged current-runtime rollout succeeded without rollback.",
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "SUCCESSFUL_RECOVERY",
        summary: "For runtime-v2, staged current-runtime rollout replaces compatibility mode.",
        evidenceState: "OBSERVED",
        confidence: 0.97,
        details: {
          workflowType: v2.workflowType,
          changeClass: v2.changeClass,
          recommendedStrategy: "STAGED_CURRENT",
        },
      }],
    });
    const current = completeRecoveryV2.admittedMemories[0]!;
    relationships.relationships.push(supersedes(current.id, supersededCompatible.id));

    // Same-context control excludes memory and repeats the compatibility-mode rollback.
    const control = await runtime.startExecution(executionContext(v2));
    const controlDecision = decideEvolutionStrategy({ context: v2, memories: [] });
    const controlResult = executeEvolution(controlDecision.strategy);
    expect(controlResult).toMatchObject({ status: "PARTIAL", strategy: "COMPAT_MODE", rollbackRequired: true });
    await runtime.recordDecision({
      executionId: control.executionId,
      decisionType: "UPGRADE_STRATEGY",
      selectedAction: { strategy: controlDecision.strategy },
      reasoningSummary: "Memory-free control uses the default compatibility strategy.",
    });
    await runtime.complete({
      executionId: control.executionId,
      status: controlResult.status,
      summary: "Control repeated the compatibility-mode rollback.",
      result: controlResult,
      evidenceState: "OBSERVED",
    });

    // Treatment sees all history as candidates, but only current authority is exposed.
    const treatment = await runtime.startExecution(executionContext(v2));
    const recall = await runtime.recall({
      executionId: treatment.executionId,
      query: "runtime upgrade strategy under major environment change",
    });

    expect(store.memories.map((memory) => memory.id)).toEqual(expect.arrayContaining([
      environmentObsolete.id,
      supersededCompatible.id,
      current.id,
    ]));
    expect(recall.candidates.map((candidate) => candidate.memory.id)).toEqual([current.id]);

    const envRejected = recall.rejected.find((item) => item.memoryId === environmentObsolete.id);
    expect(envRejected?.reasons).toContain("INVALIDATED_ENVIRONMENT_CHANGE");
    expect(envRejected?.reasons).toContain("INVALIDATED_TOOL_MAJOR_VERSION_CHANGE");

    const supersededRejected = recall.rejected.find((item) => item.memoryId === supersededCompatible.id);
    expect(supersededRejected?.reasons).toContain("MEMORY_SUPERSEDED");

    const decision = decideEvolutionStrategy({
      context: v2,
      memories: recall.candidates.map((candidate) => ({ memory: candidate.memory, finalScore: candidate.score })),
    });
    expect(decision.strategy).toBe("STAGED_CURRENT");

    await runtime.recordDecision({
      executionId: treatment.executionId,
      decisionType: "UPGRADE_STRATEGY",
      selectedAction: { strategy: decision.strategy },
      alternatives: [{ strategy: controlDecision.strategy }],
      reasoningSummary: "Only the current, non-superseded operational lesson is eligible to change the upgrade strategy.",
      influences: [{
        memoryId: current.id,
        retrievalId: recall.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "Current recovery memory changes compatibility mode to staged current rollout.",
        relevance: 0.99,
        counterfactual: {
          action: { strategy: controlDecision.strategy },
          source: "CONTROL_RUN",
          evidenceState: "OBSERVED",
          explanation: "The same-context memory-free control used compatibility mode and required rollback.",
          comparisonExecutionId: control.executionId,
        },
      }],
    });

    const treatmentResult = executeEvolution(decision.strategy);
    expect(treatmentResult).toMatchObject({ status: "SUCCESS", strategy: "STAGED_CURRENT", rollbackRequired: false });
    await runtime.complete({
      executionId: treatment.executionId,
      status: "SUCCESS",
      summary: "Current operational memory selected the staged rollout without deleting obsolete history.",
      result: treatmentResult,
      evidenceState: "OBSERVED",
    });

    const trace = await runtime.trace(treatment.executionId) as {
      decisions: RuntimeDecisionRecord[];
      evaluations: RuntimeEvaluationEvent[];
      outcome: Outcome;
    };
    expect(trace.outcome.status).toBe("SUCCESS");
    expect(trace.decisions[0]?.influences[0]?.memoryId).toBe(current.id);
    expect(trace.decisions[0]?.influences[0]?.counterfactual?.source).toBe("CONTROL_RUN");
    expect(trace.evaluations.some((event) => event.eventType === "RECALL_FILTERED")).toBe(true);
  });
});
