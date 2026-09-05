import type {
  AgentSummary,
  ControlPlaneOverview,
  ExecutionSummary,
  MemoryInfluenceSummary,
  MemorySummary,
  PageInput,
  PolicyAssignmentRecord,
  PolicyBundleRecord,
} from "./types.js";

export interface EngramControlPlaneStore {
  overview(): Promise<ControlPlaneOverview>;
  listAgents(page?: PageInput): Promise<AgentSummary[]>;
  listExecutions(input?: PageInput & { agentId?: string; status?: string; workflowType?: string }): Promise<ExecutionSummary[]>;
  listMemories(input?: PageInput & { agentId?: string; evidenceState?: string; memoryType?: string }): Promise<MemorySummary[]>;
  listInfluences(input?: PageInput & { executionId?: string; memoryId?: string; influenceType?: string }): Promise<MemoryInfluenceSummary[]>;
  listPolicyBundles(page?: PageInput): Promise<PolicyBundleRecord[]>;
  listPolicyAssignments(page?: PageInput): Promise<PolicyAssignmentRecord[]>;
}
