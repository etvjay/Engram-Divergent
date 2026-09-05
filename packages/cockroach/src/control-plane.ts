import type pg from "pg";
import { MemoryPolicyBundleSchema } from "../../policy/src/contracts.js";
import type { EngramControlPlaneStore } from "../../control-plane/src/store.js";
import type {
  AgentSummary,
  ControlPlaneOverview,
  ExecutionSummary,
  MemoryInfluenceSummary,
  MemorySummary,
  PageInput,
  PolicyAssignmentRecord,
  PolicyBundleRecord,
} from "../../control-plane/src/types.js";

function pageLimit(page?: PageInput): number {
  return Math.max(1, Math.min(page?.limit ?? 50, 200));
}

function cursorDate(cursor?: string): Date | undefined {
  if (!cursor) return undefined;
  const value = new Date(cursor);
  if (Number.isNaN(value.getTime())) throw new Error("Control-plane cursor must be an ISO timestamp");
  return value;
}

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

export class CockroachControlPlaneStore implements EngramControlPlaneStore {
  constructor(private readonly pool: pg.Pool) {}

  async overview(): Promise<ControlPlaneOverview> {
    const [counts, evidence] = await Promise.all([
      this.pool.query<{
        agents: string;
        executions: string;
        running_executions: string;
        memories: string;
        retrievals: string;
        exposed_retrieval_results: string;
        influenced_decisions: string;
        changed_actions: string;
        active_policy_bundles: string;
      }>(`
        SELECT
          (SELECT count(*) FROM agents) AS agents,
          (SELECT count(*) FROM executions) AS executions,
          (SELECT count(*) FROM executions WHERE status='RUNNING') AS running_executions,
          (SELECT count(*) FROM memories) AS memories,
          (SELECT count(*) FROM memory_retrievals) AS retrievals,
          (SELECT count(*) FROM memory_retrieval_results WHERE exposed_to_agent=true) AS exposed_retrieval_results,
          (SELECT count(DISTINCT decision_id) FROM decision_memories) AS influenced_decisions,
          (SELECT count(*) FROM decision_memories WHERE influence_type='CHANGED_ACTION') AS changed_actions,
          (SELECT count(*) FROM memory_policy_bundles WHERE status='ACTIVE') AS active_policy_bundles
      `),
      this.pool.query<{ evidence_state: string; count: string }>(`
        SELECT evidence_state, count(*)::STRING AS count
          FROM memories
         GROUP BY evidence_state
      `),
    ]);

    const row = counts.rows[0];
    if (!row) throw new Error("Control-plane overview query returned no row");
    const evidenceStateCounts: ControlPlaneOverview["evidenceStateCounts"] = {};
    for (const item of evidence.rows) {
      evidenceStateCounts[item.evidence_state as keyof typeof evidenceStateCounts] = Number(item.count);
    }

    return {
      agents: Number(row.agents),
      executions: Number(row.executions),
      runningExecutions: Number(row.running_executions),
      memories: Number(row.memories),
      retrievals: Number(row.retrievals),
      exposedRetrievalResults: Number(row.exposed_retrieval_results),
      influencedDecisions: Number(row.influenced_decisions),
      changedActions: Number(row.changed_actions),
      activePolicyBundles: Number(row.active_policy_bundles),
      evidenceStateCounts,
    };
  }

