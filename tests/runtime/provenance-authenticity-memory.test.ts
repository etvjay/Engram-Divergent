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

class ProvenanceStore implements EngramRuntimeStore {
  readonly retrievalId = randomUUID();
  readonly recalls: MemoryRecall[] = [];
  readonly exposureUpdates: RecallExposureUpdate[] = [];
  readonly evaluations: RuntimeEvaluationEvent[] = [];
  readonly decisions: RuntimeDecisionRecord[] = [];

  constructor(
    readonly memory: OperationalMemory,
    readonly current: RuntimeExecutionRecord,
    readonly executions: RuntimeExecutionRecord[],
  ) {}

  async startExecution(_input: ExecutionContext) { return { executionId: this.current.id }; }
  async getExecution(executionId: string) {
    if (executionId === this.current.id) return this.current;
    return this.executions.find((item) => item.id === executionId) ?? null;
  }
  async appendEvent(_event: ExecutionEvent) {}
  async recordOutcome(_outcome: Outcome) {}
  async persistMemory(_memory: OperationalMemory, _sourceExecutionIds: string[]) {}
  async getMemory(memoryId: string) { return memoryId === this.memory.id ? this.memory : null; }
  async getRecalls(executionId: string) { return this.recalls.filter((recall) => recall.executionId === executionId); }
  async recordRuntimeDecision(decision: RuntimeDecisionRecord) { this.decisions.push(decision); }
  async appendRuntimeEvaluationEvent(event: RuntimeEvaluationEvent) { this.evaluations.push(event); }
  async getTrace(_executionId: string) { return { events: [] }; }

  async searchMemory(_input: MemorySearchInput) {
    return {
      retrievalId: this.retrievalId,
      candidates: [{
        memoryId: this.memory.id,
        memory: this.memory,
        semanticScore: 0.99,
        contextScore: 0.99,
        outcomeScore: 1,
        confidenceScore: this.memory.confidence,
        recencyScore: 1,
        finalScore: 0.99,
        rank: 1,
      }],
    };
  }

  async updateRecallExposure(update: RecallExposureUpdate) {
    const memoryStateById = new Map(update.exposedMemoryStates.map((state) => [state.memoryId, state.memoryStateDigest]));
    this.exposureUpdates.push(update);
    this.recalls.push({
      id: update.retrievalId,
      executionId: this.current.id,
      query: "prior safe release pattern",
      policyVersion: DEFAULT_RUNTIME_POLICIES.retrieval.policyVersion,
      recalledAt: new Date(),
      candidates: update.exposedMemoryIds.map((memoryId, index) => ({
        retrievalId: update.retrievalId,
        memoryId,
        memoryStateDigest: memoryStateById.get(memoryId),
        rank: index + 1,
        score: 0.99,
      })),
    });
  }
}

function execution(agentId: string): RuntimeExecutionRecord {
  return {
    id: randomUUID(),
    agentId,
    workflowType: "deployment",
    intent: "deploy release",
    context: { service: "checkout" },
    constraints: {},
    environmentVersion: "prod-v2",
    toolVersion: "2.4.0",
    status: "RUNNING",
    startedAt: new Date("2026-08-16T00:00:00Z"),
  };
}

function memory(agentId: string, structuredContext: Record<string, unknown>): OperationalMemory {
  return {
    id: randomUUID(),
    agentId,
    memoryType: "REPEATED_PATTERN",
    summary: "Use staged rollout for this deployment class.",
    structuredContext: {
      workflowType: "deployment",
      ...structuredContext,
    },
    confidence: 0.96,
    evidenceState: "OBSERVED",
    validFrom: new Date("2026-08-15T00:00:00Z"),
    environmentVersion: "prod-v2",
    toolVersion: "2.4.0",
  };
}

