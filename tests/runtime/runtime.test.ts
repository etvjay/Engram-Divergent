import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MemoryRecall } from "../../packages/core/src/protocol.js";
import type {
  ExecutionContext,
  ExecutionEvent,
  MemorySearchInput,
  MemorySearchResult,
  OperationalMemory,
  Outcome,
} from "../../packages/memory-core/src/domain.js";
import { MEMORY_POLICY_CONTRACT_VERSION } from "../../packages/policy/src/contracts.js";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import type { EngramRuntimeStore } from "../../packages/runtime/src/store.js";
import type {
  RecallExposureUpdate,
  RuntimeDecisionRecord,
  RuntimeEvaluationEvent,
  RuntimeExecutionRecord,
  RuntimePolicyBundle,
} from "../../packages/runtime/src/types.js";

const policies: RuntimePolicyBundle = {
  admission: {
    contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
    policyVersion: "admission-v1",
    admitOn: ["UNEXPECTED_FAILURE", "SUCCESSFUL_RECOVERY", "HUMAN_CORRECTION"],
    minimumEvidence: "OBSERVED",
  },
  retrieval: {
    contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
    policyVersion: "retrieval-v1",
    maxCandidates: 8,
    minimumScore: 0.6,
    requireEnvironmentMatch: true,
    allowExpired: false,
  },
  influence: {
    contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
    policyVersion: "influence-v1",
    allowedEvidenceStates: ["VERIFIED", "OBSERVED"],
    minimumConfidence: 0.8,
    requireCounterfactualForChangedAction: true,
  },
  expiry: {
    contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
    policyVersion: "expiry-v1",
    invalidateOnEnvironmentChange: true,
    invalidateOnToolMajorVersionChange: true,
  },
};

