import { createInterface } from "node:readline";
import { SibylBehavioralMemoryStore } from "../packages/sibyl/src/behavioral-store.js";
import { createAgentSurface } from "../packages/agent-surface/src/server.js";

const surface = createAgentSurface(new SibylBehavioralMemoryStore());
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  let request: any;
  try {
    request = JSON.parse(line);
    const result = await surface.call(request);
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result })}\n`);
  } catch (error) {
    const typed = error as { code?: string; message?: string; details?: unknown };
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request?.id ?? null, error: { code: typed.code ?? "ENGRAM_AGENT_SURFACE_ERROR", message: typed.message ?? String(error), ...(typed.details ? { details: typed.details } : {}) } })}\n`);
  }
}
