import { describe, expect, it } from "vitest";
import { authorizeApi, requiresApiAuthorization } from "../../services/api/src/auth.js";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("Engram API authorization", () => {
  it("classifies every non-demo v1 surface as protected", () => {
    const protectedRoutes: Array<[string, string]> = [
      ["GET", "/v1/mcp/status"],
      ["GET", `/v1/mcp/memories/${UUID}/provenance`],
      ["GET", "/v1/control-plane/overview"],
      ["GET", "/v1/control-plane/agents"],
      ["GET", "/v1/control-plane/executions"],
      ["GET", "/v1/control-plane/memories"],
      ["GET", "/v1/control-plane/influences"],
      ["GET", "/v1/control-plane/policies"],
      ["GET", "/v1/control-plane/policy-assignments"],
      ["GET", `/v1/control-plane/memories/${UUID}/evaluation`],
      ["GET", `/v1/executions/${UUID}/trace`],
      ["POST", "/v1/memory/search"],
      ["POST", "/v1/executions"],
      ["POST", `/v1/executions/${UUID}/recall`],
      ["POST", `/v1/executions/${UUID}/decisions`],
      ["POST", `/v1/executions/${UUID}/observations`],
      ["POST", `/v1/executions/${UUID}/complete`],
    ];

    for (const [method, path] of protectedRoutes) {
      expect(requiresApiAuthorization(method, path), `${method} ${path}`).toBe(true);
    }
  });

  it("keeps health and the deterministic demo public", () => {
    expect(requiresApiAuthorization("GET", "/health")).toBe(false);
    expect(requiresApiAuthorization("POST", "/v1/demo/run")).toBe(false);
  });

  it("fails closed when API auth is unconfigured or invalid", () => {
    expect(authorizeApi(undefined, undefined)).toEqual({
      ok: false,
      statusCode: 503,
      error: "API_AUTH_NOT_CONFIGURED",
    });
    expect(authorizeApi({ authorization: "Bearer wrong" }, "expected")).toEqual({
      ok: false,
      statusCode: 401,
      error: "UNAUTHORIZED",
    });
    expect(authorizeApi({ Authorization: "Bearer expected" }, "expected")).toEqual({ ok: true });
  });
});
