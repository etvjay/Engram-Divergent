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
    allowedEvidenceStates: ["VERIFIED", "OBSERVED"],
    minimumConfidence: 0.8,
    requireCounterfactualForChangedAction: false,
  },
  expiry: {
    contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
    policyVersion: "expiry-v1",
    invalidateOnEnvironmentChange: true,
    invalidateOnToolMajorVersionChange: true,
  },
};

class DurableRecallStore implements EngramRuntimeStore {
  executions = new Map<string, RuntimeExecutionRecord>();
  memories = new Map<string, OperationalMemory>();
  searches = new Map<string, { executionId: string; query: string; result: MemorySearchResult }>();
  recalls = new Map<string, MemoryRecall>();
  decisions: RuntimeDecisionRecord[] = [];
  evaluations: RuntimeEvaluationEvent[] = [];

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

  async getExecution(executionId: string) { return this.executions.get(executionId) ?? null; }
  async appendEvent(_event: ExecutionEvent) {}
  async recordOutcome(_outcome: Outcome) {}

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
    this.searches.set(retrievalId, { executionId: input.executionId!, query: input.query, result });
    return result;
  }

  async getMemory(memoryId: string) { return this.memories.get(memoryId) ?? null; }
  async persistMemory(memory: OperationalMemory, _sourceExecutionIds: string[]) { this.memories.set(memory.id, memory); }
  async getRecalls(executionId: string) { return [...this.recalls.values()].filter((recall) => recall.executionId === executionId); }

  async updateRecallExposure(update: RecallExposureUpdate) {
    const search = this.searches.get(update.retrievalId)!;
    const stateByMemory = new Map(update.exposedMemoryStates.map((state) => [state.memoryId, state.memoryStateDigest]));
    this.recalls.set(update.retrievalId, {
      id: update.retrievalId,
      executionId: search.executionId,
      query: search.query,
      policyVersion: policies.retrieval.policyVersion,
      recalledAt: new Date(),
      candidates: search.result.candidates
        .filter((candidate) => update.exposedMemoryIds.includes(candidate.memoryId))
        .map((candidate) => ({
          retrievalId: update.retrievalId,
          memoryId: candidate.memoryId,
          memoryStateDigest: stateByMemory.get(candidate.memoryId),
          rank: candidate.rank,
          score: candidate.finalScore,
        })),
    });
  }

  async recordRuntimeDecision(decision: RuntimeDecisionRecord) { this.decisions.push(decision); }
  async appendRuntimeEvaluationEvent(event: RuntimeEvaluationEvent) { this.evaluations.push(event); }
  async getTrace(executionId: string) { return { execution: this.executions.get(executionId), recalls: await this.getRecalls(executionId) }; }
}

function memory(): OperationalMemory {
  return {
    id: randomUUID(),
    agentId: "deployment-agent",
    memoryType: "UNEXPECTED_FAILURE",
    summary: "Pin dependency X during production deployment.",
    structuredContext: { workflowType: "deployment", dependency: "X", nested: { b: 2, a: 1 } },
    confidence: 0.92,
    evidenceState: "OBSERVED",
    validFrom: new Date("2026-08-16T10:00:00.000Z"),
    environmentVersion: "prod-v1",
    toolVersion: "22.1.0",
    policyVersion: "admission-v1",
  };
}

async function start(runtime: EngramRuntime) {
  return runtime.startExecution({
    agentId: "deployment-agent",
    workflowType: "deployment",
    intent: "Deploy safely",
    context: { service: "api" },
    constraints: {},
    environmentVersion: "prod-v1",
    toolVersion: "22.2.0",
  });
}

async function influence(runtime: EngramRuntime, executionId: string, memoryId: string, retrievalId: string) {
  return runtime.recordDecision({
    executionId,
    decisionType: "DEPLOYMENT_STRATEGY",
    selectedAction: { strategy: "pin" },
    reasoningSummary: "Use the recalled operational memory.",
    influences: [{
      memoryId,
      retrievalId,
      influenceType: "SUPPORTED_ACTION",
      summary: "Recalled deployment evidence supports pinning.",
    }],
  });
}

describe("EXP-019 recall-to-influence memory state integrity", () => {
  it("accepts the unchanged recalled state after runtime reconstruction", async () => {
    const store = new DurableRecallStore();
    const seeded = memory();
    store.memories.set(seeded.id, seeded);
    const runtimeA = new EngramRuntime(store, policies);
    const { executionId } = await start(runtimeA);
    const recalled = await runtimeA.recall({ executionId, query: "deployment dependency" });

    const runtimeB = new EngramRuntime(store, policies);
    await expect(influence(runtimeB, executionId, seeded.id, recalled.recall.id)).resolves.toBeDefined();
    expect(store.decisions).toHaveLength(1);
  });

  const mutations: Array<[string, (value: OperationalMemory) => OperationalMemory]> = [
    ["summary", (value) => ({ ...value, summary: "Use latest dependency X instead." })],
    ["structured context", (value) => ({ ...value, structuredContext: { ...value.structuredContext, dependency: "Y" } })],
    ["confidence", (value) => ({ ...value, confidence: 0.89 })],
    ["evidence state", (value) => ({ ...value, evidenceState: "VERIFIED" })],
    ["validity metadata", (value) => ({ ...value, validUntil: new Date("2026-08-17T00:00:00.000Z") })],
    ["tool metadata", (value) => ({ ...value, toolVersion: "22.9.0" })],
    ["policy metadata", (value) => ({ ...value, policyVersion: "admission-v2" })],
  ];

  it.each(mutations)("rejects %s mutation behind the same memory ID after recall", async (_label, mutate) => {
    const store = new DurableRecallStore();
    const seeded = memory();
    store.memories.set(seeded.id, seeded);
    const runtimeA = new EngramRuntime(store, policies);
    const { executionId } = await start(runtimeA);
    const recalled = await runtimeA.recall({ executionId, query: "deployment dependency" });

    store.memories.set(seeded.id, mutate(seeded));
    const runtimeB = new EngramRuntime(store, policies);

    await expect(influence(runtimeB, executionId, seeded.id, recalled.recall.id))
      .rejects.toThrow(/MEMORY_STATE_CHANGED_SINCE_RECALL/);
    expect(store.decisions).toHaveLength(0);
    expect(store.evaluations.some((event) =>
      event.eventType === "INFLUENCE_REJECTED" &&
      String(event.payload.message).includes("MEMORY_STATE_CHANGED_SINCE_RECALL")
    )).toBe(true);
  });

  it("fails closed for a legacy persisted recall with no state digest", async () => {
    const store = new DurableRecallStore();
    const seeded = memory();
    store.memories.set(seeded.id, seeded);
    const runtimeA = new EngramRuntime(store, policies);
    const { executionId } = await start(runtimeA);
    const recalled = await runtimeA.recall({ executionId, query: "deployment dependency" });
    const persisted = store.recalls.get(recalled.recall.id)!;
    persisted.candidates[0] = { ...persisted.candidates[0]!, memoryStateDigest: undefined };

    const runtimeB = new EngramRuntime(store, policies);
    await expect(influence(runtimeB, executionId, seeded.id, recalled.recall.id))
      .rejects.toThrow(/RECALL_MEMORY_STATE_UNBOUND/);
    expect(store.decisions).toHaveLength(0);
  });
});