  async listAgents(page?: PageInput): Promise<AgentSummary[]> {
    const cursor = cursorDate(page?.cursor);
    const result = await this.pool.query<{
      id: string;
      external_id: string;
      name: string | null;
      agent_version: string | null;
      model: string | null;
      runtime: string | null;
      created_at: Date;
      execution_count: string;
      memory_count: string;
      influenced_decision_count: string;
      last_execution_at: Date | null;
    }>(`
      SELECT a.id, a.external_id, a.name, a.agent_version, a.model, a.runtime, a.created_at,
             (SELECT count(*) FROM executions e WHERE e.agent_id=a.id) AS execution_count,
             (SELECT count(*) FROM memories m WHERE m.agent_id=a.id) AS memory_count,
             (SELECT count(DISTINCT dm.decision_id)
                FROM decisions d
                JOIN executions e ON e.id=d.execution_id
                JOIN decision_memories dm ON dm.decision_id=d.id
               WHERE e.agent_id=a.id) AS influenced_decision_count,
             (SELECT max(e.started_at) FROM executions e WHERE e.agent_id=a.id) AS last_execution_at
        FROM agents a
       WHERE ($1::TIMESTAMPTZ IS NULL OR a.created_at < $1)
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $2
    `, [cursor ?? null, pageLimit(page)]);

    return result.rows.map((row) => ({
      id: row.id,
      externalId: row.external_id,
      name: optional(row.name),
      agentVersion: optional(row.agent_version),
      model: optional(row.model),
      runtime: optional(row.runtime),
      createdAt: row.created_at,
      executionCount: Number(row.execution_count),
      memoryCount: Number(row.memory_count),
      influencedDecisionCount: Number(row.influenced_decision_count),
      lastExecutionAt: optional(row.last_execution_at),
    }));
  }

