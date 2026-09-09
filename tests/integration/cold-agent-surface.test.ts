import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createAgentSurface } from "../../packages/agent-surface/src/server.js";
import { SibylBehavioralMemoryStore } from "../../packages/sibyl/src/behavioral-store.js";

const describeSibyl = process.env.ENGRAM_SIBYL_TEST_REQUIRED === "1" ? describe : describe.skip;
let dir = "";
let previousDb: string | undefined;
let previousTenant: string | undefined;

describeSibyl("cold agent Engram surface", () => {
  beforeEach(async () => {
    dir = await mkdtemp(join("/tmp", "engram-agent-surface-"));
    previousDb = process.env.ENGRAM_SIBYL_DB;
    previousTenant = process.env.ENGRAM_SIBYL_TENANT;
    process.env.ENGRAM_SIBYL_DB = join(dir, "memory.db");
    process.env.ENGRAM_SIBYL_TENANT = "engram-agent-surface-test";
  });
  afterEach(async () => {
    if (previousDb === undefined) delete process.env.ENGRAM_SIBYL_DB; else process.env.ENGRAM_SIBYL_DB = previousDb;
    if (previousTenant === undefined) delete process.env.ENGRAM_SIBYL_TENANT; else process.env.ENGRAM_SIBYL_TENANT = previousTenant;
    await rm(dir, { recursive: true, force: true });
  });

  it("completes the bounded lifecycle without exposing raw history", async () => {
    const surface = createAgentSurface(new SibylBehavioralMemoryStore());
    const executionId = randomUUID();
    const eventId = randomUUID();
    const outcomeId = randomUUID();
    const startedAt = "2026-09-09T00:00:00.000Z";
    const completedAt = "2026-09-09T00:01:00.000Z";
    const init = await surface.call({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(init.serverInfo).toBeTruthy();
    const tools = await surface.call({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect((tools.tools as Array<{ name: string }>).map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "record_complete_execution", "recall_applicable_memory", "request_influence", "submit_outcome_evaluation",
      "get_evaluation_summary", "compare_arms", "get_use_case_scorecard",
    ]));
    const scorecard = await surface.call({ jsonrpc: "2.0", id: 2.5, method: "tools/call", params: { name: "get_use_case_scorecard", arguments: {} } });
    expect((scorecard.rows as Array<{ use_case: string }>).map((row) => row.use_case)).toEqual(["provider-continuity", "tool-recovery", "agent-handoff"]);
    const recorded = await surface.call({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "record_complete_execution", arguments: {
      execution: { id: executionId, agentId: "agent-a", workflowType: "tool_recovery", intent: "fetch BTC", context: { tool: "tool-a", workloadClass: "high" }, constraints: {}, status: "SUCCESS", startedAt, completedAt },
      events: [{ id: eventId, executionId, sequenceNo: 0, eventType: "tool.completed", payload: { tool: "tool-a" }, evidenceState: "SIMULATED", occurredAt: completedAt }],
      outcome: { id: outcomeId, executionId, status: "SUCCESS", summary: "Tool completed", result: { value: "ok" }, evidenceState: "SIMULATED" }, evidenceRefs: ["local:cold-agent"], subject: "tool-recovery", observation: "Tool completed", interpretation: "Successful tool execution", applicability: { tool: "tool-a", workloadClass: "high" }, confidence: 0.8,
    } } });
    expect(recorded.status).toBe("ADMITTED");
    const memoryId = String((recorded.ids as Record<string, unknown>).executionMemoryId);
    const consumerExecutionId = randomUUID();
    const recalled = await surface.call({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "recall_applicable_memory", arguments: { executionMemoryId: memoryId, consumerAgentId: "agent-b", consumerExecutionId, context: { tool: "tool-a", workloadClass: "high" }, purpose: "tool_selection", subject: "tool-recovery" } } });
    expect(recalled.status).toBe("ELIGIBLE");
    const slice = recalled.memorySlice as { id: string; claims: string[]; redactedFields: string[] };
    const grant = recalled.influenceGrant as { id: string };
    expect(slice.redactedFields).toEqual(expect.arrayContaining(["rawHistory", "sourceEvents"]));
    expect(JSON.stringify(recalled)).not.toContain("tool.completed");
    const proposal = await surface.call({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "request_influence", arguments: { consumerAgentId: "agent-b", influenceGrantId: grant.id, proposal: { executionId: consumerExecutionId, actor: { runtime: "cold-agent" }, decisionType: "tool_selection", proposedAction: { tool: "tool-b" }, reasoningSummary: "Bounded fallback", memorySliceIds: [slice.id], requestedEffects: ["tool_selection"], proposedAt: completedAt } } } });
    expect(proposal.status).toBe("AUTHORIZED");
    const evaluation = await surface.call({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "submit_outcome_evaluation", arguments: { evaluation: { id: randomUUID(), executionMemoryId: memoryId, memorySliceId: slice.id, influenceGrantId: grant.id, influencedExecutionId: consumerExecutionId, influencedDecisionId: randomUUID(), effect: "BENEFICIAL", effectScore: 0.8, actionChanged: true, treatmentAction: { tool: "tool-b" }, treatmentOutcome: "SUCCESS", updateDirective: "STRENGTHEN", rationale: "Fallback succeeded", evidenceState: "SIMULATED", evaluatedAt: "2026-09-09T00:02:00.000Z" } } } });
    expect(evaluation.status).toBe("UPDATED");
    expect(evaluation.newMemoryId).not.toBe(memoryId);
  });
});
