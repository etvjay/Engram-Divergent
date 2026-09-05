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

class EvidenceStore implements EngramRuntimeStore {
  readonly execution: RuntimeExecutionRecord = {
    id: randomUUID(),
    agentId: "release-agent",
    workflowType: "deployment",
    intent: "deploy release",
    context: {},
    constraints: {},
    environmentVersion: "prod-v2",
    toolVersion: "2.4.0",
    status: "RUNNING",
    startedAt: new Date("2026-08-16T00:00:00Z"),
  };
  readonly outcomes: Outcome[] = [];
  readonly memories: OperationalMemory[] = [];
  readonly evaluations: RuntimeEvaluationEvent[] = [];

  async startExecution(_input: ExecutionContext) { return { executionId: this.execution.id }; }
  async getExecution(executionId: string) { return executionId === this.execution.id ? this.execution : null; }
  async appendEvent(_event: ExecutionEvent) {}
  async recordOutcome(outcome: Outcome) { this.outcomes.push(outcome); }
  async searchMemory(_input: MemorySearchInput) { return { retrievalId: randomUUID(), candidates: [] }; }
  async getMemory(memoryId: string) { return this.memories.find((memory) => memory.id === memoryId) ?? null; }
  async persistMemory(memory: OperationalMemory, _sourceExecutionIds: string[]) { this.memories.push(memory); }
  async getRecalls(_executionId: string): Promise<MemoryRecall[]> { return []; }
  async updateRecallExposure(_update: RecallExposureUpdate) {}
  async recordRuntimeDecision(_decision: RuntimeDecisionRecord) {}
  async appendRuntimeEvaluationEvent(event: RuntimeEvaluationEvent) { this.evaluations.push(event); }
  async getTrace(_executionId: string) { return { events: [] }; }
}

describe("EXP-017 evidence-state escalation", () => {
  it("rejects VERIFIED memory admission from an OBSERVED execution outcome", async () => {
    const store = new EvidenceStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const result = await runtime.complete({
      executionId: store.execution.id,
      status: "SUCCESS",
      summary: "Observed deployment completed.",
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "SIGNIFICANT_COST",
        summary: "Claimed verified cost lesson.",
        evidenceState: "VERIFIED",
        confidence: 0.98,
      }],
    });

    expect(store.outcomes[0]?.evidenceState).toBe("OBSERVED");
    expect(result.admittedMemories).toEqual([]);
    expect(result.rejectedSignals).toEqual([{ kind: "SIGNIFICANT_COST", reasons: [
      "MEMORY_EVIDENCE_EXCEEDS_EXECUTION_EVIDENCE",
    ] }]);
    expect(store.memories).toEqual([]);
    expect(store.evaluations.some((event) =>
      event.eventType === "MEMORY_NOT_ADMITTED" &&
      (event.payload.reasons as string[]).includes("MEMORY_EVIDENCE_EXCEEDS_EXECUTION_EVIDENCE")
    )).toBe(true);
  });

  it("allows an OBSERVED memory derived from an OBSERVED execution outcome", async () => {
    const store = new EvidenceStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const result = await runtime.complete({
      executionId: store.execution.id,
      status: "SUCCESS",
      summary: "Observed deployment completed.",
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "SIGNIFICANT_COST",
        summary: "Observed cost lesson.",
        evidenceState: "OBSERVED",
      }],
    });

    expect(result.rejectedSignals).toEqual([]);
    expect(result.admittedMemories).toHaveLength(1);
    expect(result.admittedMemories[0]?.evidenceState).toBe("OBSERVED");
  });

  it("allows a conservative OBSERVED memory derived from a VERIFIED execution outcome", async () => {
    const store = new EvidenceStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const result = await runtime.complete({
      executionId: store.execution.id,
      status: "SUCCESS",
      summary: "Verified deployment result.",
      evidenceState: "VERIFIED",
      admissionSignals: [{
        kind: "SIGNIFICANT_COST",
        summary: "Conservatively classified cost lesson.",
        evidenceState: "OBSERVED",
      }],
    });

    expect(result.rejectedSignals).toEqual([]);
    expect(result.admittedMemories).toHaveLength(1);
    expect(result.admittedMemories[0]?.evidenceState).toBe("OBSERVED");
  });
});