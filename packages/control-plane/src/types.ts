import type { EvidenceState, MemoryInfluenceType } from "../../core/src/protocol.js";
import type { ExecutionStatus } from "../../memory-core/src/domain.js";
import type { MemoryPolicyBundle, MemoryPolicyScope } from "../../policy/src/contracts.js";

export type PageInput = {
  limit?: number;
  cursor?: string;
};

export type AgentSummary = {
  id: string;
  externalId: string;
  name?: string;
  agentVersion?: string;
  model?: string;
  runtime?: string;
  createdAt: Date;
  executionCount: number;
  memoryCount: number;
  influencedDecisionCount: number;
  lastExecutionAt?: Date;
};

export type ExecutionSummary = {
  id: string;
  agentId: string;
  agentExternalId: string;
  workflowType: string;
  intent: string;
  status: ExecutionStatus;
  environmentVersion?: string;
  toolVersion?: string;
  policyVersion?: string;
  startedAt: Date;
  completedAt?: Date;
  decisionCount: number;
  retrievalCount: number;
  influenceCount: number;
  runtimeEvaluationCount: number;
};

export type MemorySummary = {
  id: string;
  agentId: string;
  agentExternalId: string;
  memoryType: string;
  summary: string;
  confidence: number;
  evidenceState: EvidenceState;
  validFrom?: Date;
  validUntil?: Date;
  environmentVersion?: string;
  toolVersion?: string;
  policyVersion?: string;
  createdAt: Date;
  sourceExecutionCount: number;
  retrievalCount: number;
  exposedRetrievalCount: number;
  influenceCount: number;
  changedActionCount: number;
  lastRetrievedAt?: Date;
};

export type PolicyBundleRecord = {
  id: string;
  bundleVersion: string;
  contractVersion: string;
  description?: string;
  definition: MemoryPolicyBundle;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  createdAt: Date;
  activatedAt?: Date;
  retiredAt?: Date;
};

export type PolicyAssignmentRecord = {
  id: string;
  policyBundleId: string;
  bundleVersion: string;
  scope: MemoryPolicyScope;
  priority: number;
  validFrom: Date;
  validUntil?: Date;
};

export type MemoryInfluenceSummary = {
  decisionId: string;
  executionId: string;
  memoryId: string;
  retrievalId?: string;
  influenceType: MemoryInfluenceType;
  influenceSummary: string;
  relevance?: number;
  selectedAction: Record<string, unknown>;
  counterfactualAction?: Record<string, unknown>;
  counterfactualSource?: string;
  counterfactualEvidenceState?: EvidenceState;
  counterfactualExplanation?: string;
  comparisonExecutionId?: string;
  createdAt: Date;
};

export type ControlPlaneOverview = {
  agents: number;
  executions: number;
  runningExecutions: number;
  memories: number;
  retrievals: number;
  exposedRetrievalResults: number;
  influencedDecisions: number;
  changedActions: number;
  activePolicyBundles: number;
  evidenceStateCounts: Partial<Record<EvidenceState, number>>;
};
