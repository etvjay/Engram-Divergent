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
import { DEFAULT_RUNTIME_POLICIES } from "../../packages/runtime/src/defaults.js";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import type { EngramRuntimeStore } from "../../packages/runtime/src/store.js";
import type {
  RecallExposureUpdate,
  RuntimeDecisionRecord,
  RuntimeEvaluationEvent,
  RuntimeExecutionRecord,
} from "../../packages/runtime/src/types.js";

function memory(id: string, summary: string): OperationalMemory {
  return {
    id,
    agentId: "agent",
    memoryType: "OPERATIONAL_LESSON",
    summary,
    structuredContext: { workflowType: "deployment" },
    confidence: 0.92,
    evidenceState: "OBSERVED",
    validFrom: new Date(Date.now() - 1_000),
    environmentVersion: "prod-v1",
    toolVersion: "1.4.0",
  };
}

class RelationshipStore {
  relationships: MemoryRelationship[] = [];

  async listRelationships(memoryId: string): Promise<MemoryRelationship[]> {
    return this.relationships.filter((relationship) =>
      relationship.leftMemoryId === memoryId || relationship.rightMemoryId === memoryId,
    );
  }
}

class CompetingMemoryStore implements EngramRuntimeStore {
  readonly memories = [
    memory(randomUUID(), "Use dependency alpha during production deployment."),
    memory(randomUUID(), "Avoid dependency alpha during production deployment."),
  ];
  readonly executions = new Map<string, RuntimeExecutionRecord>();
  readonly recalls = new Map<string, MemoryRecall>();
  readonly decisions: RuntimeDecisionRecord[] = [];
  readonly evaluations: RuntimeEvaluationEvent[] = [];

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

  async getExecution(executionId: string) { return this.executions.get(executionId) ?? null; }
  async appendEvent(_event: ExecutionEvent) {}
  async recordOutcome(_outcome: Outcome) {}
  async persistMemory(_memory: OperationalMemory, _sourceExecutionIds: string[]) {}
  async getMemory(memoryId: string) { return this.memories.find((item) => item.id === memoryId) ?? null; }

  async searchMemory(_input: MemorySearchInput) {
    return {
      retrievalId: randomUUID(),
      candidates: this.memories.map((item, index) => ({
        memoryId: item.id,
        memory: item,
        semanticScore: 0.9 - index * 0.01,
        contextScore: 1,
        outcomeScore: 1,
        confidenceScore: item.confidence,
        recencyScore: 1,
        finalScore: 0.9 - index * 0.01,
        rank: index + 1,
      })),
    };
  }

  async getRecalls(executionId: string) {
    return [...this.recalls.values()].filter((recall) => recall.executionId === executionId);
  }

  async updateRecallExposure(update: RecallExposureUpdate) {
    const memoryStateById = new Map(update.exposedMemoryStates.map((state) => [state.memoryId, state.memoryStateDigest]));
    const execution = [...this.executions.values()].find((item) =>
      item.status === "RUNNING" && ![...this.recalls.values()].some((recall) => recall.executionId === item.id),
    );
    if (!execution) throw new Error("No execution available for recall exposure");
    this.recalls.set(update.retrievalId, {
      id: update.retrievalId,
      executionId: execution.id,
      query: "competing deployment memories",
      policyVersion: DEFAULT_RUNTIME_POLICIES.retrieval.policyVersion,
      recalledAt: new Date(),
      candidates: update.exposedMemoryIds.map((memoryId, index) => ({
        retrievalId: update.retrievalId,
        memoryId,
        memoryStateDigest: memoryStateById.get(memoryId),
        rank: index + 1,
        score: 0.9 - index * 0.01,
      })),
    });
  }

  async recordRuntimeDecision(decision: RuntimeDecisionRecord) { this.decisions.push(decision); }
  async appendRuntimeEvaluationEvent(event: RuntimeEvaluationEvent) { this.evaluations.push(event); }
  async getTrace(_executionId: string) { return { events: [] }; }
}

