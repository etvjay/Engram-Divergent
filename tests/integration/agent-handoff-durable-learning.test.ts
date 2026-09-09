import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const fixture = resolve(process.cwd(), "tests/fixtures/tool-recovery/tool-a-rate-limit-failure.json");
const tsx = resolve(process.cwd(), "node_modules/.bin/tsx");

describe("agent/fleet handoff continuity", () => {
  it("projects Agent A experience to Agent B without transferring history or authority", async () => {
    const dir = await mkdtemp(join(tmpdir(), "engram-agent-handoff-"));
    const env = { ...process.env, ENGRAM_SIBYL_DB: join(dir, "memory.db"), ENGRAM_SIBYL_TENANT: "agent-handoff-fixture" };
    const state = join(dir, "agent-a.json");
    const future = join(dir, "agent-b.json");
    try {
      const a = spawnSync(tsx, ["scripts/tool-recovery-process-a.ts", "--agent-id", "agent-a", "--fixture", fixture, "--source-ref", "tests/fixtures/tool-recovery/tool-a-rate-limit-failure.json", "--out", state], { env, encoding: "utf8", timeout: 60_000 });
      if (a.status !== 0) throw new Error(a.stderr || a.stdout);
      const b = spawnSync(tsx, ["scripts/agent-handoff-process-b.ts", "--state", state, "--out", future], { env, encoding: "utf8", timeout: 60_000 });
      if (b.status !== 0) throw new Error(b.stderr || b.stdout);
      const result = JSON.parse(b.stdout) as any;
      expect(result.processBoundary).toEqual({ agentADisappeared: true, freshAgentBProcess: true, inMemoryObjectsReused: false });
      expect(result.sourceAgentId).toBe("agent-a");
      expect(result.consumerAgentId).toBe("agent-b");
      expect(result.disclosure.sourceProvenanceRetained).toBe(true);
      expect(result.disclosure.fullAgentHistoryTransferred).toBe(false);
      expect(result.disclosure.credentialsTransferred).toBe(false);
      expect(result.disclosure.mandateTransferred).toBe(false);
      expect(result.disclosure.signerAuthorityTransferred).toBe(false);
      expect(result.disclosure.rawHistoryExposed).toBe(false);
      expect(result.disclosure.sourceEventsExposed).toBe(false);
      expect(result.positiveAuthorization).toBe("AUTHORIZED");
      expect(result.negativeAuthorization).toMatch(/^REJECTED:INFLUENCE_EFFECT_DENIED:increase_budget/);
      expect(result.wrongConsumerAuthorization).toMatch(/^REJECTED:AGENT_PROPOSAL_CONSUMER_AGENT_MISMATCH/);
      expect(result.unauthorizedInfluenceEscapes).toBe(0);
      expect(result.lineageValidation).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);
});
