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

type DeploymentStrategy = "DIRECT_MIGRATION" | "EXPAND_CONTRACT";

type DeploymentResult = {
  status: "SUCCESS" | "COMPENSATED";
  failureType?: "MIGRATION_LOCK_TIMEOUT";
  recovery?: "ROLLBACK_SCHEMA_CHANGE";
};

function decideDeployment(memories: OperationalMemory[]): DeploymentStrategy {
  return memories.some((memory) =>
    memory.summary.includes("MIGRATION_LOCK_TIMEOUT") &&
    memory.summary.includes("EXPAND_CONTRACT"),
  )
    ? "EXPAND_CONTRACT"
    : "DIRECT_MIGRATION";
}

function executeDeployment(strategy: DeploymentStrategy): DeploymentResult {
  if (strategy === "DIRECT_MIGRATION") {
    return {
      status: "COMPENSATED",
      failureType: "MIGRATION_LOCK_TIMEOUT",
      recovery: "ROLLBACK_SCHEMA_CHANGE",
    };
  }
  return { status: "SUCCESS" };
}

class DeploymentMemoryStore implements EngramRuntimeStore {
  readonly executions = new Map<string, RuntimeExecutionRecord>();
  readonly events = new Map<string, ExecutionEvent[]>();
  readonly outcomes = new Map<string, Outcome>();
  readonly memories: OperationalMemory[] = [];
  readonly recalls: MemoryRecall[] = [];
  readonly decisions: RuntimeDecisionRecord[] = [];
  readonly evaluations: RuntimeEvaluationEvent[] = [];
  private readonly pendingRetrievalExecution = new Map<string, string>();
  private readonly pendingRetrievalQuery = new Map<string, string>();

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

  async searchMemory(input: MemorySearchInput) {
    const retrievalId = randomUUID();
    if (!input.executionId) throw new Error("executionId is required for this scenario store");
    this.pendingRetrievalExecution.set(retrievalId, input.executionId);
    this.pendingRetrievalQuery.set(retrievalId, input.query);

    const candidates = this.memories
      .filter((memory) => memory.agentId === input.agentId)
      .map((memory, index) => ({
        memoryId: memory.id,
        memory,
        semanticScore: 0.97 - index * 0.01,
        contextScore: 1,
        outcomeScore: 1,
        confidenceScore: memory.confidence,
        recencyScore: 1,
        finalScore: 0.97 - index * 0.01,
        rank: index + 1,
      }));

    return { retrievalId, candidates };
  }

  async getMemory(memoryId: string) {
    return this.memories.find((memory) => memory.id === memoryId) ?? null;
  }

  async persistMemory(memory: OperationalMemory, _sourceExecutionIds: string[]) {
    this.memories.push(memory);
  }

  async getRecalls(executionId: string) {
    return this.recalls.filter((recall) => recall.executionId === executionId);
  }

