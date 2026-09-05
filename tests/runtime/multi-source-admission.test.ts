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

class MultiSourceStore implements EngramRuntimeStore {
  executions = new Map<string, RuntimeExecutionRecord>();
  outcomes = new Map<string, Outcome>();
  memories = new Map<string, OperationalMemory>();
  memorySources = new Map<string, string[]>();
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

  async getExecution(executionId: string) {
    return this.executions.get(executionId) ?? null;
  }

  async appendEvent(_event: ExecutionEvent) {}

  async recordOutcome(outcome: Outcome) {
    this.outcomes.set(outcome.executionId, outcome);
    const execution = this.executions.get(outcome.executionId)!;
    execution.status = outcome.status;
    execution.completedAt = new Date();
  }

  async getOutcomeEvidenceState(executionId: string) {
    return this.outcomes.get(executionId)?.evidenceState ?? null;
  }

  async searchMemory(_input: MemorySearchInput) {
    return { retrievalId: randomUUID(), candidates: [] };
  }

  async getMemory(memoryId: string) {
    return this.memories.get(memoryId) ?? null;
  }

  async persistMemory(memory: OperationalMemory, sourceExecutionIds: string[]) {
    this.memories.set(memory.id, memory);
    this.memorySources.set(memory.id, [...sourceExecutionIds]);
  }

  async getRecalls(_executionId: string): Promise<MemoryRecall[]> { return []; }
  async updateRecallExposure(_update: RecallExposureUpdate) {}
  async recordRuntimeDecision(_decision: RuntimeDecisionRecord) {}

  async appendRuntimeEvaluationEvent(event: RuntimeEvaluationEvent) {
    this.evaluations.push(event);
  }

  async getTrace(executionId: string) {
    return { execution: this.executions.get(executionId) ?? null };
  }
}

const context = (agentId: string): ExecutionContext => ({
  agentId,
  workflowType: "multi_agent_handoff",
  intent: "Coordinate a planner-to-executor handoff",
  context: { planner: "planner", executor: "executor" },
  constraints: {},
  environmentVersion: "coord-v1",
  toolVersion: "handoff-1.0.0",
});

async function completeWithoutMemory(
  runtime: EngramRuntime,
  executionId: string,
  evidenceState: Outcome["evidenceState"] = "OBSERVED",
) {
  await runtime.complete({
    executionId,
    status: "SUCCESS",
    summary: "Execution completed.",
    evidenceState,
  });
}

