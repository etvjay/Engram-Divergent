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
import type { MemoryRelationship } from "../../packages/evaluation/src/domain.js";
import { RelationshipMemoryEligibilityAdvisor } from "../../packages/evaluation/src/eligibility-advisor.js";
import { DEFAULT_RUNTIME_POLICIES } from "../../packages/runtime/src/defaults.js";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import type { EngramRuntimeStore } from "../../packages/runtime/src/store.js";
import type {
  RecallExposureUpdate,
  RuntimeDecisionRecord,
  RuntimeEvaluationEvent,
  RuntimeExecutionRecord,
} from "../../packages/runtime/src/types.js";

class LifecycleStore implements EngramRuntimeStore {
  readonly executions = new Map<string, RuntimeExecutionRecord>();
  readonly memories = new Map<string, OperationalMemory>();
  readonly recalls = new Map<string, MemoryRecall>();
  readonly searches = new Map<string, { executionId: string; result: MemorySearchResult }>();
  readonly decisions: RuntimeDecisionRecord[] = [];
  readonly evaluations: RuntimeEvaluationEvent[] = [];
  readonly outcomes: Outcome[] = [];

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
      toolVersion: input.toolVersion,
      policyVersion: input.policyVersion,
      status: "RUNNING",
      startedAt: new Date(),
    });
    return { executionId: id };
  }

  async getExecution(id: string) { return this.executions.get(id) ?? null; }
  async appendEvent(_event: ExecutionEvent) {}
  async recordOutcome(outcome: Outcome) {
    this.outcomes.push(outcome);
    const execution = this.executions.get(outcome.executionId);
    if (execution) {
      execution.status = outcome.status;
      execution.completedAt = new Date();
    }
  }
  async persistMemory(memory: OperationalMemory, _sources: string[]) { this.memories.set(memory.id, memory); }
  async getMemory(id: string) { return this.memories.get(id) ?? null; }

  async searchMemory(input: MemorySearchInput): Promise<MemorySearchResult> {
    const retrievalId = randomUUID();
    const candidates = [...this.memories.values()]
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
    const result = { retrievalId, candidates };
    this.searches.set(retrievalId, { executionId: input.executionId!, result });
    return result;
  }

  async getRecalls(executionId: string) {
    return [...this.recalls.values()].filter((recall) => recall.executionId === executionId);
  }

  async updateRecallExposure(update: RecallExposureUpdate) {
    const memoryStateById = new Map(update.exposedMemoryStates.map((state) => [state.memoryId, state.memoryStateDigest]));
    const search = this.searches.get(update.retrievalId)!;
    this.recalls.set(update.retrievalId, {
      id: update.retrievalId,
      executionId: search.executionId,
      query: "current deployment guidance",
      policyVersion: DEFAULT_RUNTIME_POLICIES.retrieval.policyVersion,
      recalledAt: new Date(),
      candidates: search.result.candidates
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

  async recordRuntimeDecision(decision: RuntimeDecisionRecord) { this.decisions.push(decision); }
  async appendRuntimeEvaluationEvent(event: RuntimeEvaluationEvent) { this.evaluations.push(event); }
  async getTrace(executionId: string) {
    return {
      execution: this.executions.get(executionId) ?? null,
      outcome: this.outcomes.find((outcome) => outcome.executionId === executionId) ?? null,
      decisions: this.decisions.filter((decision) => decision.executionId === executionId),
      evaluations: this.evaluations.filter((event) => event.executionId === executionId),
    };
  }
}

class RelationshipStore {
  relationships: MemoryRelationship[] = [];
  async listRelationships(memoryId: string) {
    return this.relationships.filter((item) => item.leftMemoryId === memoryId || item.rightMemoryId === memoryId);
  }
}

function lesson(overrides: Partial<OperationalMemory> & Pick<OperationalMemory, "summary">): OperationalMemory {
  return {
    id: randomUUID(),
    agentId: "release-agent",
    memoryType: "OPERATIONAL_LESSON",
    structuredContext: { workflowType: "release", strategy: "legacy-blue-green" },
    confidence: 0.93,
    evidenceState: "OBSERVED",
    validFrom: new Date(Date.now() - 60_000),
    environmentVersion: "prod-v2",
    toolVersion: "2.3.0",
    policyVersion: "engram-admission-v1",
    ...overrides,
  };
}

function supersedes(newer: string, older: string): MemoryRelationship {
  return {
    id: randomUUID(),
    leftMemoryId: newer,
    rightMemoryId: older,
    relation: "SUPERSEDES",
    rationale: "Observed prod-v2 execution establishes replacement guidance for the same release workflow.",
    evidenceState: "OBSERVED",
    method: "EVALUATOR",
    assessedAt: new Date(),
  };
}

async function start(runtime: EngramRuntime) {
  return runtime.startExecution({
    agentId: "release-agent",
    workflowType: "release",
    intent: "Release service safely",
    context: { service: "payments" },
    constraints: {},
    environmentVersion: "prod-v2",
    toolVersion: "2.4.0",
  });
}

describe("memory lifecycle invalidation and supersession", () => {
  it("keeps obsolete memories historical while removing their action authority", async () => {
    const store = new LifecycleStore();
    const relationships = new RelationshipStore();

    const environmentOld = lesson({
      summary: "In prod-v1, drain all traffic before switching revisions.",
      environmentVersion: "prod-v1",
      toolVersion: "1.9.0",
    });
    const supersededOld = lesson({
      summary: "In early prod-v2, use legacy blue-green with a full drain.",
    });
    const current = lesson({
      summary: "In current prod-v2, use progressive canary with health-gated promotion.",
      structuredContext: { workflowType: "release", strategy: "progressive-canary" },
    });

    for (const memory of [environmentOld, supersededOld, current]) store.memories.set(memory.id, memory);
    relationships.relationships.push(supersedes(current.id, supersededOld.id));

    // Control: without relationship-aware lifecycle eligibility, the compatible
    // superseded lesson remains actionable. Environment/tool drift is still
    // rejected by the core expiry/invalidation policy.
    const control = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
    const controlRun = await start(control);
    const controlRecall = await control.recall({ executionId: controlRun.executionId, query: "release strategy" });
    expect(controlRecall.candidates.map((candidate) => candidate.memory.id)).toContain(supersededOld.id);
    expect(controlRecall.rejected.find((item) => item.memoryId === environmentOld.id)?.reasons)
      .toEqual(expect.arrayContaining(["INVALIDATED_ENVIRONMENT_CHANGE", "INVALIDATED_TOOL_MAJOR_VERSION_CHANGE"]));

    await control.recordDecision({
      executionId: controlRun.executionId,
      decisionType: "RELEASE_STRATEGY",
      selectedAction: { strategy: "legacy-blue-green" },
      alternatives: [{ strategy: "progressive-canary" }],
      reasoningSummary: "Without supersession-aware lifecycle eligibility, the still-compatible legacy lesson remains actionable.",
      influences: [{
        memoryId: supersededOld.id,
        retrievalId: controlRecall.recall.id,
        influenceType: "SUPPORTED_ACTION",
        summary: "The compatible legacy prod-v2 memory supports blue-green release.",
      }],
    });
    await control.complete({
      executionId: controlRun.executionId,
      status: "PARTIAL",
      summary: "Legacy blue-green completed but incurred a full-drain availability penalty under the current operating standard.",
      result: { strategy: "legacy-blue-green", availabilityPenalty: true },
      evidenceState: "OBSERVED",
    });

    // Treatment: explicit supersession participates in recall eligibility.
    const advisor = new RelationshipMemoryEligibilityAdvisor(relationships, {
      supersededMemoryStages: ["RECALL", "INFLUENCE"],
    });
    const treatment = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES, undefined, advisor);
    const treatmentRun = await start(treatment);
    const treatmentRecall = await treatment.recall({ executionId: treatmentRun.executionId, query: "release strategy" });

    expect(treatmentRecall.candidates.map((candidate) => candidate.memory.id)).toEqual([current.id]);
    expect(treatmentRecall.rejected.find((item) => item.memoryId === environmentOld.id)?.reasons)
      .toEqual(expect.arrayContaining(["INVALIDATED_ENVIRONMENT_CHANGE", "INVALIDATED_TOOL_MAJOR_VERSION_CHANGE"]));
    expect(treatmentRecall.rejected.find((item) => item.memoryId === supersededOld.id)?.reasons)
      .toContain("MEMORY_SUPERSEDED");

    await treatment.recordDecision({
      executionId: treatmentRun.executionId,
      decisionType: "RELEASE_STRATEGY",
      selectedAction: { strategy: "progressive-canary" },
      alternatives: [{ strategy: "legacy-blue-green" }],
      reasoningSummary: "Current environment memory replaced obsolete release guidance.",
      influences: [{
        memoryId: current.id,
        retrievalId: treatmentRecall.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "Current prod-v2 execution memory changed the release strategy.",
        counterfactual: {
          action: { strategy: "legacy-blue-green" },
          source: "CONTROL_RUN",
          evidenceState: "OBSERVED",
          explanation: "The same-context control actually selected the compatible legacy blue-green lesson when supersession filtering was disabled.",
          comparisonExecutionId: controlRun.executionId,
        },
      }],
    });
    await treatment.complete({
      executionId: treatmentRun.executionId,
      status: "SUCCESS",
      summary: "Progressive canary satisfied the current release standard without the legacy full-drain penalty.",
      result: { strategy: "progressive-canary", availabilityPenalty: false },
      evidenceState: "OBSERVED",
    });

    // Historical evidence remains inspectable; lifecycle changes authority, not history.
    expect(await treatment.inspectMemory(environmentOld.id)).toMatchObject({ id: environmentOld.id });
    expect(await treatment.inspectMemory(supersededOld.id)).toMatchObject({ id: supersededOld.id });
    expect(await treatment.inspectMemory(current.id)).toMatchObject({ id: current.id });

    const controlTrace = await control.trace(controlRun.executionId) as {
      outcome: Outcome;
      decisions: RuntimeDecisionRecord[];
    };
    const treatmentTrace = await treatment.trace(treatmentRun.executionId) as {
      outcome: Outcome;
      decisions: RuntimeDecisionRecord[];
      evaluations: RuntimeEvaluationEvent[];
    };
    expect(controlTrace.decisions[0]?.selectedAction).toEqual({ strategy: "legacy-blue-green" });
    expect(controlTrace.outcome.status).toBe("PARTIAL");
    expect(treatmentTrace.decisions[0]?.selectedAction).toEqual({ strategy: "progressive-canary" });
    expect(treatmentTrace.outcome.status).toBe("SUCCESS");
    expect(treatmentTrace.decisions[0]?.influences[0]?.counterfactual?.comparisonExecutionId).toBe(controlRun.executionId);
    expect(treatmentTrace.evaluations.some((event) => event.eventType === "RECALL_FILTERED")).toBe(true);
    expect(treatmentTrace.evaluations.some((event) => event.eventType === "INFLUENCE_ACCEPTED")).toBe(true);
  });
});