function relationship(
  leftMemoryId: string,
  rightMemoryId: string,
  relation: MemoryRelationship["relation"],
): MemoryRelationship {
  return {
    id: randomUUID(),
    leftMemoryId,
    rightMemoryId,
    relation,
    rationale: `${relation} is explicit experiment evidence`,
    evidenceState: "OBSERVED",
    method: "HUMAN_ASSESSMENT",
    assessedAt: new Date(),
  };
}

async function start(runtime: EngramRuntime) {
  return runtime.startExecution({
    agentId: "agent",
    workflowType: "deployment",
    intent: "Deploy service",
    context: {},
    constraints: {},
    environmentVersion: "prod-v1",
    toolVersion: "1.4.0",
  });
}

describe("competing eligible memories", () => {
  it("keeps unresolved conflict recall-visible but can fail closed at influence", async () => {
    const store = new CompetingMemoryStore();
    const relationships = new RelationshipStore();
    const [memoryA, memoryB] = store.memories;
    relationships.relationships = [relationship(memoryA!.id, memoryB!.id, "CONTRADICTS")];

    // Control: relationship evidence exists, but runtime has no eligibility advisor.
    const control = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
    const controlRun = await start(control);
    const controlRecall = await control.recall({ executionId: controlRun.executionId, query: "deployment dependency guidance" });
    expect(controlRecall.candidates).toHaveLength(2);
    await expect(control.recordDecision({
      executionId: controlRun.executionId,
      decisionType: "DEPENDENCY_SELECTION",
      selectedAction: { dependency: "alpha" },
      reasoningSummary: "Application selected one recalled lesson under surface-only conflict policy.",
      influences: [{
        memoryId: memoryA!.id,
        retrievalId: controlRecall.recall.id,
        influenceType: "SUPPORTED_ACTION",
        summary: "Memory A supports dependency alpha.",
      }],
    })).resolves.toMatchObject({ executionId: controlRun.executionId });

    // Treatment: unresolved contradiction affects influence only, not recall.
    const advisor = new RelationshipMemoryEligibilityAdvisor(relationships, {
      unresolvedContradictionStages: ["INFLUENCE"],
    });
    const treatment = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES, undefined, advisor);
    const treatmentRun = await start(treatment);
    const treatmentRecall = await treatment.recall({ executionId: treatmentRun.executionId, query: "deployment dependency guidance" });
    expect(treatmentRecall.candidates).toHaveLength(2);

    await expect(treatment.recordDecision({
      executionId: treatmentRun.executionId,
      decisionType: "DEPENDENCY_SELECTION",
      selectedAction: { dependency: "alpha" },
      reasoningSummary: "Attempt to use unresolved contradictory memory.",
      influences: [{
        memoryId: memoryA!.id,
        retrievalId: treatmentRecall.recall.id,
        influenceType: "SUPPORTED_ACTION",
        summary: "Memory A supports dependency alpha.",
      }],
    })).rejects.toThrow("UNRESOLVED_MEMORY_CONTRADICTION");

    expect(store.evaluations.some((event) =>
      event.executionId === treatmentRun.executionId && event.eventType === "INFLUENCE_REJECTED",
    )).toBe(true);
    expect(store.decisions.filter((decision) => decision.executionId === treatmentRun.executionId)).toHaveLength(0);

    // Explicit supersession resolves the contradiction without selecting a
    // global runtime default about whether superseded memories are allowed.
    relationships.relationships.push(relationship(memoryB!.id, memoryA!.id, "SUPERSEDES"));
    const resolvedRun = await start(treatment);
    const resolvedRecall = await treatment.recall({ executionId: resolvedRun.executionId, query: "deployment dependency guidance" });
    expect(resolvedRecall.candidates).toHaveLength(2);
    await expect(treatment.recordDecision({
      executionId: resolvedRun.executionId,
      decisionType: "DEPENDENCY_SELECTION",
      selectedAction: { dependency: "beta" },
      reasoningSummary: "Explicit supersession resolves the A/B contradiction for Memory B.",
      influences: [{
        memoryId: memoryB!.id,
        retrievalId: resolvedRecall.recall.id,
        influenceType: "SUPPORTED_ACTION",
        summary: "Memory B is no longer in an unresolved contradiction.",
      }],
    })).resolves.toMatchObject({ executionId: resolvedRun.executionId });
  });
});
