import { z } from "zod";
import type { MemoryInfluence, MemoryRecall, EvidenceState } from "../../core/src/protocol.js";
import type { OperationalMemory, ExecutionStatus } from "../../memory-core/src/domain.js";
import type {
  AdmissionPolicy,
  ExpiryPolicy,
  InfluencePolicy,
  RetrievalPolicy,
} from "../../policy/src/contracts.js";

export const RuntimeEvaluationEventTypeSchema = z.enum([
  "RECALL_COMPLETED",
  "RECALL_FILTERED",
  "INFLUENCE_ACCEPTED",
  "INFLUENCE_REJECTED",
  "DECISION_RECORDED",
  "MEMORY_ADMITTED",
  "MEMORY_NOT_ADMITTED",
  "MEMORY_INVALIDATED",
]);
export type RuntimeEvaluationEventType = z.infer<typeof RuntimeEvaluationEventTypeSchema>;

export type RuntimeExecutionRecord = {
  id: string;
  agentId: string;
  agentVersion?: string;
  workflowType: string;
  intent: string;
  context: Record<string, unknown>;
  constraints: Record<string, unknown>;
  environmentVersion?: string;
  toolVersion?: string;
  policyVersion?: string;
  memoryPolicyBundleVersion?: string;
  status: ExecutionStatus;
  startedAt: Date;
  completedAt?: Date;
};

export type RuntimeEvaluationEvent = {
  id: string;
  executionId: string;
  eventType: RuntimeEvaluationEventType;
  payload: Record<string, unknown>;
  createdAt: Date;
};

export type RuntimePolicyBundle = {
  admission: AdmissionPolicy;
  retrieval: RetrievalPolicy;
  influence: InfluencePolicy;
  expiry: ExpiryPolicy;
};

export type RuntimeRecallCandidate = {
  memory: OperationalMemory;
  rank: number;
  score: number;
  semanticScore: number;
  contextScore: number;
  outcomeScore: number;
  confidenceScore: number;
  recencyScore: number;
};

export type RuntimeRecallResult = {
  recall: MemoryRecall;
  candidates: RuntimeRecallCandidate[];
  rejected: Array<{
    memoryId: string;
    reasons: string[];
  }>;
};

export type RuntimeDecisionInput = {
  id?: string;
  executionId: string;
  decisionType: string;
  selectedAction: Record<string, unknown>;
  alternatives?: Array<Record<string, unknown>>;
  reasoningSummary: string;
  influences?: MemoryInfluence[];
  decidedAt?: Date;
};

export type RuntimeDecisionRecord = RuntimeDecisionInput & {
  id: string;
  influences: MemoryInfluence[];
  decidedAt: Date;
};

export type RuntimeObservationInput = {
  id?: string;
  executionId: string;
  type: string;
  payload: Record<string, unknown>;
  evidenceState: EvidenceState;
  observedAt?: Date;
  provenance?: Array<Record<string, unknown>>;
};

export type AdmissionSignalKind = AdmissionPolicy["admitOn"][number];

export type AdmissionSignal = {
  kind: AdmissionSignalKind;
  summary: string;
  evidenceState: EvidenceState;
  details?: Record<string, unknown>;
  confidence?: number;
  /**
   * Executions whose evidence supports this memory. Omit for the historical
   * single-source behavior, which uses the execution being completed.
   *
   * Multi-source admission is useful for REPEATED_PATTERN and other memories
   * whose claim is not honestly attributable to one run. The admitting
   * execution must be included and every source must belong to the same agent.
   */
  sourceExecutionIds?: string[];
};

export type RuntimeCompleteInput = {
  executionId: string;
  status: Exclude<ExecutionStatus, "RUNNING" | "MEMORY_UNAVAILABLE">;
  summary: string;
  result?: Record<string, unknown>;
  failureType?: string;
  evidenceState: EvidenceState;
  completedAt?: Date;
  admissionSignals?: AdmissionSignal[];
};

export type RuntimeCompleteResult = {
  executionId: string;
  admittedMemories: OperationalMemory[];
  rejectedSignals: Array<{
    kind: AdmissionSignalKind;
    reasons: string[];
  }>;
};

export type RecallExposureUpdate = {
  retrievalId: string;
  exposedMemoryIds: string[];
  exposedMemoryStates: Array<{
    memoryId: string;
    memoryStateDigest: string;
  }>;
  rejected: Array<{ memoryId: string; reasons: string[] }>;
};