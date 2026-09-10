import { describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

type Response = { jsonrpc: string; id: string | number | null; result?: Record<string, unknown>; error?: { code: string; message: string } };

function launch() {
  const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/engram-mcp.ts"], { cwd: resolve(import.meta.dirname, "../.."), stdio: ["pipe", "pipe", "pipe"] });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map<string | number, (value: Response) => void>();
  lines.on("line", (line) => { try { const response = JSON.parse(line) as Response; if (response.id !== null) pending.get(response.id)?.(response); } catch { /* assertions cover protocol responses */ } });
  const request = (id: string | number, method: string, params?: Record<string, unknown>) => new Promise<Response>((resolveResponse) => {
    pending.set(id, resolveResponse);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) })}\n`);
  });
  return { child, request };
}

async function stop(child: ChildProcessWithoutNullStreams) { child.stdin.end(); await new Promise<void>((resolveStop) => child.once("close", () => resolveStop())); }

describe("packaged Engram MCP stdio consumer", () => {
  it("initializes, discovers bounded surfaces, executes locally, and refuses bad input", async () => {
    const { child, request } = launch();
    try {
      const initialized = await request(1, "initialize", { protocolVersion: "2026-06-18", capabilities: {}, clientInfo: { name: "temporary-consumer", version: "0.0.0" } });
      expect(initialized.result?.serverInfo).toMatchObject({ name: "engram-agent-surface" });
      const tools = await request(2, "tools/list");
      const listed = tools.result?.tools as Array<Record<string, unknown>>;
      expect(listed).toHaveLength(10);
      expect(listed.every((tool) => (tool._meta as Record<string, unknown>)?.hosted === false)).toBe(true);
      expect(listed.filter((tool) => (tool._meta as Record<string, unknown>)?.access === "read")).toHaveLength(6);
      expect(listed.filter((tool) => (tool._meta as Record<string, unknown>)?.access === "write")).toHaveLength(4);
      expect((await request(3, "resources/list")).result?.resources).toHaveLength(5);
      const local = await request(4, "tools/call", { name: "get_evidence_receipt", arguments: { runId: "latest" } });
      expect(local.result).toMatchObject({ requestedRunId: "latest" });
      const malformed = await request(5, "tools/call", { name: "recall_applicable_memory", arguments: {} });
      expect(malformed.error?.code).toBe("MCP_INVALID_ARGUMENTS");
      const refused = await request(6, "tools/call", { name: "not-a-tool", arguments: {} });
      expect(refused.error?.code).toBe("MCP_TOOL_NOT_FOUND");
      child.stdin.write("not-json\n");
      const invalid = await request(randomUUID(), "tools/list");
      expect(invalid.result?.tools).toHaveLength(10);
    } finally { await stop(child); }
  }, 15_000);
});
