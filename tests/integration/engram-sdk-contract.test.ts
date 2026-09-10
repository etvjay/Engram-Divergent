import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { EngramClient, EngramRefusalError, type AgentSurface } from "../../packages/agent-surface/src/index.js";

function surfaceFor(call: AgentSurface["call"]): AgentSurface {
  return { call, listTools: () => [], listResources: () => [] } as AgentSurface;
}

function runNode(script: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", script], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

describe("public typed Engram SDK contract", () => {
  it("normalizes canonical authority refusal without retrying it", async () => {
    const client = new EngramClient({ surface: surfaceFor(async () => { throw new Error("AGENT_PROPOSAL_CONSUMER_AGENT_MISMATCH"); }) });
    let calls = 0;
    await expect(client.withRecovery(async () => { calls += 1; return client.requestInfluence({ consumerAgentId: "wrong", influenceGrantId: "bad", proposal: {} }); })).rejects.toBeInstanceOf(EngramRefusalError);
    expect(calls).toBe(1);
  });

  it("supports bounded recovery only for retryable failures", async () => {
    let calls = 0;
    const client = new EngramClient({ surface: surfaceFor(async () => { throw new Error("temporary service failure"); }) });
    await expect(client.withRecovery(async () => { calls += 1; return client.getUseCaseScorecard(); }, { attempts: 2 })).rejects.toMatchObject({ code: "INTERNAL", retryable: true, recovery: "retry" });
    expect(calls).toBe(2);
  });

  it("imports the public entrypoint from a fresh temporary package context", async () => {
    const dir = await mkdtemp(join("/tmp", "engram-cold-consumer-"));
    try {
      const entry = fileURLToPath(new URL("../../dist/packages/agent-surface/src/index.js", import.meta.url));
      const script = `import { EngramClient, EngramError, createEngramClient } from ${JSON.stringify(entry)};\nif (typeof EngramClient !== "function" || typeof EngramError !== "function" || typeof createEngramClient !== "function") throw new Error("PUBLIC_EXPORT_MISSING");\nconsole.log("cold-consumer-ok");`;
      await writeFile(join(dir, "package.json"), JSON.stringify({ type: "module" }));
      const result = await runNode(script);
      expect(result.code, result.stderr).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
