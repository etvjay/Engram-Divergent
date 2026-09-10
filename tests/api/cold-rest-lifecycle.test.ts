import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createRestServer, listenRestServer } from "../../packages/agent-surface/src/http.js";
import { SibylBehavioralMemoryStore } from "../../packages/sibyl/src/behavioral-store.js";

const describeSibyl = process.env.ENGRAM_SIBYL_TEST_REQUIRED === "1" ? describe : describe.skip;
let dir = "";
let server: ReturnType<typeof createRestServer> | undefined;
let previousDb: string | undefined;
let previousTenant: string | undefined;

async function post(base: string, path: string, body: Record<string, unknown>, key: string): Promise<{ status: number; json: Record<string, any> }> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() as Record<string, any> };
}

describeSibyl("cold REST agent lifecycle", () => {
  beforeEach(async () => {
    dir = await mkdtemp(join("/tmp", "engram-rest-lifecycle-"));
    previousDb = process.env.ENGRAM_SIBYL_DB;
    previousTenant = process.env.ENGRAM_SIBYL_TENANT;
    process.env.ENGRAM_SIBYL_DB = join(dir, "memory.db");
    process.env.ENGRAM_SIBYL_TENANT = "engram-rest-lifecycle-test";
  });
  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    if (previousDb === undefined) delete process.env.ENGRAM_SIBYL_DB; else process.env.ENGRAM_SIBYL_DB = previousDb;
    if (previousTenant === undefined) delete process.env.ENGRAM_SIBYL_TENANT; else process.env.ENGRAM_SIBYL_TENANT = previousTenant;
    await rm(dir, { recursive: true, force: true });
  });

  it("completes the full Engram lifecycle through HTTP endpoints", async () => {
    server = createRestServer({ store: new SibylBehavioralMemoryStore() });
    const address = await listenRestServer(server);
    const base = `http://${address.host}:${address.port}`;
    const executionId = randomUUID();
    const eventId = randomUUID();
    const outcomeId = randomUUID();
    const completedAt = "2026-09-10T00:01:00.000Z";
    const recorded = await post(base, "/v1/executions/complete", {
      execution: { id: executionId, agentId: "agent-a", workflowType: "tool_recovery", intent: "recover tool", context: { tool: "tool-a", workloadClass: "high" }, constraints: {}, status: "SUCCESS", startedAt: "2026-09-10T00:00:00.000Z", completedAt },
      events: [{ id: eventId, executionId, sequenceNo: 0, eventType: "tool.completed", payload: { tool: "tool-a" }, evidenceState: "SIMULATED", occurredAt: completedAt }],
      outcome: { id: outcomeId, executionId, status: "SUCCESS", summary: "Tool completed", result: { value: "ok" }, evidenceState: "SIMULATED" },
      evidenceRefs: ["local:rest-lifecycle"], subject: "tool-recovery", observation: "Tool completed", interpretation: "Successful tool execution", applicability: { tool: "tool-a", workloadClass: "high" }, confidence: 0.8,
    }, "rest-record-1");
    expect(recorded.status).toBe(200);
    expect(recorded.json.data.status).toBe("ADMITTED");
    const memoryId = recorded.json.data.ids.executionMemoryId as string;

    const consumerExecutionId = randomUUID();
    const recalled = await post(base, "/v1/memories/recall", { executionMemoryId: memoryId, consumerAgentId: "agent-b", consumerExecutionId, context: { tool: "tool-a", workloadClass: "high" }, purpose: "tool_selection", subject: "tool-recovery" }, "rest-recall-1");
    expect(recalled.status).toBe(200);
    expect(recalled.json.data.status).toBe("ELIGIBLE");
    const slice = recalled.json.data.memorySlice as { id: string; redactedFields: string[] };
    const grant = recalled.json.data.influenceGrant as { id: string };
    expect(slice.redactedFields).toEqual(expect.arrayContaining(["rawHistory", "sourceEvents"]));
    expect(JSON.stringify(recalled.json)).not.toContain("tool.completed");

    const influenced = await post(base, "/v1/influence/requests", { consumerAgentId: "agent-b", influenceGrantId: grant.id, proposal: { executionId: consumerExecutionId, actor: { runtime: "rest-cold-agent" }, decisionType: "tool_selection", proposedAction: { tool: "tool-b" }, reasoningSummary: "Bounded fallback", memorySliceIds: [slice.id], requestedEffects: ["tool_selection"], proposedAt: completedAt } }, "rest-influence-1");
    expect(influenced.status).toBe(200);
    expect(influenced.json.data.status).toBe("AUTHORIZED");

    const evaluation = await post(base, "/v1/outcome-evaluations", { evaluation: { id: randomUUID(), executionMemoryId: memoryId, memorySliceId: slice.id, influenceGrantId: grant.id, influencedExecutionId: consumerExecutionId, influencedDecisionId: randomUUID(), effect: "BENEFICIAL", effectScore: 0.8, actionChanged: true, treatmentAction: { tool: "tool-b" }, treatmentOutcome: "SUCCESS", updateDirective: "STRENGTHEN", rationale: "Fallback succeeded", evidenceState: "SIMULATED", evaluatedAt: "2026-09-10T00:02:00.000Z" } }, "rest-evaluation-1");
    expect(evaluation.status).toBe(200);
    expect(evaluation.json.data.status).toBe("UPDATED");
    expect(evaluation.json.data.newMemoryId).not.toBe(memoryId);
  }, 30_000);
});
