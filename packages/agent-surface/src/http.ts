import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAgentSurface } from "./server.js";
import type { AgentSurface } from "./sdk.js";
import type { BehavioralMemoryStore } from "../../experience/src/store.js";

const MAX_BODY_BYTES = 1_048_576;
const MAX_RESPONSE_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_MS = 10_000;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const JsonRecord = z.record(z.string(), z.unknown());
const Empty = z.object({}).strict();
const RecordExecution = z.object({
  execution: JsonRecord,
  events: z.array(z.unknown()).max(1000).optional(),
  outcome: JsonRecord,
  evidenceRefs: z.array(z.string().max(512)).max(100).optional(),
  subject: z.string().max(256).optional(),
  fields: JsonRecord.optional(),
  observation: z.string().max(10_000).optional(),
  interpretation: z.string().max(10_000).optional(),
  applicability: JsonRecord.optional(),
  confidence: z.number().min(0).max(1).optional(),
  memoryType: z.string().max(128).optional(),
  summary: z.string().max(10_000).optional(),
}).strict();
const RecallMemory = z.object({
  executionMemoryId: z.string().uuid(),
  consumerAgentId: z.string().min(1).max(256),
  consumerExecutionId: z.string().min(1).max(256),
  context: JsonRecord.optional(),
  purpose: z.string().max(256).optional(),
  subject: z.string().max(256).optional(),
}).strict();
const InfluenceRequest = z.object({
  consumerAgentId: z.string().min(1).max(256),
  influenceGrantId: z.string().uuid(),
  proposal: JsonRecord,
}).strict();
const OutcomeEvaluation = z.object({ evaluation: JsonRecord }).strict();

