export type JsonRecord = Record<string, unknown>;
export type EngramErrorCode = "INVALID_REQUEST" | "NOT_FOUND" | "REFUSED" | "METHOD_NOT_FOUND" | "INTERNAL";
export type RecoveryHint = "correct_request" | "check_authority" | "retry" | "inspect_service";
export type AgentSurface = { call(request: { jsonrpc: "2.0"; id: string | number; method: string; params?: JsonRecord }): Promise<JsonRecord> };
export type EngramClientOptions = { surface?: AgentSurface; store?: unknown };
export type CompleteExecutionInput = { execution: JsonRecord; events?: unknown[]; outcome: JsonRecord; evidenceRefs: string[]; subject?: string; fields?: JsonRecord; observation?: string; interpretation?: string; applicability?: JsonRecord; confidence?: number; memoryType?: string; summary?: string };
export type RecordCompleteExecutionResponse = { status: "ADMITTED"; ids: { episodeId: string; executionSliceId: string; experienceId: string; candidateMemoryId: string; executionMemoryId: string } } | { status: "REJECTED"; reason: string; candidateMemoryId: string };
export type RecallApplicableMemoryInput = { executionMemoryId: string; consumerAgentId: string; consumerExecutionId: string; context?: JsonRecord; purpose?: string; subject?: string };
export type MemorySlice = JsonRecord & { id: string; claims: string[]; redactedFields: string[] };
export type InfluenceGrant = JsonRecord & { id: string; memorySliceId: string };
export type RecallApplicableMemoryResponse = { status: "ELIGIBLE"; memorySlice: MemorySlice; influenceGrant: InfluenceGrant } | { status: "NO_ELIGIBLE_MEMORY"; memoryId: string };
export type RequestInfluenceInput = { consumerAgentId: string; influenceGrantId: string; proposal: JsonRecord };
export type RequestInfluenceResponse = { status: "AUTHORIZED"; proposal: { executionId: string; proposedAction: JsonRecord; requestedEffects: string[] } };
export type SubmitOutcomeEvaluationInput = { evaluation: JsonRecord };
export type SubmitOutcomeEvaluationResponse = { status: "UPDATED"; directive: string; priorMemoryId: string; newMemoryId: string; updateId: string };
export type EvaluationQueryResponse = JsonRecord;
export declare class EngramError extends Error { readonly code: EngramErrorCode; readonly retryable: boolean; readonly recovery: RecoveryHint; constructor(code: EngramErrorCode, message: string, options: { retryable?: boolean; recovery: RecoveryHint; cause?: unknown }); }
export declare class EngramRefusalError extends EngramError { constructor(message: string, cause?: unknown); }
export declare const CompleteExecutionInputSchema: { parse(input: unknown): CompleteExecutionInput };
export declare class EngramClient { constructor(options: EngramClientOptions); recordCompleteExecution(input: CompleteExecutionInput): Promise<RecordCompleteExecutionResponse>; recallApplicableMemory(input: RecallApplicableMemoryInput): Promise<RecallApplicableMemoryResponse>; requestInfluence(input: RequestInfluenceInput): Promise<RequestInfluenceResponse>; submitOutcomeEvaluation(input: SubmitOutcomeEvaluationInput): Promise<SubmitOutcomeEvaluationResponse>; getEvaluationSummary(): Promise<EvaluationQueryResponse>; compareArms(): Promise<EvaluationQueryResponse>; getUseCaseScorecard(): Promise<EvaluationQueryResponse>; withRecovery<T>(operation: () => Promise<T>, options?: { attempts?: number }): Promise<T>; }
export declare function createEngramClient(options: EngramClientOptions): EngramClient;
