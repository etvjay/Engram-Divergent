import { describe, expect, it } from "vitest";
import { httpTransport } from "../../packages/sdk/src/http.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Engram HTTP transport", () => {
  it("maps the execution lifecycle to the canonical runtime API", async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const executionId = "11111111-1111-4111-8111-111111111111";
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });

      if (url.endsWith("/v1/executions") && method === "POST") return jsonResponse({ executionId }, 201);
      if (url.endsWith(`/v1/executions/${executionId}/recall`)) {
        return jsonResponse({ recall: { id: "r1", executionId, candidates: [] }, candidates: [], rejected: [] });
      }
      if (url.endsWith(`/v1/executions/${executionId}/decisions`)) {
        return jsonResponse({ id: "d1", executionId, influences: [] }, 201);
      }
      if (url.endsWith(`/v1/executions/${executionId}/observations`)) return jsonResponse({ ok: true }, 201);
      if (url.endsWith(`/v1/executions/${executionId}/complete`)) {
        return jsonResponse({ executionId, admittedMemories: [], rejectedSignals: [] });
      }
      if (url.endsWith(`/v1/executions/${executionId}/trace`)) return jsonResponse({ execution: { id: executionId } });
      return jsonResponse({ error: "NOT_FOUND" }, 404);
    };

    const transport = httpTransport({ baseUrl: "https://engram.example/", fetch: fetchMock });
    const started = await transport.startExecution({
      agentId: "agent",
      workflowType: "deployment",
      intent: "deploy",
      context: {},
      constraints: {},
    });
    await transport.recall(started.executionId, { query: "prior failures" });
    await transport.recordDecision(started.executionId, {
      decisionType: "STRATEGY",
      selectedAction: { strategy: "safe" },
      reasoningSummary: "application decision",
    });
    await transport.observe(started.executionId, {
      type: "STARTED",
      payload: {},
      evidenceState: "OBSERVED",
    });
    await transport.complete(started.executionId, {
      status: "SUCCESS",
      summary: "done",
      evidenceState: "OBSERVED",
    });
    await transport.trace(started.executionId);

    expect(calls.map(({ url, method }) => `${method} ${new URL(url).pathname}`)).toEqual([
      "POST /v1/executions",
      `POST /v1/executions/${executionId}/recall`,
      `POST /v1/executions/${executionId}/decisions`,
      `POST /v1/executions/${executionId}/observations`,
      `POST /v1/executions/${executionId}/complete`,
      `GET /v1/executions/${executionId}/trace`,
    ]);
  });

  it("adds the configured API bearer token to requests", async () => {
    let authorization: string | null = null;
    const transport = httpTransport({
      baseUrl: "https://engram.example",
      apiToken: "sdk-secret",
      fetch: async (_input, init) => {
        authorization = new Headers(init?.headers).get("authorization");
        return jsonResponse({ executionId: "11111111-1111-4111-8111-111111111111" }, 201);
      },
    });

    await transport.startExecution({
      agentId: "agent",
      workflowType: "deployment",
      intent: "deploy",
      context: {},
      constraints: {},
    });
    expect(authorization).toBe("Bearer sdk-secret");
  });

  it("surfaces structured HTTP failures", async () => {
    const transport = httpTransport({
      baseUrl: "https://engram.example",
      fetch: async () => jsonResponse({ error: "PROTOCOL_VIOLATION", message: "INFLUENCE_WITHOUT_RECALL" }, 409),
    });

    await expect(transport.trace("11111111-1111-4111-8111-111111111111"))
      .rejects.toMatchObject({ status: 409, message: "INFLUENCE_WITHOUT_RECALL" });
  });
});
