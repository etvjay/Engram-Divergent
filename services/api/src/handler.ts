import { z } from "zod";
import type pg from "pg";
import { createCockroachPool } from "../../../packages/cockroach/src/client.js";
import { CockroachMemoryRepository } from "../../../packages/cockroach/src/repository.js";
import { CockroachControlPlaneStore } from "../../../packages/cockroach/src/control-plane.js";
import { CockroachMemoryEvaluationStore } from "../../../packages/cockroach/src/evaluation-store.js";
import { TitanEmbeddingProvider } from "../../../packages/bedrock/src/embeddings.js";
import { getCockroachMcpStatus, inspectMemoryProvenanceViaMcp } from "../../../packages/cockroach-mcp/src/client.js";
import { getEngramRuntime } from "../../runtime/src/create-runtime.js";
import { getEngramDemoRuntime } from "../../demo/src/create-demo-runtime.js";
import { runEngramRuntimeDemo } from "../../demo/src/run-runtime-demo.js";
import { authorizeApi, requiresApiAuthorization } from "./auth.js";

export type ApiGatewayV2Event = {
  requestContext?: { http?: { method?: string } };
  rawPath?: string;
  pathParameters?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
};

export type ApiGatewayV2Response = { statusCode: number; headers: Record<string, string>; body: string };

let pool: pg.Pool | undefined;
let repository: CockroachMemoryRepository | undefined;
let controlPlane: CockroachControlPlaneStore | undefined;
let evaluationStore: CockroachMemoryEvaluationStore | undefined;

function getPool(): pg.Pool { if (!pool) pool = createCockroachPool(); return pool; }
function getRepository(): CockroachMemoryRepository { if (!repository) repository = new CockroachMemoryRepository(getPool(), new TitanEmbeddingProvider()); return repository; }
function getControlPlane(): CockroachControlPlaneStore { if (!controlPlane) controlPlane = new CockroachControlPlaneStore(getPool()); return controlPlane; }
function getEvaluationStore(): CockroachMemoryEvaluationStore { if (!evaluationStore) evaluationStore = new CockroachMemoryEvaluationStore(getPool()); return evaluationStore; }

const SearchSchema = z.object({ agentId: z.string().min(1), executionId: z.string().uuid().optional(), query: z.string().min(1), workflowType: z.string().min(1).optional(), environmentVersion: z.string().min(1).optional(), limit: z.number().int().min(1).max(50).optional() });
const RecallSchema = z.object({ query: z.string().min(1), status: z.array(z.enum(["SUCCESS", "FAILURE", "PARTIAL", "COMPENSATED", "ABORTED", "UNKNOWN"])).optional() });
const DecisionBodySchema = z.object({ id: z.string().uuid().optional(), decisionType: z.string().min(1), selectedAction: z.record(z.string(), z.unknown()), alternatives: z.array(z.record(z.string(), z.unknown())).optional(), reasoningSummary: z.string().min(1), influences: z.array(z.unknown()).optional(), decidedAt: z.coerce.date().optional() });
const ObservationBodySchema = z.object({ id: z.string().uuid().optional(), type: z.string().min(1), payload: z.record(z.string(), z.unknown()), evidenceState: z.enum(["VERIFIED", "OBSERVED", "SIMULATED", "INFERRED", "PROPOSED", "UNKNOWN"]), observedAt: z.coerce.date().optional(), provenance: z.array(z.record(z.string(), z.unknown())).optional() });
const CompleteBodySchema = z.object({
  status: z.enum(["SUCCESS", "FAILURE", "PARTIAL", "COMPENSATED", "ABORTED", "UNKNOWN"]), summary: z.string().min(1), result: z.record(z.string(), z.unknown()).optional(), failureType: z.string().optional(), evidenceState: z.enum(["VERIFIED", "OBSERVED", "SIMULATED", "INFERRED", "PROPOSED", "UNKNOWN"]), completedAt: z.coerce.date().optional(),
  admissionSignals: z.array(z.object({ kind: z.enum(["UNEXPECTED_FAILURE", "SUCCESSFUL_RECOVERY", "POLICY_VIOLATION", "HUMAN_CORRECTION", "SAFETY_INTERVENTION", "SIGNIFICANT_COST", "NOVEL_CONDITION", "REPEATED_PATTERN"]), summary: z.string().min(1), evidenceState: z.enum(["VERIFIED", "OBSERVED", "SIMULATED", "INFERRED", "PROPOSED", "UNKNOWN"]), details: z.record(z.string(), z.unknown()).optional(), confidence: z.number().min(0).max(1).optional() })).optional(),
});

