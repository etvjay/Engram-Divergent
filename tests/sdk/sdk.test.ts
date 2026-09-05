import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Engram, type EngramTransport } from "../../packages/sdk/src/index.js";

function makeTransport(calls: Array<{ method: string; executionId?: string; input?: unknown }>): EngramTransport {
  return {
    async startExecution(input) {
      calls.push({ method: "startExecution", input });
      return { executionId: "11111111-1111-4111-8111-111111111111" };
    },
    async recall(executionId, input) {
      calls.push({ method: "recall", executionId, input });
      return {
        recall: {
          id: randomUUID(),
          executionId,
          query: input.query,
          policyVersion: "retrieval-v1",
          recalledAt: new Date(),
          candidates: [],
        },
        candidates: [],
        rejected: [],
      };
    },
    async recordDecision(executionId, input) {
      calls.push({ method: "recordDecision", executionId, input });
      return {
        ...input,
        id: input.id ?? randomUUID(),
        executionId,
        alternatives: input.alternatives ?? [],
        influences: input.influences ?? [],
        decidedAt: input.decidedAt ?? new Date(),
      };
    },
    async observe(executionId, input) {
      calls.push({ method: "observe", executionId, input });
    },
    async complete(executionId, input) {
      calls.push({ method: "complete", executionId, input });
      return { executionId, admittedMemories: [], rejectedSignals: [] };
    },
    async trace(executionId) {
      calls.push({ method: "trace", executionId });
      return { executionId };
    },
  };
}

describe("Engram SDK", () => {
  it("scopes every lifecycle operation to the execution returned by startExecution", async () => {
    const calls: Array<{ method: string; executionId?: string; input?: unknown }> = [];
    const engram = new Engram(makeTransport(calls));
    const execution = await engram.startExecution({
      agentId: "coding-agent",
      workflowType: "deployment",
      intent: "Deploy safely",
      context: { service: "api" },
      constraints: {},
    });

    await execution.recall({ query: "prior deployment failures" });
    await execution.recordDecision({
      decisionType: "DEPLOYMENT_STRATEGY",
      selectedAction: { strategy: "safe" },
      reasoningSummary: "Application selected the safe strategy.",
    });
    await execution.observe({
      type: "DEPLOYMENT_STARTED",
      payload: { service: "api" },
      evidenceState: "OBSERVED",
    });
    await execution.complete({
      status: "SUCCESS",
      summary: "Deployment completed.",
      evidenceState: "OBSERVED",
    });
    await execution.trace();

    expect(execution.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(calls.slice(1).every((call) => call.executionId === execution.id)).toBe(true);
  });

  it("can attach to an existing execution without starting a new one", async () => {
    const calls: Array<{ method: string; executionId?: string; input?: unknown }> = [];
    const engram = new Engram(makeTransport(calls));
    const executionId = "22222222-2222-4222-8222-222222222222";

    await engram.execution(executionId).trace();

    expect(calls).toEqual([{ method: "trace", executionId }]);
  });
});