describe("EXP-015 provenance authenticity", () => {
  it("exposes a memory whose claimed source lineage resolves to real same-agent executions", async () => {
    const sourceA = execution("release-agent");
    const sourceB = execution("release-agent");
    const current = execution("release-agent");
    const candidate = memory("release-agent", {
      sourceExecutionId: sourceA.id,
      sourceExecutionIds: [sourceA.id, sourceB.id],
    });
    const store = new ProvenanceStore(candidate, current, [sourceA, sourceB]);
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const recall = await runtime.recall({ executionId: current.id, query: "prior safe release pattern" });

    expect(recall.rejected).toEqual([]);
    expect(recall.candidates.map((item) => item.memory.id)).toEqual([candidate.id]);
  });

  it("rejects a memory that claims a nonexistent source execution", async () => {
    const current = execution("release-agent");
    const missing = randomUUID();
    const candidate = memory("release-agent", {
      sourceExecutionId: missing,
      sourceExecutionIds: [missing],
    });
    const store = new ProvenanceStore(candidate, current, []);
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const recall = await runtime.recall({ executionId: current.id, query: "prior safe release pattern" });

    expect(recall.candidates).toEqual([]);
    expect(recall.rejected[0]?.reasons).toContain(`MEMORY_SOURCE_EXECUTION_NOT_FOUND:${missing}`);
  });

  it("rejects a memory that claims source execution owned by another agent", async () => {
    const foreign = execution("other-agent");
    const current = execution("release-agent");
    const candidate = memory("release-agent", {
      sourceExecutionId: foreign.id,
      sourceExecutionIds: [foreign.id],
    });
    const store = new ProvenanceStore(candidate, current, [foreign]);
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const recall = await runtime.recall({ executionId: current.id, query: "prior safe release pattern" });

    expect(recall.candidates).toEqual([]);
    expect(recall.rejected[0]?.reasons).toContain(`MEMORY_SOURCE_AGENT_MISMATCH:${foreign.id}`);
  });

  it("rejects contradictory single-source and multi-source lineage claims", async () => {
    const sourceA = execution("release-agent");
    const sourceB = execution("release-agent");
    const current = execution("release-agent");
    const candidate = memory("release-agent", {
      sourceExecutionId: sourceA.id,
      sourceExecutionIds: [sourceB.id],
    });
    const store = new ProvenanceStore(candidate, current, [sourceA, sourceB]);
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const recall = await runtime.recall({ executionId: current.id, query: "prior safe release pattern" });

    expect(recall.candidates).toEqual([]);
    expect(recall.rejected[0]?.reasons).toContain("MEMORY_SOURCE_LINEAGE_CONTRADICTORY");
  });

  it("revalidates claimed provenance before influence instead of trusting prior exposure indefinitely", async () => {
    const source = execution("release-agent");
    const current = execution("release-agent");
    const candidate = memory("release-agent", {
      sourceExecutionId: source.id,
      sourceExecutionIds: [source.id],
    });
    const executions = [source];
    const store = new ProvenanceStore(candidate, current, executions);
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const recall = await runtime.recall({ executionId: current.id, query: "prior safe release pattern" });
    expect(recall.candidates.map((item) => item.memory.id)).toEqual([candidate.id]);

    executions.splice(0, executions.length);

    await expect(runtime.recordDecision({
      executionId: current.id,
      decisionType: "DEPLOYMENT_STRATEGY",
      selectedAction: { strategy: "STAGED_ROLLOUT" },
      reasoningSummary: "Attempted to reuse the previously exposed memory.",
      influences: [{
        memoryId: candidate.id,
        retrievalId: recall.recall.id,
        influenceType: "SUPPORTED_ACTION",
        summary: "Prior pattern supports staged rollout.",
      }],
    })).rejects.toThrow(`MEMORY_SOURCE_EXECUTION_NOT_FOUND:${source.id}`);

    expect(store.decisions).toHaveLength(0);
    expect(store.evaluations.some((event) => event.eventType === "INFLUENCE_REJECTED")).toBe(true);
  });
});