  async updateRecallExposure(update: RecallExposureUpdate) {
    const memoryStateById = new Map(update.exposedMemoryStates.map((state) => [state.memoryId, state.memoryStateDigest]));
    const executionId = this.pendingRetrievalExecution.get(update.retrievalId);
    if (!executionId) throw new Error("Unknown retrieval");
    this.recalls.push({
      id: update.retrievalId,
      executionId,
      query: this.pendingRetrievalQuery.get(update.retrievalId) ?? "unknown",
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

const comparableDeployment = {
  agentId: "deployment-agent",
  workflowType: "production_schema_deployment",
  intent: "Deploy schema change without extended write outage",
  context: {
    service: "billing-api",
    database: "ledger",
    trafficClass: "high-write",
  },
  constraints: {
    maxWritePauseSeconds: 5,
    rollbackRequired: true,
  },
  environmentVersion: "prod-v4",
  toolVersion: "deployctl-3.2.1",
} as const;

describe("deployment recovery execution memory", () => {
  it("reuses a prior recovery lesson to change a comparable later deployment strategy", async () => {
    const store = new DeploymentMemoryStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    // Run A: no relevant execution memory exists yet.
    const runA = await runtime.startExecution(comparableDeployment);
    const initialRecall = await runtime.recall({
      executionId: runA.executionId,
      query: "production schema deployment lock and rollback experience",
    });
    expect(initialRecall.candidates).toHaveLength(0);

    const runAStrategy = decideDeployment([]);
    expect(runAStrategy).toBe("DIRECT_MIGRATION");
    await runtime.recordDecision({
      executionId: runA.executionId,
      decisionType: "DEPLOYMENT_STRATEGY",
      selectedAction: { strategy: runAStrategy },
      alternatives: [{ strategy: "EXPAND_CONTRACT" }],
      reasoningSummary: "No prior execution memory constrained the direct migration strategy.",
    });

    const runAResult = executeDeployment(runAStrategy);
    expect(runAResult).toEqual({
      status: "COMPENSATED",
      failureType: "MIGRATION_LOCK_TIMEOUT",
      recovery: "ROLLBACK_SCHEMA_CHANGE",
    });
    await runtime.observe({
      executionId: runA.executionId,
      type: "MIGRATION_LOCK_TIMEOUT",
      payload: { strategy: runAStrategy, lockWaitSeconds: 8 },
      evidenceState: "OBSERVED",
    });
    await runtime.observe({
      executionId: runA.executionId,
      type: "ROLLBACK_COMPLETED",
      payload: { recovery: runAResult.recovery },
      evidenceState: "OBSERVED",
    });
    const completedA = await runtime.complete({
      executionId: runA.executionId,
      status: "COMPENSATED",
      failureType: runAResult.failureType,
      summary: "Direct schema migration exceeded the write-lock budget and was rolled back.",
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "SUCCESSFUL_RECOVERY",
        summary: "MIGRATION_LOCK_TIMEOUT under high-write production traffic was recovered by ROLLBACK_SCHEMA_CHANGE; prefer EXPAND_CONTRACT for comparable deployments.",
        evidenceState: "OBSERVED",
        confidence: 0.94,
        details: {
          failedStrategy: "DIRECT_MIGRATION",
          recovery: "ROLLBACK_SCHEMA_CHANGE",
          recommendedStrategy: "EXPAND_CONTRACT",
          service: "billing-api",
        },
      }],
    });
    expect(completedA.admittedMemories).toHaveLength(1);
    const recoveryMemory = completedA.admittedMemories[0]!;

    // Control: same future context, but recall is deliberately disabled.
    const control = await runtime.startExecution(comparableDeployment);
    const controlStrategy = decideDeployment([]);
    expect(controlStrategy).toBe("DIRECT_MIGRATION");
    await runtime.recordDecision({
      executionId: control.executionId,
      decisionType: "DEPLOYMENT_STRATEGY",
      selectedAction: { strategy: controlStrategy },
      alternatives: [{ strategy: "EXPAND_CONTRACT" }],
      reasoningSummary: "Control run intentionally excludes execution-memory recall.",
    });
    const controlResult = executeDeployment(controlStrategy);
    expect(controlResult.status).toBe("COMPENSATED");
    await runtime.complete({
      executionId: control.executionId,
      status: controlResult.status,
      failureType: controlResult.failureType,
      summary: "Control repeated the direct migration and reproduced the lock failure.",
      evidenceState: "OBSERVED",
    });

    // Treatment: same task/context, with execution memory enabled.
    const treatment = await runtime.startExecution(comparableDeployment);
    const treatmentRecall = await runtime.recall({
      executionId: treatment.executionId,
      query: "production schema deployment lock and rollback experience",
    });
    expect(treatmentRecall.candidates.map((candidate) => candidate.memory.id)).toContain(recoveryMemory.id);

    const treatmentStrategy = decideDeployment(treatmentRecall.candidates.map((candidate) => candidate.memory));
    expect(treatmentStrategy).toBe("EXPAND_CONTRACT");

    const treatmentDecision = await runtime.recordDecision({
      executionId: treatment.executionId,
      decisionType: "DEPLOYMENT_STRATEGY",
      selectedAction: { strategy: treatmentStrategy },
      alternatives: [{ strategy: "DIRECT_MIGRATION" }],
      reasoningSummary: "Prior rollback experience makes expand/contract safer under the same write-lock constraint.",
      influences: [{
        memoryId: recoveryMemory.id,
        retrievalId: treatmentRecall.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "The prior migration-lock recovery changed the selected deployment strategy.",
        relevance: 0.97,
        counterfactual: {
          action: { strategy: controlStrategy },
          source: "CONTROL_RUN",
          evidenceState: "OBSERVED",
          explanation: "A same-context control execution with recall disabled selected DIRECT_MIGRATION and reproduced MIGRATION_LOCK_TIMEOUT.",
          comparisonExecutionId: control.executionId,
        },
      }],
    });
    expect(treatmentDecision.influences[0]?.memoryId).toBe(recoveryMemory.id);
    expect(treatmentDecision.influences[0]?.counterfactual?.comparisonExecutionId).toBe(control.executionId);

    const treatmentResult = executeDeployment(treatmentStrategy);
    expect(treatmentResult.status).toBe("SUCCESS");
    await runtime.observe({
      executionId: treatment.executionId,
      type: "DEPLOYMENT_COMPLETED",
      payload: { strategy: treatmentStrategy, writePauseSeconds: 1 },
      evidenceState: "OBSERVED",
    });
    await runtime.complete({
      executionId: treatment.executionId,
      status: "SUCCESS",
      summary: "Expand/contract deployment completed within the write-pause constraint.",
      result: { strategy: treatmentStrategy, writePauseSeconds: 1 },
      evidenceState: "OBSERVED",
    });

    const treatmentTrace = await runtime.trace(treatment.executionId) as {
      decisions: RuntimeDecisionRecord[];
      evaluations: RuntimeEvaluationEvent[];
      outcome: Outcome;
    };
    expect(treatmentTrace.outcome.status).toBe("SUCCESS");
    expect(treatmentTrace.decisions[0]?.influences[0]?.influenceType).toBe("CHANGED_ACTION");
    expect(treatmentTrace.evaluations.some((event) => event.eventType === "INFLUENCE_ACCEPTED")).toBe(true);
  });
});