type Route = {
  method: string;
  path: string;
  classification: "read" | "write";
  schema: z.ZodTypeAny;
  invoke: (surface: AgentSurface, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const ROUTES: readonly Route[] = [
  { method: "POST", path: "/v1/executions/complete", classification: "write", schema: RecordExecution, invoke: (s, b) => s.call(rpc("record_complete_execution", b)) },
  { method: "POST", path: "/v1/memories/recall", classification: "read", schema: RecallMemory, invoke: (s, b) => s.call(rpc("recall_applicable_memory", b)) },
  { method: "POST", path: "/v1/influence/requests", classification: "write", schema: InfluenceRequest, invoke: (s, b) => s.call(rpc("request_influence", b)) },
  { method: "POST", path: "/v1/outcome-evaluations", classification: "write", schema: OutcomeEvaluation, invoke: (s, b) => s.call(rpc("submit_outcome_evaluation", b)) },
  { method: "GET", path: "/v1/evaluations/summary", classification: "read", schema: Empty, invoke: (s) => s.call(rpc("get_evaluation_summary", {})) },
  { method: "GET", path: "/v1/evaluations/arms", classification: "read", schema: Empty, invoke: (s) => s.call(rpc("compare_arms", {})) },
  { method: "GET", path: "/v1/evaluations/scorecard", classification: "read", schema: Empty, invoke: (s) => s.call(rpc("get_use_case_scorecard", {})) },
  { method: "GET", path: "/v1/evaluations/memory-updates", classification: "read", schema: Empty, invoke: (s) => s.call(rpc("get_memory_update_history", {})) },
  { method: "GET", path: "/v1/evaluations/authority", classification: "read", schema: Empty, invoke: (s) => s.call(rpc("get_authority_boundary_metrics", {})) },
  { method: "GET", path: "/v1/evaluations/evidence", classification: "read", schema: Empty, invoke: (s) => s.call(rpc("get_evidence_receipt", {})) },
];

function rpc(name: string, params: Record<string, unknown>) {
  return { jsonrpc: "2.0" as const, id: randomUUID(), method: "tools/call", params: { name, arguments: params } };
}

function requestId(request: IncomingMessage): string {
  const candidate = request.headers["x-request-id"];
  return typeof candidate === "string" && REQUEST_ID.test(candidate) ? candidate : randomUUID();
}

function errorCode(error: unknown): { status: number; code: string } {
  const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (message.startsWith("AGENT_SURFACE_MEMORY_NOT_FOUND")) return { status: 404, code: "MEMORY_NOT_FOUND" };
  if (message.startsWith("AGENT_SURFACE_GRANT_NOT_FOUND")) return { status: 404, code: "INFLUENCE_GRANT_NOT_FOUND" };
  if (message.startsWith("AGENT_SURFACE_METHOD_NOT_FOUND")) return { status: 404, code: "ROUTE_NOT_FOUND" };
  if (message.includes("CONFLICT") || message.includes("already exists")) return { status: 409, code: "CONFLICT" };
  return { status: 500, code: "INTERNAL_ERROR" };
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new HttpError(413, "BODY_TOO_LARGE");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HttpError(400, "INVALID_JSON"); }
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

function send(response: ServerResponse, requestIdValue: string, status: number, payload: Record<string, unknown>): void {
  const body = JSON.stringify({ ...payload, requestId: requestIdValue });
  if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
    response.writeHead(500, { "content-type": "application/json", "x-request-id": requestIdValue });
    response.end(JSON.stringify({ error: { code: "RESPONSE_TOO_LARGE", message: "Response exceeds bounded limit" }, requestId: requestIdValue }));
    return;
  }
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-request-id": requestIdValue });
  response.end(body);
}

function routeFor(method: string, path: string): Route | undefined {
  return ROUTES.find((route) => route.method === method && route.path === path);
}

export type RestDeploymentMode = "local-loopback" | "hosted-authenticated";
export type RestAuthContext = { request: IncomingMessage; method: string; path: string; classification: "read" | "write" };
export type RestAuthenticator = (context: RestAuthContext) => boolean | Promise<boolean>;
export type RestServerOptions = {
  store?: BehavioralMemoryStore;
  surface?: AgentSurface;
  host?: string;
  port?: number;
  deploymentMode?: RestDeploymentMode;
  authenticate?: RestAuthenticator;
  timeoutMs?: number;
};

type CachedResponse = { status: number; payload: Record<string, unknown> };

export function createRestServer(options: RestServerOptions = {}): Server {
  if (!options.surface && !options.store) throw new Error("REST_SURFACE_STORE_OR_SURFACE_REQUIRED");
  const surface = options.surface ?? createAgentSurface(options.store!);
  const mode = options.deploymentMode ?? "local-loopback";
  const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 120_000));
  const idempotency = new Map<string, { fingerprint: string; response: CachedResponse }>();
  return createServer(async (request, response) => {
    const id = requestId(request);
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
      const loopback = request.socket.remoteAddress === "127.0.0.1" || request.socket.remoteAddress === "::1" || request.socket.remoteAddress === "::ffff:127.0.0.1";
      if (mode === "local-loopback" && !loopback) { send(response, id, 403, { error: { code: "LOOPBACK_ONLY", message: "Local-loopback mode rejects non-loopback clients" } }); return; }
      if (mode === "hosted-authenticated" && !options.authenticate) { send(response, id, 503, { error: { code: "AUTHENTICATOR_REQUIRED", message: "Hosted mode requires an authenticator" } }); return; }
      if (method === "GET" && url.pathname === "/v1/health") {
        send(response, id, 200, { status: "ok", evidence: "LOCAL_LOOPBACK" });
        return;
      }
      if (method === "GET" && url.pathname === "/v1/capabilities") {
        send(response, id, 200, { version: "v1", capabilities: ROUTES.map(({ method: routeMethod, path, classification }) => ({ method: routeMethod, path, classification })) });
        return;
      }
      const route = routeFor(method, url.pathname);
      if (!route) { send(response, id, 404, { error: { code: "NOT_FOUND", message: "Route not found" } }); return; }
      if (options.authenticate && !(await options.authenticate({ request, method, path: url.pathname, classification: route.classification }))) { send(response, id, 401, { error: { code: "UNAUTHORIZED", message: "Authentication required" } }); return; }
      const contentType = request.headers["content-type"];
      if (method !== "GET" && (typeof contentType !== "string" || contentType.split(";", 1)[0] !== "application/json")) throw new HttpError(415, "CONTENT_TYPE_REQUIRED");
      const parsed = route.schema.safeParse(method === "GET" ? {} : await readBody(request));
      if (!parsed.success) { send(response, id, 400, { error: { code: "INVALID_REQUEST", message: "Request does not match the route schema" } }); return; }
      const key = method === "POST" ? request.headers["idempotency-key"] : undefined;
      if (method === "POST" && (typeof key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key))) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED");
      const fingerprint = method === "POST" ? JSON.stringify(parsed.data) : "";
      const cached = method === "POST" ? idempotency.get(`${url.pathname}:${key}`) : undefined;
      if (cached) {
        if (cached.fingerprint !== fingerprint) throw new HttpError(409, "IDEMPOTENCY_KEY_REUSED");
        send(response, id, cached.response.status, cached.response.payload); return;
      }
      const result = await withTimeout(route.invoke(surface, parsed.data as Record<string, unknown>), timeoutMs);
      if (method === "POST") idempotency.set(`${url.pathname}:${key}`, { fingerprint, response: { status: 200, payload: { data: result } } });
      send(response, id, 200, { data: result });
    } catch (error) {
      const mapped = error instanceof HttpError ? { status: error.status, code: error.code } : errorCode(error);
      send(response, id, mapped.status, { error: { code: mapped.code, message: mapped.code === "INTERNAL_ERROR" ? "Request failed" : mapped.code } });
    }
  });
}

export async function listenRestServer(server: Server, options: Pick<RestServerOptions, "host" | "port"> = {}): Promise<{ host: string; port: number }> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, host, () => resolve()); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("REST_SERVER_ADDRESS_UNAVAILABLE");
  return { host, port: address.port };
}

function withTimeout<T>(operation: Promise<T>, timeout: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new HttpError(504, "UPSTREAM_TIMEOUT")), timeout);
    operation.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

export { DEFAULT_TIMEOUT_MS, MAX_BODY_BYTES, MAX_RESPONSE_BYTES, ROUTES };
