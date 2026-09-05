import { z } from "zod";

export const EvidenceStateSchema = z.enum([
  "VERIFIED",
  "OBSERVED",
  "SIMULATED",
  "INFERRED",
  "PROPOSED",
  "UNKNOWN",
]);
export type EvidenceState = z.infer<typeof EvidenceStateSchema>;

export const ExecutionStatusSchema = z.enum([
  "RUNNING",
  "SUCCESS",
  "FAILURE",
  "PARTIAL",
  "COMPENSATED",
  "ABORTED",
  "UNKNOWN",
  "MEMORY_UNAVAILABLE",
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const ExecutionContextSchema = z.object({
  agentId: z.string().min(1),
  agentVersion: z.string().optional(),
  workflowType: z.string().min(1),
  intent: z.string().min(1),
  context: z.record(z.string(), z.unknown()),
  constraints: z.record(z.string(), z.unknown()).default({}),
  environmentVersion: z.string().optional(),
  policyVersion: z.string().optional(),
  toolVersion: z.string().optional(),
});
export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;

export const ExecutionEventSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  sequenceNo: z.number().int().nonnegative(),
  eventType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  evidenceState: EvidenceStateSchema,
  occurredAt: z.coerce.date(),
});
export type ExecutionEvent = z.infer<typeof ExecutionEventSchema>;

export const OutcomeSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  status: ExecutionStatusSchema.exclude(["RUNNING", "MEMORY_UNAVAILABLE"]),
  failureType: z.string().optional(),
  summary: z.string().min(1),
  result: z.record(z.string(), z.unknown()).default({}),
  evidenceState: EvidenceStateSchema,
});
export type Outcome = z.infer<typeof OutcomeSchema>;

export const OperationalMemorySchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().min(1),
  memoryType: z.string().min(1),
  summary: z.string().min(1),
  structuredContext: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1),
  evidenceState: EvidenceStateSchema,
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  environmentVersion: z.string().optional(),
  toolVersion: z.string().optional(),
  policyVersion: z.string().optional(),
});
export type OperationalMemory = z.infer<typeof OperationalMemorySchema>;

export const RetrievalCandidateSchema = z.object({
  memoryId: z.string().uuid(),
  semanticScore: z.number().min(0).max(1),
  contextScore: z.number().min(0).max(1),
  outcomeScore: z.number().min(0).max(1),
  confidenceScore: z.number().min(0).max(1),
  recencyScore: z.number().min(0).max(1),
  finalScore: z.number().min(0).max(1),
  rank: z.number().int().positive(),
});
export type RetrievalCandidate = z.infer<typeof RetrievalCandidateSchema>;

export const DecisionMemoryInfluenceSchema = z.object({
  memoryId: z.string().uuid(),
  influenceType: z.enum(["CHANGED_ACTION", "CONSTRAINED_ACTION", "SUPPORTED_ACTION", "CONSIDERED"]),
  influenceSummary: z.string().min(1),
  relevance: z.number().min(0).max(1).optional(),
  counterfactualAction: z.record(z.string(), z.unknown()).optional(),
});
export type DecisionMemoryInfluence = z.infer<typeof DecisionMemoryInfluenceSchema>;

export const DecisionSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  decisionType: z.string().min(1),
  selectedAction: z.record(z.string(), z.unknown()),
  alternatives: z.array(z.record(z.string(), z.unknown())).default([]),
  reasoningSummary: z.string().min(1),
  memoryRefs: z.array(z.string().uuid()).default([]),
  memoryInfluences: z.array(DecisionMemoryInfluenceSchema).default([]),
});
export type Decision = z.infer<typeof DecisionSchema>;

export type MemorySearchInput = {
  agentId: string;
  executionId?: string;
  query: string;
  workflowType?: string;
  status?: ExecutionStatus[];
  environmentVersion?: string;
  retrievalPolicyVersion?: string;
  limit?: number;
};

export type MemorySearchResult = {
  retrievalId: string;
  candidates: Array<RetrievalCandidate & { memory: OperationalMemory }>;
};

export interface EmbeddingProvider {
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
}

export interface MemoryRepository {
  startExecution(input: ExecutionContext): Promise<{ executionId: string }>;
  appendEvent(event: ExecutionEvent): Promise<void>;
  recordOutcome(outcome: Outcome): Promise<void>;
  persistMemory(memory: OperationalMemory, sourceExecutionIds: string[]): Promise<void>;
  searchMemory(input: MemorySearchInput): Promise<MemorySearchResult>;
  recordDecision(decision: Decision, retrievalId?: string): Promise<void>;
  getTrace(executionId: string): Promise<unknown>;
}
