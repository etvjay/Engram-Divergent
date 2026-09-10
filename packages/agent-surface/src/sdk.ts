import { ZodError, z } from "zod";
import { createAgentSurface } from "./server.js";
import type { BehavioralMemoryStore } from "../../experience/src/store.js";
import type { InfluenceGrant } from "../../memory-core/src/influence-grant.js";
import type { MemorySlice } from "../../memory-core/src/memory-slice.js";

export type AgentSurface = ReturnType<typeof createAgentSurface>;
export type JsonRecord = Record<string, unknown>;

const RecordSchema = z.record(z.string(), z.unknown());
const CompleteExecutionInputSchema = z.object({
  execution: RecordSchema,
  events: z.array(z.unknown()).default([]),
  outcome: RecordSchema,
  evidenceRefs: z.array(z.string().min(1)).min(1),
  subject: z.string().min(1).optional(),
  fields: RecordSchema.optional(),
  observation: z.string().min(1).optional(),
  interpretation: z.string().min(1).optional(),
  applicability: RecordSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  memoryType: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
});

export type CompleteExecutionInput = z.input<typeof CompleteExecutionInputSchema>;
export type RecordCompleteExecutionResponse =
  | { status: "ADMITTED"; ids: { episodeId: string; executionSliceId: string; experienceId: string; candidateMemoryId: string; executionMemoryId: string } }
  | { status: "REJECTED"; reason: string; candidateMemoryId: string };

export type RecallApplicableMemoryInput = {
  executionMemoryId: string;
  consumerAgentId: string;
  consumerExecutionId: string;
  context?: JsonRecord;
  purpose?: string;
  subject?: string;
};
export type RecallApplicableMemoryResponse =
  | { status: "ELIGIBLE"; memorySlice: MemorySlice; influenceGrant: InfluenceGrant }
  | { status: "NO_ELIGIBLE_MEMORY"; memoryId: string };

export type RequestInfluenceInput = {
  consumerAgentId: string;
  influenceGrantId: string;
  proposal: JsonRecord;
};
export type RequestInfluenceResponse = {
  status: "AUTHORIZED";
  proposal: { executionId: string; proposedAction: JsonRecord; requestedEffects: string[] };
};

export type SubmitOutcomeEvaluationInput = { evaluation: JsonRecord };
export type SubmitOutcomeEvaluationResponse = {
  status: "UPDATED";
  directive: string;
  priorMemoryId: string;
  newMemoryId: string;
  updateId: string;
};

export type EvaluationQueryResponse = JsonRecord;
export type EngramClientOptions = { store?: BehavioralMemoryStore; surface?: AgentSurface };

export type EngramErrorCode =
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "REFUSED"
  | "METHOD_NOT_FOUND"
  | "INTERNAL";

/** Stable SDK error with an explicit recovery hint; raw domain messages remain in cause. */
export class EngramError extends Error {
  readonly code: EngramErrorCode;
  readonly retryable: boolean;
  readonly recovery: "correct_request" | "check_authority" | "retry" | "inspect_service";

  constructor(code: EngramErrorCode, message: string, options: { retryable?: boolean; recovery: EngramError["recovery"]; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = "EngramError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.recovery = options.recovery;
  }
}

export class EngramRefusalError extends EngramError {
  constructor(message: string, cause?: unknown) {
    super("REFUSED", message, { recovery: "check_authority", cause });
    this.name = "EngramRefusalError";
  }
}

function normalizeError(error: unknown): EngramError {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof EngramError) return error;
  if (error instanceof ZodError || message.startsWith("Invalid input")) {
    return new EngramError("INVALID_REQUEST", "Request does not satisfy the Engram contract", { recovery: "correct_request", cause: error });
  }
  if (message.includes("NOT_FOUND")) return new EngramError("NOT_FOUND", message, { recovery: "correct_request", cause: error });
  if (message.includes("MISMATCH") || message.includes("NOT_DECLARED") || message.includes("NOT_ALLOWED") || message.includes("EXPIRED")) {
    return new EngramRefusalError(message, error);
  }
  if (message.includes("METHOD_NOT_FOUND")) return new EngramError("METHOD_NOT_FOUND", message, { recovery: "correct_request", cause: error });
  return new EngramError("INTERNAL", "Engram surface request failed", { retryable: true, recovery: "retry", cause: error });
}

/** Typed async SDK over the canonical agent surface; it contains no domain implementation. */
export class EngramClient {
  private readonly surface: AgentSurface;

  constructor(options: EngramClientOptions) {
    if (!options.surface && !options.store) {
      throw new EngramError("INVALID_REQUEST", "ENGRAM_CLIENT_STORE_OR_SURFACE_REQUIRED", { recovery: "correct_request" });
    }
    this.surface = options.surface ?? createAgentSurface(options.store!);
  }

  async recordCompleteExecution(input: CompleteExecutionInput): Promise<RecordCompleteExecutionResponse> {
    const request = CompleteExecutionInputSchema.parse(input);
    return this.call("record_complete_execution", request) as Promise<RecordCompleteExecutionResponse>;
  }

  async recallApplicableMemory(input: RecallApplicableMemoryInput): Promise<RecallApplicableMemoryResponse> {
    return this.call("recall_applicable_memory", input) as Promise<RecallApplicableMemoryResponse>;
  }

  async requestInfluence(input: RequestInfluenceInput): Promise<RequestInfluenceResponse> {
    return this.call("request_influence", input) as Promise<RequestInfluenceResponse>;
  }

  async submitOutcomeEvaluation(input: SubmitOutcomeEvaluationInput): Promise<SubmitOutcomeEvaluationResponse> {
    return this.call("submit_outcome_evaluation", input) as Promise<SubmitOutcomeEvaluationResponse>;
  }

  async getEvaluationSummary(): Promise<EvaluationQueryResponse> { return this.call("get_evaluation_summary", {}); }
  async compareArms(): Promise<EvaluationQueryResponse> { return this.call("compare_arms", {}); }
  async getUseCaseScorecard(): Promise<EvaluationQueryResponse> { return this.call("get_use_case_scorecard", {}); }

  /** Retry only explicitly retryable transport/service failures; refusal and validation never retry. */
  async withRecovery<T>(operation: () => Promise<T>, options: { attempts?: number } = {}): Promise<T> {
    const attempts = Math.max(1, Math.floor(options.attempts ?? 2));
    for (let attempt = 1; ; attempt += 1) {
      try { return await operation(); } catch (error) {
        const normalized = normalizeError(error);
        if (!normalized.retryable || attempt >= attempts) throw normalized;
      }
    }
  }

  private async call(name: string, arguments_: JsonRecord): Promise<JsonRecord> {
    try {
      return await this.surface.call({
        jsonrpc: "2.0",
        id: `${name}-${Date.now()}`,
        method: "tools/call",
        params: { name, arguments: arguments_ },
      });
    } catch (error) {
      throw normalizeError(error);
    }
  }
}

export function createEngramClient(options: EngramClientOptions): EngramClient { return new EngramClient(options); }

export { CompleteExecutionInputSchema };
