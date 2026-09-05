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
    admitOn: ["UNEXPECTED_FAILURE"],
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
    allowedEvidenceStates: ["OBSERVED", "VERIFIED"],
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

class PersistedStore implements EngramRuntimeStore {
  execution: RuntimeExecutionRecord | null = null;
  memory: OperationalMemory;
  recall: MemoryRecall | null = null;
  pendingSearch: MemorySearchResult | null = null;
  decisions: RuntimeDecisionRecord[] = [];
  evaluations: RuntimeEvaluationEvent[] = [];

  constructor() {
    this.memory = {
      id: randomUUID(),
      agentId: "ops-agent",
      memoryType: "UNEXPECTED_FAILURE",
      summary: "Provider alpha failed under production environment v1.",
      structuredContext: { workflowType: "provider-selection", provider: "alpha" },
      confidence: 0.93,
      evidenceState: "OBSERVED",
      validFrom: new Date(Date.now() - 1_000),
      environmentVersion: "prod-v1",
      toolVersion: "1.3.0",
      policyVersion: "admission-v1",
    };
  }

  async startExecution(input: ExecutionContext) {
    const id = randomUUID();
    this.execution = {
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
    };
    return { executionId: id };
  }

  async getExecution(executionId: string) {
    return this.execution?.id === executionId ? this.execution : null;
  }

  async appendEvent(_event: ExecutionEvent) {}
  async recordOutcome(_outcome: Outcome) {}

  async searchMemory(_input: MemorySearchInput): Promise<MemorySearchResult> {
    this.pendingSearch = {
      retrievalId: randomUUID(),
      candidates: [{
        memoryId: this.memory.id,
        memory: this.memory,
        semanticScore: 0.96,
        contextScore: 1,
        outcomeScore: 1,
        confidenceScore: this.memory.confidence,
        recencyScore: 1,
        finalScore: 0.96,
        rank: 1,
      }],
    };
    return this.pendingSearch;
  }

  async getMemory(memoryId: string) {
    return memoryId === this.memory.id ? this.memory : null;
  }

  async persistMemory(_memory: OperationalMemory, _sourceExecutionIds: string[]) {}

  async getRecalls(executionId: string) {
    return this.recall?.executionId === executionId ? [this.recall] : [];
  }

  async updateRecallExposure(update: RecallExposureUpdate) {
    const memoryStateById = new Map(update.exposedMemoryStates.map((state) => [state.memoryId, state.memoryStateDigest]));
    if (!this.execution || !this.pendingSearch) throw new Error("Missing persisted state");
    this.recall = {
      id: update.retrievalId,
      executionId: this.execution.id,
      query: "provider history",
      policyVersion: policies.retrieval.policyVersion,
      recalledAt: new Date(),
      candidates: this.pendingSearch.candidates
        .filter((candidate) => update.exposedMemoryIds.includes(candidate.memoryId))
        .map((candidate) => ({
          retrievalId: update.retrievalId,
          memoryId: candidate.memoryId,
          memoryStateDigest: memoryStateById.get(candidate.memoryId),
          rank: candidate.rank,
          score: candidate.finalScore,
        })),
    };
  }

  async recordRuntimeDecision(decision: RuntimeDecisionRecord) {
    this.decisions.push(decision);
  }

  async appendRuntimeEvaluationEvent(event: RuntimeEvaluationEvent) {
    this.evaluations.push(event);
  }

  async getTrace(_executionId: string) {
    return { events: [] };
  }
}

describe("Engram stateless runtime", () => {
  it("accepts influence after a cold start by reloading persisted recall state", async () => {
    const store = new PersistedStore();
    const firstInvocation = new EngramRuntime(store, policies);
    const { executionId } = await firstInvocation.startExecution({
      agentId: "ops-agent",
      workflowType: "provider-selection",
      intent: "Select a reliable provider",
      context: { region: "eu-west" },
      constraints: {},
      environmentVersion: "prod-v1",
      toolVersion: "1.4.0",
      policyVersion: "agent-policy-v1",
    });

    const recalled = await firstInvocation.recall({ executionId, query: "provider history" });
    expect(recalled.recall.candidates[0]?.memoryId).toBe(store.memory.id);

    // Simulate Lambda process loss: no in-process Runtime state is reused.
    const secondInvocation = new EngramRuntime(store, policies);
    const decision = await secondInvocation.recordDecision({
      executionId,
      decisionType: "PROVIDER_SELECTION",
      selectedAction: { provider: "beta" },
      alternatives: [{ provider: "alpha" }],
      reasoningSummary: "Persisted execution memory changed the provider selection.",
      influences: [{
        memoryId: store.memory.id,
        retrievalId: recalled.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "Prior provider-alpha failure changed the selected provider.",
        counterfactual: {
          action: { provider: "alpha" },
          source: "APPLICATION_DECLARED",
          evidenceState: "OBSERVED",
          explanation: "The application recorded alpha as its memory-free baseline.",
        },
      }],
    });

    expect(decision.selectedAction).toEqual({ provider: "beta" });
    expect(store.decisions).toHaveLength(1);
    expect(store.evaluations.some((event) => event.eventType === "INFLUENCE_ACCEPTED")).toBe(true);
  });
});