class InMemoryRuntimeStore implements EngramRuntimeStore {
  executions = new Map<string, RuntimeExecutionRecord>();
  memories = new Map<string, OperationalMemory>();
  events: ExecutionEvent[] = [];
  outcomes: Outcome[] = [];
  decisions: RuntimeDecisionRecord[] = [];
  evaluations: RuntimeEvaluationEvent[] = [];
  recalls = new Map<string, MemoryRecall>();
  searches = new Map<string, MemorySearchResult>();

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
    return { executionId: id };
  }

  async getExecution(executionId: string) {
    return this.executions.get(executionId) ?? null;
  }

  async appendEvent(event: ExecutionEvent) {
    this.events.push(event);
  }

  async recordOutcome(outcome: Outcome) {
    this.outcomes.push(outcome);
    const execution = this.executions.get(outcome.executionId)!;
    execution.status = outcome.status;
    execution.completedAt = new Date();
  }

  async searchMemory(input: MemorySearchInput): Promise<MemorySearchResult> {
    const retrievalId = randomUUID();
    const candidates = [...this.memories.values()]
      .filter((memory) => memory.agentId === input.agentId)
      .map((memory, index) => ({
        memoryId: memory.id,
        memory,
        semanticScore: 0.95,
        contextScore: 1,
        outcomeScore: 1,
        confidenceScore: memory.confidence,
        recencyScore: 1,
        finalScore: 0.95,
        rank: index + 1,
      }));
    const result = { retrievalId, candidates };
    this.searches.set(retrievalId, result);
    return result;
  }

  async getMemory(memoryId: string) {
    return this.memories.get(memoryId) ?? null;
  }

  async persistMemory(memory: OperationalMemory, _sourceExecutionIds: string[]) {
    this.memories.set(memory.id, memory);
  }

  async getRecalls(executionId: string) {
    return [...this.recalls.values()].filter((recall) => recall.executionId === executionId);
  }

  async updateRecallExposure(update: RecallExposureUpdate) {
    const memoryStateById = new Map(update.exposedMemoryStates.map((state) => [state.memoryId, state.memoryStateDigest]));
    const search = this.searches.get(update.retrievalId)!;
    const executionId = [...this.executions.values()].find((execution) => execution.status === "RUNNING")!.id;
    this.recalls.set(update.retrievalId, {
      id: update.retrievalId,
      executionId,
      query: "test recall",
      policyVersion: policies.retrieval.policyVersion,
      recalledAt: new Date(),
      candidates: search.candidates
        .filter((candidate) => update.exposedMemoryIds.includes(candidate.memory.id))
        .map((candidate, index) => ({
          retrievalId: update.retrievalId,
          memoryId: candidate.memory.id,
          memoryStateDigest: memoryStateById.get(candidate.memory.id),
          rank: index + 1,
          score: candidate.finalScore,
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
      events: this.events.filter((event) => event.executionId === executionId),
      decisions: this.decisions.filter((decision) => decision.executionId === executionId),
      outcome: this.outcomes.find((outcome) => outcome.executionId === executionId) ?? null,
      evaluations: this.evaluations.filter((event) => event.executionId === executionId),
    };
  }
}

function seedMemory(store: InMemoryRuntimeStore, overrides: Partial<OperationalMemory> = {}) {
  const memory: OperationalMemory = {
    id: randomUUID(),
    agentId: "deployment-agent",
    memoryType: "UNEXPECTED_FAILURE",
    summary: "Dependency X failed under the production Node 22 environment.",
    structuredContext: { workflowType: "deployment", dependency: "X" },
    confidence: 0.92,
    evidenceState: "OBSERVED",
    validFrom: new Date(Date.now() - 60_000),
    environmentVersion: "prod-v1",
    toolVersion: "22.1.0",
    policyVersion: "admission-v1",
    ...overrides,
  };
  store.memories.set(memory.id, memory);
  return memory;
}

async function start(runtime: EngramRuntime) {
  return runtime.startExecution({
    agentId: "deployment-agent",
    workflowType: "deployment",
    intent: "Deploy API safely",
    context: { service: "api" },
    constraints: { environment: "production" },
    environmentVersion: "prod-v1",
    toolVersion: "22.2.0",
    policyVersion: "agent-policy-v1",
  });
}

describe("Engram runtime", () => {
  it("persists recall separately from influence and accepts a traced influence", async () => {
    const store = new InMemoryRuntimeStore();
    const memory = seedMemory(store);
    const runtime = new EngramRuntime(store, policies);
    const { executionId } = await start(runtime);

    const recalled = await runtime.recall({ executionId, query: "deployment failures in this environment" });
    expect(recalled.recall.candidates.map((candidate) => candidate.memoryId)).toEqual([memory.id]);
    expect(store.decisions).toHaveLength(0);

    const decision = await runtime.recordDecision({
      executionId,
      decisionType: "DEPLOYMENT_STRATEGY",
      selectedAction: { strategy: "pin-safe-version" },
      alternatives: [{ strategy: "latest" }],
      reasoningSummary: "Prior execution evidence makes the baseline dependency choice unsafe.",
      influences: [{
        memoryId: memory.id,
        retrievalId: recalled.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "Prior dependency failure changed the deployment strategy.",
        relevance: 0.95,
        counterfactual: {
          action: { strategy: "latest" },
          source: "APPLICATION_DECLARED",
          evidenceState: "OBSERVED",
          explanation: "Application recorded its memory-free baseline before recall was applied.",
        },
      }],
    });

    expect(decision.influences[0]?.memoryId).toBe(memory.id);
    expect(store.evaluations.some((event) => event.eventType === "INFLUENCE_ACCEPTED")).toBe(true);
  });

  it("rejects influence that was never recalled", async () => {
    const store = new InMemoryRuntimeStore();
    const memory = seedMemory(store);
    const runtime = new EngramRuntime(store, policies);
    const { executionId } = await start(runtime);

    await expect(runtime.recordDecision({
      executionId,
      decisionType: "DEPLOYMENT_STRATEGY",
      selectedAction: { strategy: "pin-safe-version" },
      reasoningSummary: "Should be rejected.",
      influences: [{
        memoryId: memory.id,
        influenceType: "SUPPORTED_ACTION",
        summary: "Unrecalled memory should not be accepted.",
      }],
    })).rejects.toThrow(/INFLUENCE_WITHOUT_RECALL/);

    expect(store.evaluations.some((event) => event.eventType === "INFLUENCE_REJECTED")).toBe(true);
  });

  it("filters stale environment memory before exposure", async () => {
    const store = new InMemoryRuntimeStore();
    const memory = seedMemory(store, { environmentVersion: "prod-v0" });
    const runtime = new EngramRuntime(store, policies);
    const { executionId } = await start(runtime);

    const recalled = await runtime.recall({ executionId, query: "deployment failures" });
    expect(recalled.recall.candidates).toHaveLength(0);
    expect(recalled.rejected[0]?.memoryId).toBe(memory.id);
    expect(recalled.rejected[0]?.reasons).toContain("ENVIRONMENT_MISMATCH");
  });

  it("admits policy-approved operational experience on completion", async () => {
    const store = new InMemoryRuntimeStore();
    const runtime = new EngramRuntime(store, policies);
    const { executionId } = await start(runtime);

    const result = await runtime.complete({
      executionId,
      status: "FAILURE",
      summary: "Deployment failed because dependency X was unavailable.",
      failureType: "DEPENDENCY_UNAVAILABLE",
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "UNEXPECTED_FAILURE",
        summary: "Dependency X became unavailable during production deployment.",
        evidenceState: "OBSERVED",
        details: { dependency: "X", failureType: "DEPENDENCY_UNAVAILABLE" },
      }],
    });

    expect(result.admittedMemories).toHaveLength(1);
    expect(result.admittedMemories[0]?.memoryType).toBe("UNEXPECTED_FAILURE");
    expect(store.executions.get(executionId)?.status).toBe("FAILURE");
  });
});
