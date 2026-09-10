import { describe, expect, it } from "vitest";
import worker from "../../cloudflare/worker.js";
import type { D1Database, D1Result, D1Statement } from "../../packages/sibyl/src/d1-store.js";

class MemoryD1 implements D1Database {
  private rows = new Map<string, { category: string; object_id: string; value: string }>();
  prepare(query: string): D1Statement {
    const binds: unknown[] = [];
    const statement = {
      bind: (...values: unknown[]) => { binds.push(...values); return statement; },
      first: async <T>() => {
        if (query.startsWith("SELECT value") && query.includes("object_id")) return (this.rows.get(`${binds[0]}:${binds[1]}`) ?? null) as T | null;
        return null;
      },
      all: async <T>() => ({ results: [...this.rows.values()].filter((row) => row.category === binds[0]) as T[], success: true } as D1Result<T>),
      run: async () => {
        if (query.startsWith("INSERT")) this.rows.set(`${binds[0]}:${binds[1]}`, { category: String(binds[0]), object_id: String(binds[1]), value: String(binds[2]) });
        return { results: [], success: true };
      },
    } as D1Statement;
    return statement;
  }
}

const execution = (executionId: string) => ({
  execution: { id: executionId, agentId: "worker-agent", workflowType: "tool_recovery", intent: "recover tool", context: { tool: "tool-a" }, constraints: {}, status: "SUCCESS", startedAt: "2026-09-10T00:00:00.000Z", completedAt: "2026-09-10T00:01:00.000Z" },
  events: [{ id: crypto.randomUUID(), executionId, sequenceNo: 0, eventType: "tool.completed", payload: { tool: "tool-a" }, evidenceState: "SIMULATED", occurredAt: "2026-09-10T00:01:00.000Z" }],
  outcome: { id: crypto.randomUUID(), executionId, status: "SUCCESS", summary: "Tool completed", result: { value: "ok" }, evidenceState: "SIMULATED" },
  evidenceRefs: ["local:worker"], subject: "tool-recovery", observation: "Tool completed", interpretation: "Successful tool execution", applicability: { tool: "tool-a" }, confidence: 0.8,
});

describe("Cloudflare Worker boundary", () => {
  it("authenticates and completes the execution endpoint against D1-backed store", async () => {
    const env = { ENGRAM_DB: new MemoryD1(), ENGRAM_API_TOKEN: "test-token" };
    const unauthorized = await worker.fetch(new Request("https://engram.example/v1/capabilities"), env);
    expect(unauthorized.status).toBe(200);
    const denied = await worker.fetch(new Request("https://engram.example/v1/executions/complete", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }), env);
    expect(denied.status).toBe(401);
    const executionId = crypto.randomUUID();
    const accepted = await worker.fetch(new Request("https://engram.example/v1/executions/complete", { method: "POST", body: JSON.stringify(execution(executionId)), headers: { "content-type": "application/json", authorization: "Bearer test-token" } }), env);
    expect(accepted.status).toBe(200);
    expect((await accepted.json() as any).data.status).toBe("ADMITTED");
  });
});
