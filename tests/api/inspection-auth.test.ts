import { afterEach, describe, expect, it } from "vitest";
import { authorizeApi, requiresApiAuthorization } from "../../services/api/src/auth.js";
import { handler } from "../../services/api/src/handler.js";

const originalToken = process.env.ENGRAM_API_TOKEN;

afterEach(() => {
  if (originalToken === undefined) delete process.env.ENGRAM_API_TOKEN;
  else process.env.ENGRAM_API_TOKEN = originalToken;
});

describe("Engram API authorization", () => {
  it("protects every non-demo v1 surface", () => {
    expect(requiresApiAuthorization("GET", "/v1/mcp/status")).toBe(true);
    expect(requiresApiAuthorization("GET", "/v1/control-plane/memories")).toBe(true);
    expect(requiresApiAuthorization("GET", "/v1/executions/11111111-1111-4111-8111-111111111111/trace")).toBe(true);
    expect(requiresApiAuthorization("POST", "/v1/memory/search")).toBe(true);
    expect(requiresApiAuthorization("POST", "/v1/executions")).toBe(true);
    expect(requiresApiAuthorization("POST", "/v1/executions/11111111-1111-4111-8111-111111111111/observations")).toBe(true);

    expect(requiresApiAuthorization("GET", "/health")).toBe(false);
    expect(requiresApiAuthorization("POST", "/v1/demo/run")).toBe(false);
  });

  it("fails closed when no deployment token is configured", () => {
    expect(authorizeApi({ authorization: "Bearer anything" }, undefined)).toEqual({
      ok: false,
      statusCode: 503,
      error: "API_AUTH_NOT_CONFIGURED",
    });
  });

  it("accepts only the exact bearer token", () => {
    expect(authorizeApi(undefined, "secret")).toMatchObject({ ok: false, statusCode: 401 });
    expect(authorizeApi({ Authorization: "Bearer wrong" }, "secret")).toMatchObject({ ok: false, statusCode: 401 });
    expect(authorizeApi({ authorization: "Bearer secret" }, "secret")).toEqual({ ok: true });
  });

  it("rejects a protected read before database access when auth is unconfigured", async () => {
    delete process.env.ENGRAM_API_TOKEN;
    const result = await handler({
      requestContext: { http: { method: "GET" } },
      rawPath: "/v1/control-plane/overview",
    });
    expect(result.statusCode).toBe(503);
    expect(JSON.parse(result.body)).toEqual({ error: "API_AUTH_NOT_CONFIGURED" });
  });

  it("rejects an unauthenticated runtime mutation before database access", async () => {
    delete process.env.ENGRAM_API_TOKEN;
    const result = await handler({
      requestContext: { http: { method: "POST" } },
      rawPath: "/v1/executions",
      body: "{}",
    });
    expect(result.statusCode).toBe(503);
    expect(JSON.parse(result.body)).toEqual({ error: "API_AUTH_NOT_CONFIGURED" });
  });

  it("rejects an incorrect bearer token before database access", async () => {
    process.env.ENGRAM_API_TOKEN = "expected";
    const result = await handler({
      requestContext: { http: { method: "GET" } },
      rawPath: "/v1/control-plane/overview",
      headers: { authorization: "Bearer wrong" },
    });
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: "UNAUTHORIZED" });
  });
});
