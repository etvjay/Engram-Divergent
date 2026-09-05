import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MemoryRecall } from "../../packages/core/src/protocol.js";
import type { ExecutionContext, ExecutionEvent, MemorySearchInput, OperationalMemory, Outcome } from "../../packages/memory-core/src/domain.js";
import {
  decideCoordinationStrategy,
  executeCoordination,
  type CoordinationContext,
} from "../../packages/scenarios/multi-agent-coordination/src/index.js";
import { DEFAULT_RUNTIME_POLICIES } from "../../packages/runtime/src/defaults.js";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import type { EngramRuntimeStore } from "../../packages/runtime/src/store.js";
import type {
  RecallExposureUpdate,
  RuntimeDecisionRecord,
  RuntimeEvaluationEvent,
  RuntimeExecutionRecord,
} from "../../packages/runtime/src/types.js";

class CoordinationMemoryStore implements EngramRuntimeStore {
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

const coordinationContext: CoordinationContext = {
  workflowType: "multi_agent_coordination",
  resourceClass: "SHARED_MUTABLE_ARTIFACT",
  contentionMode: "SAME_TARGET",
  environmentVersion: "coord-v1",
};

const executionContext = {
  agentId: "coordinator-agent",
  workflowType: coordinationContext.workflowType,
  intent: "Coordinate two workers updating the same shared artifact without losing either contribution",
  context: coordinationContext,
  constraints: {
    workers: ["worker-a", "worker-b"],
    preserveBothContributions: true,
  },
  environmentVersion: coordinationContext.environmentVersion,
  toolVersion: "coordinator-1.0.0",
} as const;

describe("coordinator-owned multi-agent execution memory", () => {
  it("remembers a worker race and changes a later comparable dispatch strategy without cross-agent memory sharing", async () => {
    const store = new CoordinationMemoryStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const source = await runtime.startExecution(executionContext);
    const emptyRecall = await runtime.recall({
      executionId: source.executionId,
      query: "two workers same target concurrent write conflict coordination",
    });
    expect(emptyRecall.candidates).toHaveLength(0);

    const sourceDecision = decideCoordinationStrategy({ context: coordinationContext, memories: [] });
    expect(sourceDecision.strategy).toBe("PARALLEL_UNLEASED");
    await runtime.recordDecision({
      executionId: source.executionId,
      decisionType: "COORDINATION_STRATEGY",
      selectedAction: { strategy: sourceDecision.strategy },
      alternatives: [{ strategy: "LEASED_SERIALIZATION" }],
      reasoningSummary: "No prior coordinator execution memory constrains parallel dispatch.",
    });

    const sourceResult = executeCoordination(sourceDecision.strategy, coordinationContext);
    expect(sourceResult).toMatchObject({ status: "PARTIAL", conflictType: "CONCURRENT_WRITE_CONFLICT" });
    await runtime.observe({
      executionId: source.executionId,
      type: "WORKER_RESULTS",
      payload: { workers: sourceResult.workerResults, strategy: sourceDecision.strategy },
      evidenceState: "OBSERVED",
    });
    await runtime.observe({
      executionId: source.executionId,
      type: "CONCURRENT_WRITE_CONFLICT",
      payload: {
        resourceClass: coordinationContext.resourceClass,
        contentionMode: coordinationContext.contentionMode,
        conflictedWorker: "worker-b",
      },
      evidenceState: "OBSERVED",
    });

    const completedSource = await runtime.complete({
      executionId: source.executionId,
      status: "PARTIAL",
      failureType: "CONCURRENT_WRITE_CONFLICT",
      summary: "Parallel unleased dispatch allowed two workers to race on the same shared mutable target; one contribution conflicted.",
      result: sourceResult,
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "UNEXPECTED_FAILURE",
        summary: "CONCURRENT_WRITE_CONFLICT: PARALLEL_UNLEASED workers raced on the same shared mutable artifact; for comparable coordination use LEASED_SERIALIZATION.",
        evidenceState: "OBSERVED",
        confidence: 0.96,
        details: {
          workflowType: coordinationContext.workflowType,
          failureType: "CONCURRENT_WRITE_CONFLICT",
          resourceClass: coordinationContext.resourceClass,
          contentionMode: coordinationContext.contentionMode,
          failedStrategy: "PARALLEL_UNLEASED",
          recommendedStrategy: "LEASED_SERIALIZATION",
          workerIds: ["worker-a", "worker-b"],
          memoryOwner: "coordinator-agent",
        },
      }],
    });
    const coordinationMemory = completedSource.admittedMemories[0]!;
    expect(coordinationMemory.agentId).toBe("coordinator-agent");

    const control = await runtime.startExecution(executionContext);
    const controlDecision = decideCoordinationStrategy({ context: coordinationContext, memories: [] });
    const controlResult = executeCoordination(controlDecision.strategy, coordinationContext);
    expect(controlResult.status).toBe("PARTIAL");
    await runtime.recordDecision({
      executionId: control.executionId,
      decisionType: "COORDINATION_STRATEGY",
      selectedAction: { strategy: controlDecision.strategy },
      reasoningSummary: "Control deliberately excludes coordinator execution-memory recall.",
    });
    await runtime.complete({
      executionId: control.executionId,
      status: "PARTIAL",
      failureType: "CONCURRENT_WRITE_CONFLICT",
      summary: "Memory-free control repeats the parallel worker race.",
      result: controlResult,
      evidenceState: "OBSERVED",
    });

    const treatment = await runtime.startExecution(executionContext);
    const recall = await runtime.recall({
      executionId: treatment.executionId,
      query: "two workers same target concurrent write conflict coordination",
    });
    expect(recall.candidates.map((candidate) => candidate.memory.id)).toContain(coordinationMemory.id);
    expect(recall.candidates.every((candidate) => candidate.memory.agentId === "coordinator-agent")).toBe(true);

    const treatmentDecision = decideCoordinationStrategy({
      context: coordinationContext,
      memories: recall.candidates.map((candidate) => ({ memory: candidate.memory, finalScore: candidate.score })),
    });
    expect(treatmentDecision.strategy).toBe("LEASED_SERIALIZATION");

    await runtime.recordDecision({
      executionId: treatment.executionId,
      decisionType: "COORDINATION_STRATEGY",
      selectedAction: { strategy: treatmentDecision.strategy },
      alternatives: [{ strategy: controlDecision.strategy }],
      reasoningSummary: "Prior coordinator-owned race memory changes dispatch to lease and serialize commits.",
      influences: [{
        memoryId: coordinationMemory.id,
        retrievalId: recall.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "The remembered same-target worker conflict changed the coordinator's dispatch strategy.",
        relevance: 0.98,
        counterfactual: {
          action: { strategy: controlDecision.strategy },
          source: "CONTROL_RUN",
          evidenceState: "OBSERVED",
          explanation: "The same-context coordinator control omitted recall, repeated PARALLEL_UNLEASED, and reproduced the write conflict.",
          comparisonExecutionId: control.executionId,
        },
      }],
    });

    const treatmentResult = executeCoordination(treatmentDecision.strategy, coordinationContext);
    expect(treatmentResult.status).toBe("SUCCESS");
    expect(treatmentResult.workerResults.every((worker) => worker.state === "COMMITTED")).toBe(true);
    await runtime.observe({
      executionId: treatment.executionId,
      type: "WORKERS_COMMITTED_WITH_LEASE",
      payload: { workers: treatmentResult.workerResults, strategy: treatmentDecision.strategy },
      evidenceState: "OBSERVED",
    });
    await runtime.complete({
      executionId: treatment.executionId,
      status: "SUCCESS",
      summary: "Lease-based serialization preserved both worker contributions without a concurrent write conflict.",
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