function response(statusCode: number, payload: unknown): ApiGatewayV2Response {
  return { statusCode, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": process.env.CORS_ORIGIN ?? "*", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "GET,POST,OPTIONS" }, body: JSON.stringify(payload) };
}
function parseJsonBody(event: ApiGatewayV2Event): unknown { if (!event.body) return {}; const body = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body; return JSON.parse(body); }
function query(event: ApiGatewayV2Event) { return event.queryStringParameters ?? {}; }
function page(event: ApiGatewayV2Event) { const q = query(event); const limit = q.limit === undefined ? undefined : z.coerce.number().int().min(1).max(200).parse(q.limit); return { limit, cursor: q.cursor }; }
function optionalUuid(value: string | undefined): string | undefined { return value ? z.string().uuid().parse(value) : undefined; }

export async function handler(event: ApiGatewayV2Event): Promise<ApiGatewayV2Response> {
  const method = event.requestContext?.http?.method?.toUpperCase() ?? "GET";
  const path = event.rawPath ?? "/";
  try {
    if (method === "OPTIONS") return response(204, {});
    if (method === "GET" && path === "/health") return response(200, { service: "engram-api", status: "ok", runtime: "engram-runtime/v1", protocolBoundary: { externalExecution: "APPLICATION_DEFINED", operationalMemory: "ENGRAM_MANAGED", decisionAuthority: "APPLICATION_OWNED", demoExternalExecution: "SIMULATED" } });

    if (requiresApiAuthorization(method, path)) {
      const authorization = authorizeApi(event.headers);
      if (!authorization.ok) return response(authorization.statusCode, { error: authorization.error });
    }

    if (method === "GET" && path === "/v1/mcp/status") return response(200, await getCockroachMcpStatus());

    const mcpMemoryMatch = path.match(/^\/v1\/mcp\/memories\/([0-9a-fA-F-]{36})\/provenance$/);
    if (method === "GET" && mcpMemoryMatch?.[1]) {
      const memoryId = z.string().uuid().parse(mcpMemoryMatch[1]);
      return response(200, { source: "COCKROACHDB_CLOUD_MANAGED_MCP", access: "READ_ONLY", memoryId, result: await inspectMemoryProvenanceViaMcp(memoryId) });
    }

    if (method === "POST" && path === "/v1/executions") return response(201, await getEngramRuntime().startExecution(parseJsonBody(event)));
    const executionRoute = path.match(/^\/v1\/executions\/([0-9a-fA-F-]{36})\/(recall|decisions|observations|complete|trace)$/);
    if (executionRoute?.[1] && executionRoute[2]) {
      const executionId = z.string().uuid().parse(executionRoute[1]); const operation = executionRoute[2]; const runtime = getEngramRuntime();
      if (method === "POST" && operation === "recall") { const input = RecallSchema.parse(parseJsonBody(event)); return response(200, await runtime.recall({ executionId, ...input })); }
      if (method === "POST" && operation === "decisions") { const input = DecisionBodySchema.parse(parseJsonBody(event)); return response(201, await runtime.recordDecision({ ...input, executionId, influences: input.influences as never[] | undefined })); }
      if (method === "POST" && operation === "observations") { const input = ObservationBodySchema.parse(parseJsonBody(event)); await runtime.observe({ executionId, ...input }); return response(201, { ok: true }); }
      if (method === "POST" && operation === "complete") { const input = CompleteBodySchema.parse(parseJsonBody(event)); return response(200, await runtime.complete({ executionId, ...input })); }
      if (method === "GET" && operation === "trace") return response(200, await runtime.trace(executionId));
    }

    if (method === "POST" && path === "/v1/demo/run") return response(200, await runEngramRuntimeDemo(getEngramDemoRuntime()));
    if (method === "POST" && path === "/v1/memory/search") { const input = SearchSchema.parse(parseJsonBody(event)); return response(200, await getRepository().searchMemory(input)); }

    if (method === "GET" && path.startsWith("/v1/control-plane/")) {
      if (path === "/v1/control-plane/overview") return response(200, await getControlPlane().overview());
      if (path === "/v1/control-plane/agents") return response(200, await getControlPlane().listAgents(page(event)));
      if (path === "/v1/control-plane/executions") { const q = query(event); const agentId = optionalUuid(q.agentId); return response(200, await getControlPlane().listExecutions({ ...page(event), agentId, status: q.status, workflowType: q.workflowType })); }
      if (path === "/v1/control-plane/memories") { const q = query(event); const agentId = optionalUuid(q.agentId); return response(200, await getControlPlane().listMemories({ ...page(event), agentId, evidenceState: q.evidenceState, memoryType: q.memoryType })); }
      if (path === "/v1/control-plane/influences") { const q = query(event); const executionId = optionalUuid(q.executionId); const memoryId = optionalUuid(q.memoryId); return response(200, await getControlPlane().listInfluences({ ...page(event), executionId, memoryId, influenceType: q.influenceType })); }
      if (path === "/v1/control-plane/policies") return response(200, await getControlPlane().listPolicyBundles(page(event)));
      if (path === "/v1/control-plane/policy-assignments") return response(200, await getControlPlane().listPolicyAssignments(page(event)));
      const evaluationMatch = path.match(/^\/v1\/control-plane\/memories\/([0-9a-fA-F-]{36})\/evaluation$/);
      if (evaluationMatch?.[1]) {
        const memoryId = z.string().uuid().parse(evaluationMatch[1]); const store = getEvaluationStore();
        const [metrics, evaluations, relationships, experiments] = await Promise.all([store.getUsefulnessMetrics(memoryId), store.listEvaluations(memoryId), store.listRelationships(memoryId), store.listExperiments(memoryId)]);
        return response(200, { memoryId, metrics, evaluations, relationships, experiments, interpretationBoundary: "Effect labels require explicit evaluation evidence; retrieval or later success alone is not proof of benefit." });
      }
    }

    return response(404, { error: "NOT_FOUND", method, path });
  } catch (error) {
    if (error instanceof z.ZodError) return response(400, { error: "INVALID_REQUEST", details: error.issues });
    const message = error instanceof Error ? error.message : "Unknown error";
    const memoryUnavailable = message.includes("DATABASE_URL") || message.includes("Bedrock") || message.includes("embedding") || message.includes("MCP");
    const protocolViolation = message.includes("INFLUENCE_") || message.includes("RETRIEVAL_") || message.includes("not eligible") || message.includes("requires RUNNING");
    return response(memoryUnavailable ? 503 : protocolViolation ? 409 : 500, { error: memoryUnavailable ? "MEMORY_UNAVAILABLE" : protocolViolation ? "PROTOCOL_VIOLATION" : "SERVICE_UNAVAILABLE", message });
  }
}