describe("multi-source memory admission provenance", () => {
  it("persists a deduplicated same-agent source set for repeated-pattern memory", async () => {
    const store = new MultiSourceStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);

    const first = await runtime.startExecution(context("coord-agent"));
    await completeWithoutMemory(runtime, first.executionId);
    const second = await runtime.startExecution(context("coord-agent"));
    await completeWithoutMemory(runtime, second.executionId);
    const third = await runtime.startExecution(context("coord-agent"));

    const completed = await runtime.complete({
      executionId: third.executionId,
      status: "SUCCESS",
      summary: "Third comparable handoff confirmed the repeated clarification pattern.",
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "REPEATED_PATTERN",
        summary: "Minimal handoffs repeatedly trigger executor clarification.",
        evidenceState: "OBSERVED",
        confidence: 0.94,
        sourceExecutionIds: [first.executionId, second.executionId, third.executionId, second.executionId],
        details: { pattern: "MISSING_CONSTRAINTS_CAUSES_CLARIFICATION" },
      }],
    });

    expect(completed.rejectedSignals).toEqual([]);
    expect(completed.admittedMemories).toHaveLength(1);
    const memory = completed.admittedMemories[0]!;
    expect(store.memorySources.get(memory.id)).toEqual([
      first.executionId,
      second.executionId,
      third.executionId,
    ]);
    expect(memory.structuredContext.sourceExecutionIds).toEqual([
      first.executionId,
      second.executionId,
      third.executionId,
    ]);
  });

  it("rejects a multi-source memory when the admitting execution is absent", async () => {
    const store = new MultiSourceStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
    const prior = await runtime.startExecution(context("coord-agent"));
    await completeWithoutMemory(runtime, prior.executionId);
    const current = await runtime.startExecution(context("coord-agent"));

    const completed = await runtime.complete({
      executionId: current.executionId,
      status: "SUCCESS",
      summary: "Current execution completed.",
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "REPEATED_PATTERN",
        summary: "Unsupported source set.",
        evidenceState: "OBSERVED",
        sourceExecutionIds: [prior.executionId],
      }],
    });

    expect(completed.admittedMemories).toEqual([]);
    expect(completed.rejectedSignals[0]?.reasons).toContain("ADMITTING_EXECUTION_NOT_IN_SOURCE_SET");
  });

  it("rejects source executions owned by a different agent", async () => {
    const store = new MultiSourceStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
    const foreign = await runtime.startExecution(context("other-agent"));
    await completeWithoutMemory(runtime, foreign.executionId);
    const current = await runtime.startExecution(context("coord-agent"));

    const completed = await runtime.complete({
      executionId: current.executionId,
      status: "SUCCESS",
      summary: "Current execution completed.",
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "REPEATED_PATTERN",
        summary: "Cross-agent source set must fail closed.",
        evidenceState: "OBSERVED",
        sourceExecutionIds: [foreign.executionId, current.executionId],
      }],
    });

    expect(completed.admittedMemories).toEqual([]);
    expect(completed.rejectedSignals[0]?.reasons).toContain(
      `SOURCE_EXECUTION_AGENT_MISMATCH:${foreign.executionId}`,
    );
  });

  it("rejects VERIFIED multi-source memory when a declared supporting outcome is only OBSERVED", async () => {
    const store = new MultiSourceStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
    const observedSource = await runtime.startExecution(context("coord-agent"));
    await completeWithoutMemory(runtime, observedSource.executionId, "OBSERVED");
    const admitting = await runtime.startExecution(context("coord-agent"));

    const completed = await runtime.complete({
      executionId: admitting.executionId,
      status: "SUCCESS",
      summary: "A verified current run cannot elevate weaker supporting history.",
      evidenceState: "VERIFIED",
      admissionSignals: [{
        kind: "REPEATED_PATTERN",
        summary: "Pattern supported by mixed-strength source outcomes.",
        evidenceState: "VERIFIED",
        sourceExecutionIds: [observedSource.executionId, admitting.executionId],
      }],
    });

    expect(completed.admittedMemories).toEqual([]);
    expect(completed.rejectedSignals[0]?.reasons).toContain(
      `MEMORY_EVIDENCE_EXCEEDS_SOURCE_EVIDENCE:${observedSource.executionId}`,
    );
  });

  it("accepts OBSERVED memory when mixed source evidence is OBSERVED and VERIFIED", async () => {
    const store = new MultiSourceStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
    const observedSource = await runtime.startExecution(context("coord-agent"));
    await completeWithoutMemory(runtime, observedSource.executionId, "OBSERVED");
    const admitting = await runtime.startExecution(context("coord-agent"));

    const completed = await runtime.complete({
      executionId: admitting.executionId,
      status: "SUCCESS",
      summary: "The weaker source establishes the correct conservative ceiling.",
      evidenceState: "VERIFIED",
      admissionSignals: [{
        kind: "REPEATED_PATTERN",
        summary: "Mixed-strength source set supports only an observed memory claim.",
        evidenceState: "OBSERVED",
        sourceExecutionIds: [observedSource.executionId, admitting.executionId],
      }],
    });

    expect(completed.rejectedSignals).toEqual([]);
    expect(completed.admittedMemories).toHaveLength(1);
    expect(completed.admittedMemories[0]?.evidenceState).toBe("OBSERVED");
  });

  it("accepts VERIFIED memory when every declared supporting outcome is VERIFIED", async () => {
    const store = new MultiSourceStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
    const verifiedSource = await runtime.startExecution(context("coord-agent"));
    await completeWithoutMemory(runtime, verifiedSource.executionId, "VERIFIED");
    const admitting = await runtime.startExecution(context("coord-agent"));

    const completed = await runtime.complete({
      executionId: admitting.executionId,
      status: "SUCCESS",
      summary: "Every supporting execution is verified.",
      evidenceState: "VERIFIED",
      admissionSignals: [{
        kind: "REPEATED_PATTERN",
        summary: "Verified support remains verified without escalation.",
        evidenceState: "VERIFIED",
        sourceExecutionIds: [verifiedSource.executionId, admitting.executionId],
      }],
    });

    expect(completed.rejectedSignals).toEqual([]);
    expect(completed.admittedMemories).toHaveLength(1);
    expect(completed.admittedMemories[0]?.evidenceState).toBe("VERIFIED");
  });

  it("fails closed when a declared historical source has no persisted outcome evidence", async () => {
    const store = new MultiSourceStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
    const incompleteSource = await runtime.startExecution(context("coord-agent"));
    const admitting = await runtime.startExecution(context("coord-agent"));

    const completed = await runtime.complete({
      executionId: admitting.executionId,
      status: "SUCCESS",
      summary: "A missing supporting outcome cannot grant evidence authority.",
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "REPEATED_PATTERN",
        summary: "Incomplete history must fail closed.",
        evidenceState: "OBSERVED",
        sourceExecutionIds: [incompleteSource.executionId, admitting.executionId],
      }],
    });

    expect(completed.admittedMemories).toEqual([]);
    expect(completed.rejectedSignals[0]?.reasons).toContain(
      `SOURCE_EXECUTION_OUTCOME_NOT_FOUND:${incompleteSource.executionId}`,
    );
  });
});
