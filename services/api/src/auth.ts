import { timingSafeEqual } from "node:crypto";

export type ApiAuthorization =
  | { ok: true }
  | { ok: false; statusCode: 401 | 503; error: "UNAUTHORIZED" | "API_AUTH_NOT_CONFIGURED" };

function normalizedHeader(headers: Record<string, string | undefined> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * /health and the deterministic hackathon demo are intentionally public.
 * Every other /v1 route requires the API bearer token so callers cannot read
 * operational memory or mutate arbitrary executions anonymously.
 */
export function requiresApiAuthorization(method: string, path: string): boolean {
  if (!path.startsWith("/v1/")) return false;
  if (method === "POST" && path === "/v1/demo/run") return false;
  return true;
}

export function authorizeApi(
  headers: Record<string, string | undefined> | undefined,
  expectedToken = process.env.ENGRAM_API_TOKEN?.trim(),
): ApiAuthorization {
  if (!expectedToken) {
    return { ok: false, statusCode: 503, error: "API_AUTH_NOT_CONFIGURED" };
  }

  const authorization = normalizedHeader(headers, "authorization")?.trim();
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return { ok: false, statusCode: 401, error: "UNAUTHORIZED" };
  }

  const supplied = authorization.slice(7).trim();
  if (!supplied || !safeEqual(supplied, expectedToken)) {
    return { ok: false, statusCode: 401, error: "UNAUTHORIZED" };
  }

  return { ok: true };
}
