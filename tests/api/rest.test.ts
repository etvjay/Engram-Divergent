import { afterEach, describe, expect, it } from "vitest";
import { createRestServer, listenRestServer, MAX_BODY_BYTES } from "../../packages/agent-surface/src/http.js";
import type { AgentSurface } from "../../packages/agent-surface/src/sdk.js";

const surface = {
  call: async (request: { params?: Record<string, unknown> }) => ({
    status: "ADMITTED",
    operation: request.params?.name ?? "unknown",
  }),
} as unknown as AgentSurface;

let server: ReturnType<typeof createRestServer> | undefined;
afterEach(async () => { if (server) await new Promise<void>((resolve) => server!.close(() => resolve())); server = undefined; });

async function app() {
  server = createRestServer({ surface });
  const address = await listenRestServer(server);
  return `http://${address.host}:${address.port}`;
}

describe("versioned REST surface", () => {
  it("exposes only bounded, classified capabilities", async () => {
    const base = await app();
    const response = await fetch(`${base}/v1/capabilities`);
    expect(response.status).toBe(200);
    const body = await response.json() as { capabilities: Array<{ path: string; classification: string }> };
    expect(body.capabilities).toEqual(expect.arrayContaining([
      { method: "POST", path: "/v1/executions/complete", classification: "write" },
      { method: "POST", path: "/v1/memories/recall", classification: "read" },
      { method: "GET", path: "/v1/evaluations/summary", classification: "read" },
    ]));
    expect(body.capabilities.some((item) => item.path.includes("sibyl") || item.path.includes("secret"))).toBe(false);
  });

  it("routes a strict write request and preserves the request id", async () => {
    const base = await app();
    const response = await fetch(`${base}/v1/executions/complete`, {
      method: "POST", headers: { "content-type": "application/json", "x-request-id": "contract-test-1", "idempotency-key": "contract-write-1" },
      body: JSON.stringify({ execution: { id: "execution-1" }, outcome: { id: "outcome-1" } }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("contract-test-1");
    expect((await response.json()).requestId).toBe("contract-test-1");
  });

  it("rejects malformed, wrong content type, unknown, and oversized requests without internals", async () => {
    const base = await app();
    const malformed = await fetch(`${base}/v1/executions/complete`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "malformed-1" }, body: JSON.stringify({ execution: {} }) });
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error).toEqual({ code: "INVALID_REQUEST", message: "Request does not match the route schema" });
    const wrongType = await fetch(`${base}/v1/executions/complete`, { method: "POST", body: "{}" });
    expect(wrongType.status).toBe(415);
    const unknown = await fetch(`${base}/v1/not-a-route`);
    expect(unknown.status).toBe(404);
    const oversized = await fetch(`${base}/v1/executions/complete`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "oversized-1" }, body: JSON.stringify({ execution: {}, outcome: {}, summary: "x".repeat(MAX_BODY_BYTES) }) });
    expect(oversized.status).toBe(413);
    expect(JSON.stringify(await oversized.json())).not.toContain("Sibyl");
  });

  it("returns a local-loopback health evidence marker", async () => {
    const base = await app();
    const response = await fetch(`${base}/v1/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", evidence: "LOCAL_LOOPBACK" });
  });

  it("replays an idempotent write and rejects key reuse with a new body", async () => {
    const base = await app();
    const headers = { "content-type": "application/json", "idempotency-key": "replay-1" };
    const body = JSON.stringify({ execution: { id: "execution-1" }, outcome: { id: "outcome-1" } });
    const first = await fetch(`${base}/v1/executions/complete`, { method: "POST", headers, body });
    const replay = await fetch(`${base}/v1/executions/complete`, { method: "POST", headers, body });
    expect(first.status).toBe(200); expect(replay.status).toBe(200);
    expect((await replay.json()).data).toEqual((await first.json()).data);
    const reused = await fetch(`${base}/v1/executions/complete`, { method: "POST", headers, body: JSON.stringify({ execution: { id: "different" }, outcome: { id: "outcome-1" } }) });
    expect(reused.status).toBe(409);
  });

  it("fails closed for hosted mode without an authenticator", async () => {
    server = createRestServer({ surface, deploymentMode: "hosted-authenticated" });
    const address = await listenRestServer(server);
    const response = await fetch(`http://${address.host}:${address.port}/v1/health`);
    expect(response.status).toBe(503);
  });
});
