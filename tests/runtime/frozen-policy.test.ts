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
  MEMORY_POLICY_CONTRACT_VERSION,
  type MemoryPolicyBundle,
} from "../../packages/policy/src/contracts.js";
import type {
  MemoryPolicyAssignment,
  MemoryPolicyRegistry,
  RegisteredMemoryPolicyBundle,
} from "../../packages/policy/src/registry.js";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import type { EngramRuntimeStore } from "../../packages/runtime/src/store.js";
import type {
  RecallExposureUpdate,
  RuntimeDecisionRecord,
  RuntimeEvaluationEvent,
  RuntimeExecutionRecord,
} from "../../packages/runtime/src/types.js";

function bundle(version: string, minimumScore: number): MemoryPolicyBundle {
  return {
    contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
    bundleVersion: version,
    admission: {
      contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
      policyVersion: `${version}-admission`,
      admitOn: ["UNEXPECTED_FAILURE"],
      minimumEvidence: "OBSERVED",
    },
    retrieval: {
      contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
      policyVersion: `${version}-retrieval`,
      maxCandidates: 8,
      minimumScore,
      requireEnvironmentMatch: false,
      allowExpired: false,
    },
    influence: {
      contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
      policyVersion: `${version}-influence`,
      allowedEvidenceStates: ["OBSERVED"],
      minimumConfidence: 0.8,
      requireCounterfactualForChangedAction: true,
    },
    expiry: {
      contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
      policyVersion: `${version}-expiry`,
      invalidateOnEnvironmentChange: false,
      invalidateOnToolMajorVersionChange: false,
    },
  };
}

class FakeRegistry implements MemoryPolicyRegistry {
  active = "bundle-v1";
  readonly bundles = new Map<string, RegisteredMemoryPolicyBundle>();

  constructor() {
    for (const item of [bundle("bundle-v1", 0.9), bundle("bundle-v2", 0.1)]) {
      this.bundles.set(item.bundleVersion, {
        id: randomUUID(),
        bundle: item,
        status: "ACTIVE",
        createdAt: new Date(),
        activatedAt: new Date(),
      });
    }
  }

  async resolve() { return this.bundles.get(this.active) ?? null; }
  async get(version: string) { return this.bundles.get(version) ?? null; }
  async register(): Promise<RegisteredMemoryPolicyBundle> { throw new Error("not used"); }
  async activate(): Promise<RegisteredMemoryPolicyBundle> { throw new Error("not used"); }
  async retire(): Promise<RegisteredMemoryPolicyBundle> { throw new Error("not used"); }
  async assign(): Promise<MemoryPolicyAssignment> { throw new Error("not used"); }
}

class FrozenPolicyStore implements EngramRuntimeStore {
  executions = new Map<string, RuntimeExecutionRecord>();
  recalls = new Map<string, MemoryRecall>();
  evaluations: RuntimeEvaluationEvent[] = [];
  readonly memory: OperationalMemory = {
    id: randomUUID(),
    agentId: "agent",
    memoryType: "UNEXPECTED_FAILURE",
    summary: "Prior failure",
    structuredContext: {},
    confidence: 0.9,
    evidenceState: "OBSERVED",
    validFrom: new Date(Date.now() - 1000),
  };

  async startExecution(input: ExecutionContext) {
    const id = randomUUID();
    this.executions.set(id, {
      id,
      agentId: input.agentId,
      workflowType: input.workflowType,
      intent: input.intent,
      context: input.context,
      constraints: input.constraints,
      environmentVersion: input.environmentVersion,
      status: "RUNNING",
      startedAt: new Date(),
    });
    return { executionId: id };
  }

  async setExecutionMemoryPolicy(executionId: string, bundleVersion: string) {
    this.executions.get(executionId)!.memoryPolicyBundleVersion = bundleVersion;
  }

  async getExecution(executionId: string) { return this.executions.get(executionId) ?? null; }
  async appendEvent(_event: ExecutionEvent) {}
  async recordOutcome(_outcome: Outcome) {}
  async persistMemory(_memory: OperationalMemory, _sources: string[]) {}
  async getMemory(memoryId: string) { return memoryId === this.memory.id ? this.memory : null; }

  async searchMemory(input: MemorySearchInput) {
    return {
      retrievalId: randomUUID(),
      candidates: [{
        memoryId: this.memory.id,
        memory: this.memory,
        semanticScore: 0.5,
        contextScore: 0.5,
        outcomeScore: 0.5,
        confidenceScore: 0.9,
        recencyScore: 1,
        finalScore: 0.5,
        rank: 1,
      }],
    };
  }

  async getRecalls(executionId: string) {
    return [...this.recalls.values()].filter((recall) => recall.executionId === executionId);
  }

  async updateRecallExposure(update: RecallExposureUpdate) {
    const memoryStateById = new Map(update.exposedMemoryStates.map((state) => [state.memoryId, state.memoryStateDigest]));
    const execution = [...this.executions.values()].find((item) => item.status === "RUNNING" && ![...this.recalls.values()].some((r) => r.executionId === item.id));
    if (!execution) return;
    this.recalls.set(update.retrievalId, {
      id: update.retrievalId,
      executionId: execution.id,
      query: "test",
      policyVersion: "test",
      recalledAt: new Date(),
      candidates: update.exposedMemoryIds.map((memoryId, index) => ({
        retrievalId: update.retrievalId,
        memoryId,
        memoryStateDigest: memoryStateById.get(memoryId),
        rank: index + 1,
        score: 0.5,
      })),
    });
  }

  async recordRuntimeDecision(_decision: RuntimeDecisionRecord) {}
  async appendRuntimeEvaluationEvent(event: RuntimeEvaluationEvent) { this.evaluations.push(event); }
  async getTrace(_executionId: string) { return { events: [] }; }
}

describe("frozen memory policy", () => {
  it("keeps an execution on its start-time bundle while new executions resolve the new bundle", async () => {
    const registry = new FakeRegistry();
    const store = new FrozenPolicyStore();
    const fallback = {
      admission: bundle("fallback", 1).admission,
      retrieval: bundle("fallback", 1).retrieval,
      influence: bundle("fallback", 1).influence,
      expiry: bundle("fallback", 1).expiry,
    };
    const runtime = new EngramRuntime(store, fallback, registry);

    const runA = await runtime.startExecution({
      agentId: "agent",
      workflowType: "workflow",
      intent: "do work",
      context: {},
      constraints: {},
    });
    expect(store.executions.get(runA.executionId)?.memoryPolicyBundleVersion).toBe("bundle-v1");

    registry.active = "bundle-v2";
    const recallA = await runtime.recall({ executionId: runA.executionId, query: "prior failure" });
    expect(recallA.candidates).toHaveLength(0);
    expect(recallA.rejected[0]?.reasons).toContain("SCORE_BELOW_THRESHOLD");

    const runB = await runtime.startExecution({
      agentId: "agent",
      workflowType: "workflow",
      intent: "do work",
      context: {},
      constraints: {},
    });
    expect(store.executions.get(runB.executionId)?.memoryPolicyBundleVersion).toBe("bundle-v2");
    const recallB = await runtime.recall({ executionId: runB.executionId, query: "prior failure" });
    expect(recallB.candidates).toHaveLength(1);
  });
});
