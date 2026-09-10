import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { EngramClient } from "../../packages/agent-surface/src/sdk.js";
import { SibylBehavioralMemoryStore } from "../../packages/sibyl/src/behavioral-store.js";

const describeSibyl = process.env.ENGRAM_SIBYL_TEST_REQUIRED === "1" ? describe : describe.skip;
let dir = "";
let previousDb: string | undefined;
let previousTenant: string | undefined;

describeSibyl("typed cold-developer Engram SDK", () => {
  beforeEach(async () => {
    dir = await mkdtemp(join("/tmp", "engram-sdk-"));
    previousDb = process.env.ENGRAM_SIBYL_DB;
    previousTenant = process.env.ENGRAM_SIBYL_TENANT;
    process.env.ENGRAM_SIBYL_DB = join(dir, "memory.db");
    process.env.ENGRAM_SIBYL_TENANT = "engram-sdk-test";
  });
  afterEach(async () => {
    if (previousDb === undefined) delete process.env.ENGRAM_SIBYL_DB; else process.env.ENGRAM_SIBYL_DB = previousDb;
    if (previousTenant === undefined) delete process.env.ENGRAM_SIBYL_TENANT; else process.env.ENGRAM_SIBYL_TENANT = previousTenant;
    await rm(dir, { recursive: true, force: true });
  });

  it("wraps the existing bounded lifecycle without duplicating semantics", async () => {
    const client = new EngramClient({ store: new SibylBehavioralMemoryStore() });
    const executionId = randomUUID();
    const eventId = randomUUID();
    const outcomeId = randomUUID();
    const startedAt = "2026-09-09T00:00:00.000Z";
    const completedAt = "2026-09-09T00:01:00.000Z";
    const recorded = await client.recordCompleteExecution({
      execution: { id: executionId, agentId: "developer-agent", workflowType: "tool_recovery", intent: "fetch BTC", context: { tool: "tool-a", workloadClass: "high" }, constraints: {}, status: "SUCCESS", startedAt, completedAt },
      events: [{ id: eventId, executionId, sequenceNo: 0, eventType: "tool.completed", payload: { tool: "tool-a" }, evidenceState: "SIMULATED", occurredAt: completedAt }],
      outcome: { id: outcomeId, executionId, status: "SUCCESS", summary: "Tool completed", result: { value: "ok" }, evidenceState: "SIMULATED" },
      evidenceRefs: ["local:typed-sdk"], subject: "tool-recovery", observation: "Tool completed", interpretation: "Successful tool execution", applicability: { tool: "tool-a", workloadClass: "high" }, confidence: 0.8,
    });
    expect(recorded.status).toBe("ADMITTED");
    if (recorded.status !== "ADMITTED") throw new Error("expected admission");
    const memoryId = recorded.ids.executionMemoryId;
    const consumerExecutionId = randomUUID();
    const recalled = await client.recallApplicableMemory({ executionMemoryId: memoryId, consumerAgentId: "consumer-agent", consumerExecutionId, context: { tool: "tool-a", workloadClass: "high" }, purpose: "tool_selection", subject: "tool-recovery" });
    expect(recalled.status).toBe("ELIGIBLE");
    if (recalled.status !== "ELIGIBLE") throw new Error("expected eligible memory");
    const slice = recalled.memorySlice;
    const grant = recalled.influenceGrant;
    const proposal = await client.requestInfluence({ consumerAgentId: "consumer-agent", influenceGrantId: grant.id, proposal: { executionId: consumerExecutionId, actor: { runtime: "typed-sdk" }, decisionType: "tool_selection", proposedAction: { tool: "tool-b" }, reasoningSummary: "Bounded fallback", memorySliceIds: [slice.id], requestedEffects: ["tool_selection"], proposedAt: completedAt } });
    expect(proposal.status).toBe("AUTHORIZED");
    const evaluation = await client.submitOutcomeEvaluation({ evaluation: { id: randomUUID(), executionMemoryId: memoryId, memorySliceId: slice.id, influenceGrantId: grant.id, influencedExecutionId: consumerExecutionId, influencedDecisionId: randomUUID(), effect: "BENEFICIAL", effectScore: 0.8, actionChanged: true, treatmentAction: { tool: "tool-b" }, treatmentOutcome: "SUCCESS", updateDirective: "STRENGTHEN", rationale: "Fallback succeeded", evidenceState: "SIMULATED", evaluatedAt: "2026-09-09T00:02:00.000Z" } });
    expect(evaluation.status).toBe("UPDATED");
    expect(evaluation.newMemoryId).not.toBe(memoryId);
    const scorecard = await client.getUseCaseScorecard();
    expect(scorecard.rows).toBeDefined();
  });
});
