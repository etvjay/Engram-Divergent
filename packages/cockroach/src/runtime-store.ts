import type pg from "pg";
import type { EvidenceState, MemoryRecall } from "../../core/src/protocol.js";
import type {
  ExecutionContext,
  ExecutionEvent,
  MemorySearchInput,
  MemorySearchResult,
  OperationalMemory,
  Outcome,
} from "../../memory-core/src/domain.js";
import type { EngramRuntimeStore } from "../../runtime/src/store.js";
import type {
  RecallExposureUpdate,
  RuntimeDecisionRecord,
  RuntimeEvaluationEvent,
  RuntimeExecutionRecord,
} from "../../runtime/src/types.js";
import { CockroachMemoryRepository } from "./repository.js";

function asJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

export class CockroachRuntimeStore implements EngramRuntimeStore {
  constructor(
    private readonly pool: pg.Pool,
    private readonly memory: CockroachMemoryRepository,
  ) {}

  startExecution(input: ExecutionContext) {
    return this.memory.startExecution(input);
  }

  async setExecutionMemoryPolicy(executionId: string, bundleVersion: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE executions
          SET memory_policy_bundle_version=$2
        WHERE id=$1 AND memory_policy_bundle_version IS NULL
        RETURNING id`,
      [executionId, bundleVersion],
    );
    if (result.rowCount === 1) return;

    const existing = await this.pool.query<{ memory_policy_bundle_version: string | null }>(
      `SELECT memory_policy_bundle_version FROM executions WHERE id=$1`,
      [executionId],
    );
    const current = existing.rows[0]?.memory_policy_bundle_version;
    if (current === bundleVersion) return;
    if (!existing.rows[0]) throw new Error(`Execution ${executionId} does not exist`);
    throw new Error(`EXECUTION_POLICY_FROZEN: execution ${executionId} already uses ${current ?? "no bundle"}`);
  }

  appendEvent(event: ExecutionEvent) {
    return this.memory.appendEvent(event);
  }

  recordOutcome(outcome: Outcome) {
    return this.memory.recordOutcome(outcome);
  }

  async getOutcomeEvidenceState(executionId: string): Promise<EvidenceState | null> {
    const result = await this.pool.query<{ evidence_state: EvidenceState }>(
      `SELECT evidence_state FROM outcomes WHERE execution_id=$1 LIMIT 1`,
      [executionId],
    );
    return result.rows[0]?.evidence_state ?? null;
  }

  searchMemory(input: MemorySearchInput): Promise<MemorySearchResult> {
    return this.memory.searchMemory(input);
  }

  persistMemory(memory: OperationalMemory, sourceExecutionIds: string[]) {
    return this.memory.persistMemory(memory, sourceExecutionIds);
  }

  async getTrace(executionId: string) {
    const [baseTrace, runtimeEvaluations] = await Promise.all([
      this.memory.getTrace(executionId),
      this.pool.query<{
        id: string;
        execution_id: string;
        event_type: RuntimeEvaluationEvent["eventType"];
        payload: Record<string, unknown>;
        created_at: Date;
      }>(
        `SELECT id, execution_id, event_type, payload, created_at
           FROM runtime_evaluation_events
          WHERE execution_id=$1
          ORDER BY created_at, id`,
        [executionId],
      ),
    ]);

    const trace = typeof baseTrace === "object" && baseTrace !== null
      ? baseTrace as Record<string, unknown>
      : { baseTrace };

    return {
      ...trace,
      runtimeEvaluations: runtimeEvaluations.rows.map((row) => ({
        id: row.id,
        executionId: row.execution_id,
        eventType: row.event_type,
        payload: row.payload,
        createdAt: row.created_at,
      })),
    };
  }

  async getExecution(executionId: string): Promise<RuntimeExecutionRecord | null> {
    const result = await this.pool.query<{
      id: string;
      agent_external_id: string;
      agent_version: string | null;
      workflow_type: string;
      intent: string;
      context: Record<string, unknown>;
      constraints: Record<string, unknown>;
      environment_version: string | null;
      tool_version: string | null;
      policy_version: string | null;
      memory_policy_bundle_version: string | null;
      status: RuntimeExecutionRecord["status"];
      started_at: Date;
      completed_at: Date | null;
    }>(
      `SELECT e.id, a.external_id AS agent_external_id, a.agent_version,
              e.workflow_type, e.intent, e.context, e.constraints,
              e.environment_version, e.tool_version, e.policy_version,
              e.memory_policy_bundle_version,
              e.status, e.started_at, e.completed_at
         FROM executions e
         JOIN agents a ON a.id=e.agent_id
        WHERE e.id=$1`,
      [executionId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      agentId: row.agent_external_id,
      agentVersion: row.agent_version ?? undefined,
      workflowType: row.workflow_type,
      intent: row.intent,
      context: row.context,
      constraints: row.constraints,
      environmentVersion: row.environment_version ?? undefined,
      toolVersion: row.tool_version ?? undefined,
      policyVersion: row.policy_version ?? undefined,
      memoryPolicyBundleVersion: row.memory_policy_bundle_version ?? undefined,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
    };
  }

  async getMemory(memoryId: string): Promise<OperationalMemory | null> {
    const result = await this.pool.query<{
      id: string;
      agent_external_id: string;
      memory_type: string;
      summary: string;
      structured_context: Record<string, unknown>;
      confidence: number;
      evidence_state: OperationalMemory["evidenceState"];
      valid_from: Date | null;
      valid_until: Date | null;
      environment_version: string | null;
      tool_version: string | null;
      policy_version: string | null;
    }>(
      `SELECT m.id, a.external_id AS agent_external_id, m.memory_type, m.summary,
              m.structured_context, m.confidence, m.evidence_state,
              m.valid_from, m.valid_until, m.environment_version,
              m.tool_version, m.policy_version
         FROM memories m
         JOIN agents a ON a.id=m.agent_id
        WHERE m.id=$1`,
      [memoryId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      agentId: row.agent_external_id,
      memoryType: row.memory_type,
      summary: row.summary,
      structuredContext: row.structured_context,
      confidence: Number(row.confidence),
      evidenceState: row.evidence_state,
      validFrom: row.valid_from ?? undefined,
      validUntil: row.valid_until ?? undefined,
      environmentVersion: row.environment_version ?? undefined,
      toolVersion: row.tool_version ?? undefined,
      policyVersion: row.policy_version ?? undefined,
    };
  }

  async getRecalls(executionId: string): Promise<MemoryRecall[]> {
    const result = await this.pool.query<{
      id: string;
      query: string;
      retrieval_policy_version: string | null;
      created_at: Date;
      candidates: Array<{ memory_id: string; rank: number; final_score: number; memory_state_digest: string | null }>;
    }>(
      `SELECT mr.id, mr.query, mr.retrieval_policy_version, mr.created_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'memory_id', mrr.memory_id,
                    'rank', mrr.rank,
                    'final_score', mrr.final_score,
                    'memory_state_digest', mrr.memory_state_digest
                  ) ORDER BY mrr.rank
                ) FILTER (WHERE mrr.memory_id IS NOT NULL AND mrr.exposed_to_agent = true),
                '[]'::JSON
              ) AS candidates
         FROM memory_retrievals mr
         LEFT JOIN memory_retrieval_results mrr ON mrr.retrieval_id=mr.id
        WHERE mr.execution_id=$1
        GROUP BY mr.id
        ORDER BY mr.created_at`,
      [executionId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      executionId,
      query: row.query,
      policyVersion: row.retrieval_policy_version ?? "unknown",
      recalledAt: row.created_at,
      candidates: row.candidates.map((candidate) => ({
        retrievalId: row.id,
        memoryId: candidate.memory_id,
        memoryStateDigest: candidate.memory_state_digest ?? undefined,
        rank: Number(candidate.rank),
        score: Number(candidate.final_score),
      })),
    }));
  }

  async updateRecallExposure(update: RecallExposureUpdate): Promise<void> {
    await this.pool.query(
      `UPDATE memory_retrieval_results
          SET exposed_to_agent = false,
              rejection_reasons = NULL,
              memory_state_digest = NULL
        WHERE retrieval_id=$1`,
      [update.retrievalId],
    );

    for (const exposure of update.exposedMemoryStates) {
      await this.pool.query(
        `UPDATE memory_retrieval_results
            SET exposed_to_agent = true,
                rejection_reasons = NULL,
                memory_state_digest = $3
          WHERE retrieval_id=$1 AND memory_id=$2`,
        [update.retrievalId, exposure.memoryId, exposure.memoryStateDigest],
      );
    }

    for (const rejection of update.rejected) {
      await this.pool.query(
        `UPDATE memory_retrieval_results
            SET rejection_reasons=$3::JSONB
          WHERE retrieval_id=$1 AND memory_id=$2`,
        [update.retrievalId, rejection.memoryId, asJson(rejection.reasons)],
      );
    }
  }

  async recordRuntimeDecision(decision: RuntimeDecisionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO decisions (id, execution_id, decision_type, selected_action, alternatives, reasoning_summary, created_at)
       VALUES ($1,$2,$3,$4::JSONB,$5::JSONB,$6,$7)`,
      [
        decision.id,
        decision.executionId,
        decision.decisionType,
        asJson(decision.selectedAction),
        asJson(decision.alternatives ?? []),
        decision.reasoningSummary,
        decision.decidedAt,
      ],
    );

    for (const influence of decision.influences) {
      await this.pool.query(
        `INSERT INTO decision_memories
          (decision_id, memory_id, retrieval_id, influence_type, influence_summary,
           relevance, counterfactual_action, counterfactual_source,
           counterfactual_evidence_state, counterfactual_explanation,
           comparison_execution_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7::JSONB,$8,$9,$10,$11)`,
        [
          decision.id,
          influence.memoryId,
          influence.retrievalId ?? null,
          influence.influenceType,
          influence.summary,
          influence.relevance ?? null,
          asJson(influence.counterfactual?.action ?? null),
          influence.counterfactual?.source ?? null,
          influence.counterfactual?.evidenceState ?? null,
          influence.counterfactual?.explanation ?? null,
          influence.counterfactual?.comparisonExecutionId ?? null,
        ],
      );
    }
  }

  async appendRuntimeEvaluationEvent(event: RuntimeEvaluationEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO runtime_evaluation_events (id, execution_id, event_type, payload, created_at)
       VALUES ($1,$2,$3,$4::JSONB,$5)`,
      [event.id, event.executionId, event.eventType, asJson(event.payload), event.createdAt],
    );
  }
}