  async listExecutions(input: PageInput & { agentId?: string; status?: string; workflowType?: string } = {}): Promise<ExecutionSummary[]> {
    const cursor = cursorDate(input.cursor);
    const result = await this.pool.query<{
      id: string;
      agent_id: string;
      external_id: string;
      workflow_type: string;
      intent: string;
      status: ExecutionSummary["status"];
      environment_version: string | null;
      tool_version: string | null;
      policy_version: string | null;
      started_at: Date;
      completed_at: Date | null;
      decision_count: string;
      retrieval_count: string;
      influence_count: string;
      runtime_evaluation_count: string;
    }>(`
      SELECT e.id, e.agent_id, a.external_id, e.workflow_type, e.intent, e.status,
             e.environment_version, e.tool_version, e.policy_version,
             e.started_at, e.completed_at,
             (SELECT count(*) FROM decisions d WHERE d.execution_id=e.id) AS decision_count,
             (SELECT count(*) FROM memory_retrievals mr WHERE mr.execution_id=e.id) AS retrieval_count,
             (SELECT count(*) FROM decision_memories dm JOIN decisions d ON d.id=dm.decision_id WHERE d.execution_id=e.id) AS influence_count,
             (SELECT count(*) FROM runtime_evaluation_events ree WHERE ree.execution_id=e.id) AS runtime_evaluation_count
        FROM executions e
        JOIN agents a ON a.id=e.agent_id
       WHERE ($1::UUID IS NULL OR e.agent_id=$1)
         AND ($2::STRING IS NULL OR e.status=$2)
         AND ($3::STRING IS NULL OR e.workflow_type=$3)
         AND ($4::TIMESTAMPTZ IS NULL OR e.started_at < $4)
       ORDER BY e.started_at DESC, e.id DESC
       LIMIT $5
    `, [input.agentId ?? null, input.status ?? null, input.workflowType ?? null, cursor ?? null, pageLimit(input)]);

    return result.rows.map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      agentExternalId: row.external_id,
      workflowType: row.workflow_type,
      intent: row.intent,
      status: row.status,
      environmentVersion: optional(row.environment_version),
      toolVersion: optional(row.tool_version),
      policyVersion: optional(row.policy_version),
      startedAt: row.started_at,
      completedAt: optional(row.completed_at),
      decisionCount: Number(row.decision_count),
      retrievalCount: Number(row.retrieval_count),
      influenceCount: Number(row.influence_count),
      runtimeEvaluationCount: Number(row.runtime_evaluation_count),
    }));
  }

  async listMemories(input: PageInput & { agentId?: string; evidenceState?: string; memoryType?: string } = {}): Promise<MemorySummary[]> {
    const cursor = cursorDate(input.cursor);
    const result = await this.pool.query<{
      id: string;
      agent_id: string;
      external_id: string;
      memory_type: string;
      summary: string;
      confidence: number;
      evidence_state: MemorySummary["evidenceState"];
      valid_from: Date | null;
      valid_until: Date | null;
      environment_version: string | null;
      tool_version: string | null;
      policy_version: string | null;
      created_at: Date;
      source_execution_count: string;
      retrieval_count: string;
      exposed_retrieval_count: string;
      influence_count: string;
      changed_action_count: string;
      last_retrieved_at: Date | null;
    }>(`
      SELECT m.id, m.agent_id, a.external_id, m.memory_type, m.summary, m.confidence,
             m.evidence_state, m.valid_from, m.valid_until, m.environment_version,
             m.tool_version, m.policy_version, m.created_at,
             (SELECT count(*) FROM memory_sources ms WHERE ms.memory_id=m.id) AS source_execution_count,
             (SELECT count(*) FROM memory_retrieval_results rr WHERE rr.memory_id=m.id) AS retrieval_count,
             (SELECT count(*) FROM memory_retrieval_results rr WHERE rr.memory_id=m.id AND rr.exposed_to_agent=true) AS exposed_retrieval_count,
             (SELECT count(*) FROM decision_memories dm WHERE dm.memory_id=m.id) AS influence_count,
             (SELECT count(*) FROM decision_memories dm WHERE dm.memory_id=m.id AND dm.influence_type='CHANGED_ACTION') AS changed_action_count,
             (SELECT max(mr.created_at) FROM memory_retrieval_results rr JOIN memory_retrievals mr ON mr.id=rr.retrieval_id WHERE rr.memory_id=m.id) AS last_retrieved_at
        FROM memories m
        JOIN agents a ON a.id=m.agent_id
       WHERE ($1::UUID IS NULL OR m.agent_id=$1)
         AND ($2::STRING IS NULL OR m.evidence_state=$2)
         AND ($3::STRING IS NULL OR m.memory_type=$3)
         AND ($4::TIMESTAMPTZ IS NULL OR m.created_at < $4)
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $5
    `, [input.agentId ?? null, input.evidenceState ?? null, input.memoryType ?? null, cursor ?? null, pageLimit(input)]);

    return result.rows.map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      agentExternalId: row.external_id,
      memoryType: row.memory_type,
      summary: row.summary,
      confidence: Number(row.confidence),
      evidenceState: row.evidence_state,
      validFrom: optional(row.valid_from),
      validUntil: optional(row.valid_until),
      environmentVersion: optional(row.environment_version),
      toolVersion: optional(row.tool_version),
      policyVersion: optional(row.policy_version),
      createdAt: row.created_at,
      sourceExecutionCount: Number(row.source_execution_count),
      retrievalCount: Number(row.retrieval_count),
      exposedRetrievalCount: Number(row.exposed_retrieval_count),
      influenceCount: Number(row.influence_count),
      changedActionCount: Number(row.changed_action_count),
      lastRetrievedAt: optional(row.last_retrieved_at),
    }));
  }

  async listInfluences(input: PageInput & { executionId?: string; memoryId?: string; influenceType?: string } = {}): Promise<MemoryInfluenceSummary[]> {
    const cursor = cursorDate(input.cursor);
    const result = await this.pool.query<{
      decision_id: string;
      execution_id: string;
      memory_id: string;
      retrieval_id: string | null;
      influence_type: MemoryInfluenceSummary["influenceType"];
      influence_summary: string;
      relevance: number | null;
      selected_action: Record<string, unknown>;
      counterfactual_action: Record<string, unknown> | null;
      counterfactual_source: string | null;
      counterfactual_evidence_state: MemoryInfluenceSummary["counterfactualEvidenceState"] | null;
      counterfactual_explanation: string | null;
      comparison_execution_id: string | null;
      created_at: Date;
    }>(`
      SELECT dm.decision_id, d.execution_id, dm.memory_id, dm.retrieval_id,
             dm.influence_type, dm.influence_summary, dm.relevance,
             d.selected_action, dm.counterfactual_action, dm.counterfactual_source,
             dm.counterfactual_evidence_state, dm.counterfactual_explanation,
             dm.comparison_execution_id, d.created_at
        FROM decision_memories dm
        JOIN decisions d ON d.id=dm.decision_id
       WHERE ($1::UUID IS NULL OR d.execution_id=$1)
         AND ($2::UUID IS NULL OR dm.memory_id=$2)
         AND ($3::STRING IS NULL OR dm.influence_type=$3)
         AND ($4::TIMESTAMPTZ IS NULL OR d.created_at < $4)
       ORDER BY d.created_at DESC, dm.decision_id DESC
       LIMIT $5
    `, [input.executionId ?? null, input.memoryId ?? null, input.influenceType ?? null, cursor ?? null, pageLimit(input)]);

    return result.rows.map((row) => ({
      decisionId: row.decision_id,
      executionId: row.execution_id,
      memoryId: row.memory_id,
      retrievalId: optional(row.retrieval_id),
      influenceType: row.influence_type,
      influenceSummary: row.influence_summary,
      relevance: optional(row.relevance),
      selectedAction: row.selected_action,
      counterfactualAction: optional(row.counterfactual_action),
      counterfactualSource: optional(row.counterfactual_source),
      counterfactualEvidenceState: optional(row.counterfactual_evidence_state),
      counterfactualExplanation: optional(row.counterfactual_explanation),
      comparisonExecutionId: optional(row.comparison_execution_id),
      createdAt: row.created_at,
    }));
  }

  async listPolicyBundles(page?: PageInput): Promise<PolicyBundleRecord[]> {
    const cursor = cursorDate(page?.cursor);
    const result = await this.pool.query<{
      id: string;
      bundle_version: string;
      contract_version: string;
      description: string | null;
      definition: unknown;
      status: PolicyBundleRecord["status"];
      created_at: Date;
      activated_at: Date | null;
      retired_at: Date | null;
    }>(`
      SELECT id, bundle_version, contract_version, description, definition,
             status, created_at, activated_at, retired_at
        FROM memory_policy_bundles
       WHERE ($1::TIMESTAMPTZ IS NULL OR created_at < $1)
       ORDER BY created_at DESC, id DESC
       LIMIT $2
    `, [cursor ?? null, pageLimit(page)]);

    return result.rows.map((row) => ({
      id: row.id,
      bundleVersion: row.bundle_version,
      contractVersion: row.contract_version,
      description: optional(row.description),
      definition: MemoryPolicyBundleSchema.parse(row.definition),
      status: row.status,
      createdAt: row.created_at,
      activatedAt: optional(row.activated_at),
      retiredAt: optional(row.retired_at),
    }));
  }

  async listPolicyAssignments(page?: PageInput): Promise<PolicyAssignmentRecord[]> {
    const cursor = cursorDate(page?.cursor);
    const result = await this.pool.query<{
      id: string;
      policy_bundle_id: string;
      bundle_version: string;
      agent_external_id: string | null;
      workflow_type: string | null;
      environment_version: string | null;
      priority: string;
      valid_from: Date;
      valid_until: Date | null;
      created_at: Date;
    }>(`
      SELECT pa.id, pa.policy_bundle_id, pb.bundle_version,
             a.external_id AS agent_external_id, pa.workflow_type,
             pa.environment_version, pa.priority, pa.valid_from,
             pa.valid_until, pa.created_at
        FROM memory_policy_assignments pa
        JOIN memory_policy_bundles pb ON pb.id=pa.policy_bundle_id
        LEFT JOIN agents a ON a.id=pa.agent_id
       WHERE ($1::TIMESTAMPTZ IS NULL OR pa.created_at < $1)
       ORDER BY pa.created_at DESC, pa.id DESC
       LIMIT $2
    `, [cursor ?? null, pageLimit(page)]);

    return result.rows.map((row) => ({
      id: row.id,
      policyBundleId: row.policy_bundle_id,
      bundleVersion: row.bundle_version,
      scope: {
        agentId: optional(row.agent_external_id),
        workflowType: optional(row.workflow_type),
        environmentVersion: optional(row.environment_version),
      },
      priority: Number(row.priority),
      validFrom: row.valid_from,
      validUntil: optional(row.valid_until),
    }));
  }
}
