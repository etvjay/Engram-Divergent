import { createInterface } from "node:readline";
import type { AgentSurface } from "./sdk.js";
import { createAgentSurface } from "./server.js";
import type { BehavioralMemoryStore } from "../../experience/src/store.js";

export const DEFAULT_MAX_REQUEST_BYTES = 256 * 1024;
export const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
export const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type StdioOptions = {
  store?: BehavioralMemoryStore;
  surface?: AgentSurface;
  evaluationRoot?: string;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  requestTimeoutMs?: number;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
};

export type McpError = { code: string; message: string; details?: unknown };

function errorPayload(error: unknown): McpError {
  if (error instanceof Error && error.name === "ZodError") return { code: "MCP_INVALID_ARGUMENTS", message: "Tool arguments do not satisfy the declared schema" };
  if (error instanceof Error && error.message.startsWith("AGENT_SURFACE_METHOD_NOT_FOUND:")) return { code: "MCP_METHOD_NOT_FOUND", message: "Method is not supported" };
  if (error instanceof Error && error.message.startsWith("EVALUATION_RESOURCE_NOT_FOUND:")) return { code: "MCP_RESOURCE_NOT_FOUND", message: "Resource is not allowlisted" };
  if (error && typeof error === "object" && "code" in error) {
    const typed = error as { code?: unknown; message?: unknown; details?: unknown };
    return {
      code: typeof typed.code === "string" ? typed.code : "ENGRAM_MCP_ERROR",
      message: typeof typed.message === "string" ? typed.message : "MCP request failed",
      ...(typed.details === undefined ? {} : { details: typed.details }),
    };
  }
  return { code: "ENGRAM_MCP_ERROR", message: "MCP request failed" };
}

function parseRequest(line: string, maxBytes: number): JsonRpcRequest {
  if (Buffer.byteLength(line, "utf8") > maxBytes) {
    throw Object.assign(new Error("Request exceeds configured size limit"), { code: "MCP_REQUEST_TOO_LARGE" });
  }
  let value: unknown;
  try { value = JSON.parse(line); } catch {
    throw Object.assign(new Error("Request must be valid JSON"), { code: "MCP_INVALID_JSON" });
  }
  if (!value || typeof value !== "object" || (value as Record<string, unknown>).jsonrpc !== "2.0" || typeof (value as Record<string, unknown>).method !== "string") {
    throw Object.assign(new Error("Request must be a JSON-RPC 2.0 object with a method"), { code: "MCP_INVALID_REQUEST" });
  }
  return value as JsonRpcRequest;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error("Request timed out"), { code: "MCP_REQUEST_TIMEOUT" })), timeoutMs);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

/** Reusable MCP stdio JSON-RPC adapter. It owns transport limits, not domain policy. */
export function createMcpStdioServer(options: StdioOptions = {}) {
  const surface = options.surface ?? (options.store ? createAgentSurface(options.store, { evaluationRoot: options.evaluationRoot }) : undefined);
  if (!surface) throw new Error("ENGRAM_MCP_STORE_OR_SURFACE_REQUIRED");
  const boundSurface = surface;
  const maxRequestBytes = options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;

  async function handle(line: string): Promise<void> {
    let request: JsonRpcRequest | undefined;
    try {
      request = parseRequest(line, maxRequestBytes);
      const result = await withTimeout(boundSurface.call({ ...request, id: request.id ?? "stdio" }), requestTimeoutMs);
      const response = { jsonrpc: "2.0", id: request.id ?? null, result };
      const encoded = JSON.stringify(response);
      if (Buffer.byteLength(encoded, "utf8") > maxResponseBytes) throw Object.assign(new Error("Response exceeds configured size limit"), { code: "MCP_RESPONSE_TOO_LARGE" });
      output.write(`${encoded}\n`);
    } catch (error) {
      const response = { jsonrpc: "2.0", id: request?.id ?? null, error: errorPayload(error) };
      const encoded = JSON.stringify(response);
      output.write(`${encoded.slice(0, maxResponseBytes)}\n`);
    }
  }

  async function start(): Promise<void> {
    const reader = createInterface({ input, crlfDelay: Infinity });
    for await (const line of reader) {
      if (line.trim()) await handle(line);
    }
  }
  return { surface, handle, start };
}

export type { StdioOptions };
