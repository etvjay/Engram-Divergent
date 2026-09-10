import { createAgentSurface } from "../packages/agent-surface/src/server.js";
import { D1BehavioralMemoryStore } from "../packages/sibyl/src/d1-store.js";
import type { D1Database } from "../packages/sibyl/src/d1-store.js";

export interface Env { ENGRAM_DB: D1Database; ENGRAM_API_TOKEN: string; }
const MAX_BODY_BYTES = 1_048_576;
const MAX_RESPONSE_BYTES = 1_048_576;
const TOKEN = "Bearer ";
const routeMap: Record<string, string> = {
  "POST /v1/executions/complete": "record_complete_execution",
  "POST /v1/memories/recall": "recall_applicable_memory",
  "POST /v1/influence/requests": "request_influence",
  "POST /v1/outcome-evaluations": "submit_outcome_evaluation",
  "GET /v1/evaluations/summary": "get_evaluation_summary",
  "GET /v1/evaluations/arms": "compare_arms",
  "GET /v1/evaluations/scorecard": "get_use_case_scorecard",
  "GET /v1/evaluations/memory-updates": "get_memory_update_history",
  "GET /v1/evaluations/authority": "get_authority_boundary_metrics",
  "GET /v1/evaluations/evidence": "get_evidence_receipt",
};

type IdempotencyRow = { fingerprint: string; response_status: number; response_body: string };
function headers(requestId: string): HeadersInit { return { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-request-id": requestId }; }
function response(status: number, body: Record<string, unknown>, requestId: string): Response {
  const payload = JSON.stringify({ ...body, requestId });
  if (payload.length > MAX_RESPONSE_BYTES) return new Response(JSON.stringify({ error: { code: "RESPONSE_TOO_LARGE" }, requestId }), { status: 500, headers: headers(requestId) });
  return new Response(payload, { status, headers: headers(requestId) });
}
function cachedResponse(row: IdempotencyRow): Response { return new Response(row.response_body, { status: row.response_status, headers: headers(JSON.parse(row.response_body).requestId ?? globalThis.crypto.randomUUID()) }); }
function errorCode(error: unknown): { status: number; code: string } {
  const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (message === "BODY_TOO_LARGE" || message === "INVALID_JSON") return { status: 400, code: message };
  if (error instanceof Error && error.name === "ZodError") return { status: 400, code: "INVALID_REQUEST" };
  if (message.includes("MEMORY_NOT_FOUND")) return { status: 404, code: "MEMORY_NOT_FOUND" };
  if (message.includes("GRANT_NOT_FOUND")) return { status: 404, code: "INFLUENCE_GRANT_NOT_FOUND" };
  if (message.includes("CONFLICT")) return { status: 409, code: "CONFLICT" };
  return { status: 500, code: "INTERNAL_ERROR" };
}
async function body(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { throw new Error("INVALID_JSON"); }
}
async function getIdempotency(db: D1Database, routeKey: string, requestKey: string): Promise<IdempotencyRow | null> {
  return db.prepare("SELECT fingerprint, response_status, response_body FROM engram_idempotency WHERE route_key = ? AND request_key = ?").bind(routeKey, requestKey).first<IdempotencyRow>();
}
async function putIdempotency(db: D1Database, routeKey: string, requestKey: string, fingerprint: string, status: number, responseBody: string): Promise<void> {
  await db.prepare("INSERT INTO engram_idempotency (route_key, request_key, fingerprint, response_status, response_body) VALUES (?, ?, ?, ?, ?)").bind(routeKey, requestKey, fingerprint, status, responseBody).run();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = request.headers.get("x-request-id") ?? globalThis.crypto.randomUUID();
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/v1/health") return response(200, { status: "ok", evidence: "HOSTED_CLOUDFLARE_D1" }, requestId);
    if (request.method === "GET" && url.pathname === "/v1/capabilities") return response(200, { version: "v1", capabilities: Object.keys(routeMap).map((key) => { const [method, path] = key.split(" "); return { method, path, classification: method === "GET" ? "read" : "write" }; }) }, requestId);
    const routeKey = `${request.method} ${url.pathname}`;
    const name = routeMap[routeKey];
    if (!name) return response(404, { error: { code: "NOT_FOUND", message: "Route not found" } }, requestId);
    const supplied = request.headers.get("authorization") ?? "";
    if (!env.ENGRAM_API_TOKEN || supplied !== `${TOKEN}${env.ENGRAM_API_TOKEN}`) return response(401, { error: { code: "UNAUTHORIZED", message: "Authentication required" } }, requestId);
    try {
      const params = request.method === "GET" ? {} : await body(request);
      const idempotencyKey = request.method === "POST" ? request.headers.get("idempotency-key") : null;
      if (request.method === "POST" && !idempotencyKey) return response(400, { error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key is required" } }, requestId);
      const fingerprint = JSON.stringify(params);
      if (idempotencyKey) {
        const existing = await getIdempotency(env.ENGRAM_DB, routeKey, idempotencyKey);
        if (existing) {
          if (existing.fingerprint !== fingerprint) return response(409, { error: { code: "IDEMPOTENCY_KEY_REUSED", message: "Idempotency key was reused for a different request" } }, requestId);
          return cachedResponse(existing);
        }
      }
      const surface = createAgentSurface(new D1BehavioralMemoryStore(env.ENGRAM_DB));
      const result = await surface.call({ jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name, arguments: params } });
      const payload = JSON.stringify({ data: result, requestId });
      if (idempotencyKey) await putIdempotency(env.ENGRAM_DB, routeKey, idempotencyKey, fingerprint, 200, payload);
      return new Response(payload, { status: 200, headers: headers(requestId) });
    } catch (error) {
      console.error("ENGRAM_WORKER_FAILURE", requestId, error instanceof Error ? error.message : String(error));
      const mapped = errorCode(error);
      return response(mapped.status, { error: { code: mapped.code, message: mapped.code } }, requestId);
    }
  },
};
