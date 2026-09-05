import type { ExecutionContext } from "../../memory-core/src/domain.js";
import type {
  RuntimeCompleteResult,
  RuntimeDecisionRecord,
  RuntimeRecallResult,
} from "../../runtime/src/types.js";
import type {
  CompleteInput,
  DecisionInput,
  EngramTransport,
  ObservationInput,
  RecallInput,
} from "./index.js";

export type HttpTransportOptions = {
  baseUrl: string;
  apiToken?: string;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
};

export class EngramHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "EngramHttpError";
  }
}

export function httpTransport(options: HttpTransportOptions): EngramTransport {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers({ "content-type": "application/json" });
    const apiToken = options.apiToken?.trim();
    if (apiToken) headers.set("authorization", `Bearer ${apiToken}`);
    for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
    const requestHeaders = new Headers(init.headers);
    requestHeaders.forEach((value, name) => headers.set(name, value));

    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      const message = typeof body === "object" && body && "message" in body
        ? String((body as { message?: unknown }).message)
        : `Engram API request failed with ${response.status}`;
      throw new EngramHttpError(message, response.status, body);
    }
    return body as T;
  }

  return {
    startExecution(input: ExecutionContext) {
      return request<{ executionId: string }>("/v1/executions", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    recall(executionId: string, input: RecallInput) {
      return request<RuntimeRecallResult>(`/v1/executions/${executionId}/recall`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    recordDecision(executionId: string, input: DecisionInput) {
      return request<RuntimeDecisionRecord>(`/v1/executions/${executionId}/decisions`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    async observe(executionId: string, input: ObservationInput) {
      await request<{ ok: true }>(`/v1/executions/${executionId}/observations`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    complete(executionId: string, input: CompleteInput) {
      return request<RuntimeCompleteResult>(`/v1/executions/${executionId}/complete`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    trace(executionId: string) {
      return request<unknown>(`/v1/executions/${executionId}/trace`);
    },
  };
}
