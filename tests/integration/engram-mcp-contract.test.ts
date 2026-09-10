import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createAgentSurface } from "../../packages/agent-surface/src/server.js";
import { SibylBehavioralMemoryStore } from "../../packages/sibyl/src/behavioral-store.js";
import type { BehavioralMemoryStore } from "../../packages/experience/src/store.js";

const noopStore = {} as BehavioralMemoryStore;

async function fixtureRoot() {
  const root = await mkdtemp(join("/tmp", "engram-mcp-contract-"));
  const dir = join(root, "evidence/canonical/analysis/latest");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "manifest.json"), JSON.stringify({ schema: "test-manifest" }));
  await writeFile(join(dir, "arm-metrics.csv"), "arm,utility\nA,1\n");
  await writeFile(join(dir, "heldout-evaluation.json"), JSON.stringify({ toolRecovery: { metrics: { escapes: 0 } }, agentHandoff: { metrics: { escapes: 0 } } }));
  await writeFile(join(dir, "eval-scorecard.json"), JSON.stringify({ rows: [] }));
  return { root, async close() { await rm(root, { recursive: true, force: true }); } };
}

describe("Engram MCP contract", () => {
  it("advertises schemas and only bounded tools/resources", async () => {
    const fixture = await fixtureRoot();
    try {
      const surface = createAgentSurface(noopStore, { evaluationRoot: fixture.root });
      const tools = (await surface.call({ jsonrpc: "2.0", id: 1, method: "tools/list" })).tools as Array<Record<string, unknown>>;
      expect(tools).toHaveLength(10);
      expect(tools.every((tool) => tool.inputSchema)).toBe(true);
      expect(tools.filter((tool) => (tool.annotations as Record<string, unknown>)?.readOnlyHint === true)).toHaveLength(6);
      expect(tools.map((tool) => tool.name)).not.toContain("raw_sibyl");
      expect((await surface.call({ jsonrpc: "2.0", id: 2, method: "resources/list" })).resources).toEqual([
        { uri: "engram://evaluations/latest" }, { uri: "engram://evaluations/latest/arms" }, { uri: "engram://evaluations/latest/observations" }, { uri: "engram://evaluations/latest/provenance" }, { uri: "engram://evaluations/latest/scorecard" },
      ]);
    } finally { await fixture.close(); }
  });

  it("rejects malformed and unknown tool/resource requests before domain access", async () => {
    const surface = createAgentSurface(noopStore);
    await expect(surface.call({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "recall_applicable_memory", arguments: {} } })).rejects.toThrow();
    await expect(surface.call({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "not-a-tool", arguments: {} } })).rejects.toMatchObject({ code: "MCP_TOOL_NOT_FOUND" });
    await expect(surface.call({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "engram://not-allowlisted" } })).rejects.toThrow("EVALUATION_RESOURCE_NOT_FOUND");
  });

  it("routes each allowlisted resource to its bounded read-only source", async () => {
    const fixture = await fixtureRoot();
    try {
      const surface = createAgentSurface(noopStore, { evaluationRoot: fixture.root });
      expect(await surface.call({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "engram://evaluations/latest/arms" } })).toMatchObject({ source: "evidence/canonical/analysis/latest/arm-metrics.csv" });
      expect(await surface.call({ jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "engram://evaluations/latest/scorecard" } })).toEqual({ rows: [] });
    } finally { await fixture.close(); }
  });

  it("contains authority to the persisted grant consumer and safe effects", async () => {
    const grantId = randomUUID();
    const sliceId = randomUUID();
    const executionId = randomUUID();
    const store = { getInfluenceGrant: async () => ({ id: grantId, memorySliceId: sliceId, consumerAgentId: "agent-a", consumerExecutionId: executionId, allowedEffects: ["tool_selection"], deniedEffects: ["new_wallet"], constraints: {}, issuedAt: new Date() }) } as unknown as BehavioralMemoryStore;
    const surface = createAgentSurface(store);
    const proposal = { executionId, actor: { runtime: "test" }, decisionType: "tool_selection", proposedAction: { tool: "safe" }, reasoningSummary: "bounded", memorySliceIds: [sliceId], requestedEffects: ["new_wallet"], proposedAt: new Date().toISOString() };
    await expect(surface.call({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "request_influence", arguments: { influenceGrantId: grantId, consumerAgentId: "agent-b", proposal } } })).rejects.toThrow("AGENT_PROPOSAL_CONSUMER_AGENT_MISMATCH");
    await expect(surface.call({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "request_influence", arguments: { influenceGrantId: grantId, consumerAgentId: "agent-a", proposal } } })).rejects.toThrow("INFLUENCE_EFFECT_DENIED:new_wallet");
  });

  it("normalizes a hung Sibyl bridge into a bounded timeout", async () => {
    const fixture = await mkdtemp(join("/tmp", "engram-mcp-timeout-"));
    const priorBridge = process.env.ENGRAM_SIBYL_BRIDGE;
    const priorTimeout = process.env.ENGRAM_SIBYL_TIMEOUT_MS;
    try {
      const bridge = join(fixture, "hung.py");
      await writeFile(bridge, "import time\ntime.sleep(2)\n");
      process.env.ENGRAM_SIBYL_BRIDGE = bridge;
      process.env.ENGRAM_SIBYL_TIMEOUT_MS = "20";
      await expect(new SibylBehavioralMemoryStore().getEpisode(randomUUID())).rejects.toThrow("SIBYL_BRIDGE_TIMEOUT");
    } finally {
      if (priorBridge === undefined) delete process.env.ENGRAM_SIBYL_BRIDGE; else process.env.ENGRAM_SIBYL_BRIDGE = priorBridge;
      if (priorTimeout === undefined) delete process.env.ENGRAM_SIBYL_TIMEOUT_MS; else process.env.ENGRAM_SIBYL_TIMEOUT_MS = priorTimeout;
      await rm(fixture, { recursive: true, force: true });
    }
  });
});
