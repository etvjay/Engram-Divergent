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
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request?.id ?? null, error: { code: "ENGRAM_AGENT_SURFACE_ERROR", message: error instanceof Error ? error.message : String(error) } })}\n`);
  }
}
