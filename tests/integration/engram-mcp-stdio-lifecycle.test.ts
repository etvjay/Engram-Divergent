import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createMcpStdioServer } from "../../packages/agent-surface/src/mcp-stdio.js";
import { SibylBehavioralMemoryStore } from "../../packages/sibyl/src/behavioral-store.js";

const describeSibyl = process.env.ENGRAM_SIBYL_TEST_REQUIRED === "1" ? describe : describe.skip;
let dir = "";
let previousDb: string | undefined;
let previousTenant: string | undefined;

function transport(store: SibylBehavioralMemoryStore) {
  const responses: Array<Record<string, any>> = [];
  const output = { write(chunk: string) { responses.push(JSON.parse(chunk)); return true; } } as any;
  const server = createMcpStdioServer({ store, output });
  return { server, responses };
}

async function call(server: ReturnType<typeof createMcpStdioServer>, responses: Array<Record<string, any>>, id: number, method: string, params?: Record<string, unknown>) {
  await server.handle(JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }));
  return responses.at(-1)!;
}

describeSibyl("cold MCP stdio agent lifecycle", () => {
  beforeEach(async () => {
    dir = await mkdtemp(join("/tmp", "engram-mcp-lifecycle-"));
    previousDb = process.env.ENGRAM_SIBYL_DB;
    previousTenant = process.env.ENGRAM_SIBYL_TENANT;
    process.env.ENGRAM_SIBYL_DB = join(dir, "memory.db");
    process.env.ENGRAM_SIBYL_TENANT = "engram-mcp-lifecycle-test";
  });
  afterEach(async () => {
    if (previousDb === undefined) delete process.env.ENGRAM_SIBYL_DB; else process.env.ENGRAM_SIBYL_DB = previousDb;
    if (previousTenant === undefined) delete process.env.ENGRAM_SIBYL_TENANT; else process.env.ENGRAM_SIBYL_TENANT = previousTenant;
    await rm(dir, { recursive: true, force: true });
  });

  it("completes the full lifecycle through stdio JSON-RPC", async () => {
    const { server, responses } = transport(new SibylBehavioralMemoryStore());
    const executionId = randomUUID();
    const completedAt = "2026-09-10T00:01:00.000Z";
    const recorded = await call(server, responses, 1, "tools/call", { name: "record_complete_execution", arguments: {
      execution: { id: executionId, agentId: "agent-a", workflowType: "tool_recovery", intent: "recover tool", context: { tool: "tool-a", workloadClass: "high" }, constraints: {}, status: "SUCCESS", startedAt: "2026-09-10T00:00:00.000Z", completedAt },
      events: [{ id: randomUUID(), executionId, sequenceNo: 0, eventType: "tool.completed", payload: { tool: "tool-a" }, evidenceState: "SIMULATED", occurredAt: completedAt }],
      outcome: { id: randomUUID(), executionId, status: "SUCCESS", summary: "Tool completed", result: { value: "ok" }, evidenceState: "SIMULATED" }, evidenceRefs: ["local:mcp-lifecycle"], subject: "tool-recovery", observation: "Tool completed", interpretation: "Successful tool execution", applicability: { tool: "tool-a", workloadClass: "high" }, confidence: 0.8,
    } });
    const memoryId = recorded.result.ids.executionMemoryId as string;
    const consumerExecutionId = randomUUID();
    const recalled = await call(server, responses, 2, "tools/call", { name: "recall_applicable_memory", arguments: { executionMemoryId: memoryId, consumerAgentId: "agent-b", consumerExecutionId, context: { tool: "tool-a", workloadClass: "high" }, purpose: "tool_selection", subject: "tool-recovery" } });
    const slice = recalled.result.memorySlice as { id: string; redactedFields: string[] };
    const grant = recalled.result.influenceGrant as { id: string };
    expect(recalled.result.status).toBe("ELIGIBLE");
    expect(slice.redactedFields).toEqual(expect.arrayContaining(["rawHistory", "sourceEvents"]));
    const influenced = await call(server, responses, 3, "tools/call", { name: "request_influence", arguments: { consumerAgentId: "agent-b", influenceGrantId: grant.id, proposal: { executionId: consumerExecutionId, actor: { runtime: "mcp-cold-agent" }, decisionType: "tool_selection", proposedAction: { tool: "tool-b" }, reasoningSummary: "Bounded fallback", memorySliceIds: [slice.id], requestedEffects: ["tool_selection"], proposedAt: completedAt } } });
    expect(influenced.result.status).toBe("AUTHORIZED");
    const evaluated = await call(server, responses, 4, "tools/call", { name: "submit_outcome_evaluation", arguments: { evaluation: { id: randomUUID(), executionMemoryId: memoryId, memorySliceId: slice.id, influenceGrantId: grant.id, influencedExecutionId: consumerExecutionId, influencedDecisionId: randomUUID(), effect: "BENEFICIAL", effectScore: 0.8, actionChanged: true, treatmentAction: { tool: "tool-b" }, treatmentOutcome: "SUCCESS", updateDirective: "STRENGTHEN", rationale: "Fallback succeeded", evidenceState: "SIMULATED", evaluatedAt: "2026-09-10T00:02:00.000Z" } } });
    expect(evaluated.result.status).toBe("UPDATED");
    expect(evaluated.result.newMemoryId).not.toBe(memoryId);
  }, 30_000);
});
