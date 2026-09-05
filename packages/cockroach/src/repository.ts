import type pg from "pg";
import { randomUUID } from "node:crypto";
import type {
  Decision,
  EmbeddingProvider,
  ExecutionContext,
  ExecutionEvent,
  MemoryRepository,
  MemorySearchInput,
  MemorySearchResult,
  OperationalMemory,
  Outcome,
} from "../../memory-core/src/domain.js";
import { scoreMemory } from "../../memory-core/src/policy.js";
import { withTransaction } from "./client.js";

function toVectorLiteral(values: number[]): string {
  if (values.length !== 1024) throw new Error(`Expected 1024-dimensional embedding, received ${values.length}`);
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Embedding contains a non-finite value");
  return `[${values.join(",")}]`;
}

function asJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

export function resolveVectorCandidateLimit(resultLimit: number): number {
  const configured = Number(process.env.ENGRAM_VECTOR_CANDIDATE_LIMIT ?? "");
  const desired = Number.isInteger(configured) && configured > 0
    ? configured
    : Math.max(resultLimit * 8, 64);
  return Math.min(Math.max(desired, resultLimit), 400);
}

/**
 * Resolve the C-SPANN search beam size from ENGRAM_VECTOR_BEAM_SIZE.
 * Controls how many graph nodes CockroachDB explores during ANN traversal
 * for Stage 1 candidate generation. Higher values improve recall at the
 * cost of latency. Validated as a positive integer; clamped to [1, 1024].
 * Default is 128 (empirically determined: recovers full recall at 10k scale).
 */
export function resolveVectorBeamSize(): number {
  const configured = Number(process.env.ENGRAM_VECTOR_BEAM_SIZE ?? "");
  const value = Number.isInteger(configured) && configured > 0 ? configured : 128;
  return Math.min(Math.max(value, 1), 1024);
}

export class CockroachMemoryRepository implements MemoryRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly embeddings: EmbeddingProvider,
  ) {
    if (embeddings.dimensions !== 1024) throw new Error("Engram MVP schema requires 1024-dimensional embeddings");
  }

  private async ensureAgent(client: pg.PoolClient, externalId: string, version?: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO agents (external_id, agent_version)
       VALUES ($1, $2)
       ON CONFLICT (external_id) DO UPDATE SET agent_version = COALESCE(excluded.agent_version, agents.agent_version)
       RETURNING id`,
      [externalId, version ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Agent upsert returned no row");
    return row.id;
  }

  async startExecution(input: ExecutionContext): Promise<{ executionId: string }> {
    return withTransaction(this.pool, async (client) => {
      const agentId = await this.ensureAgent(client, input.agentId, input.agentVersion);
      const result = await client.query<{ id: string }>(
        `INSERT INTO executions
          (agent_id, workflow_type, intent, context, constraints, environment_version, policy_version, tool_version, status)
         VALUES ($1,$2,$3,$4::JSONB,$5::JSONB,$6,$7,$8,'RUNNING') RETURNING id`,
        [agentId, input.workflowType, input.intent, asJson(input.context), asJson(input.constraints), input.environmentVersion ?? null, input.policyVersion ?? null, input.toolVersion ?? null],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Execution insert returned no row");
      return { executionId: row.id };
    });
  }

  async appendEvent(event: ExecutionEvent): Promise<void> {
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO execution_events (id, execution_id, sequence_no, event_type, payload, evidence_state, occurred_at)
       VALUES ($1,$2,$3,$4,$5::JSONB,$6,$7)
       ON CONFLICT (execution_id, sequence_no) DO NOTHING
       RETURNING id`,
      [event.id, event.executionId, event.sequenceNo, event.eventType, asJson(event.payload), event.evidenceState, event.occurredAt],
    );
    if (inserted.rowCount && inserted.rowCount > 0) return;

    const replay = await this.pool.query<{ id: string }>(
      `SELECT id
         FROM execution_events
        WHERE execution_id=$2
          AND sequence_no=$3
          AND id=$1
          AND event_type=$4
          AND payload=$5::JSONB
          AND evidence_state=$6
          AND occurred_at=$7`,
      [event.id, event.executionId, event.sequenceNo, event.eventType, asJson(event.payload), event.evidenceState, event.occurredAt],
    );
    if (!replay.rows[0]) {
      throw new Error(`EVENT_IDEMPOTENCY_CONFLICT:${event.executionId}:${event.sequenceNo}`);
    }
  }

  async recordOutcome(outcome: Outcome): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO outcomes (id, execution_id, status, failure_type, summary, result, evidence_state)
         VALUES ($1,$2,$3,$4,$5,$6::JSONB,$7)
         ON CONFLICT (execution_id) DO NOTHING
         RETURNING id`,
        [outcome.id, outcome.executionId, outcome.status, outcome.failureType ?? null, outcome.summary, asJson(outcome.result), outcome.evidenceState],
      );

      if (inserted.rowCount && inserted.rowCount > 0) {
        await client.query(
          `UPDATE executions SET status=$2, completed_at=now() WHERE id=$1`,
          [outcome.executionId, outcome.status],
        );
        return;
      }

      const replay = await client.query<{ id: string }>(
        `SELECT id
           FROM outcomes
          WHERE execution_id=$2
            AND id=$1
            AND status=$3
            AND failure_type IS NOT DISTINCT FROM $4::STRING
            AND summary=$5
            AND result=$6::JSONB
            AND evidence_state=$7`,
        [outcome.id, outcome.executionId, outcome.status, outcome.failureType ?? null, outcome.summary, asJson(outcome.result), outcome.evidenceState],
      );
      if (!replay.rows[0]) {
        throw new Error(`OUTCOME_IDEMPOTENCY_CONFLICT:${outcome.executionId}`);
      }
    });
  }

  async persistMemory(memory: OperationalMemory, sourceExecutionIds: string[]): Promise<void> {
    if (sourceExecutionIds.length === 0) throw new Error("Operational memory requires at least one source execution");
    const embedding = await this.embeddings.embed(`${memory.summary}\n${JSON.stringify(memory.structuredContext)}`);
    const vector = toVectorLiteral(embedding);

    await withTransaction(this.pool, async (client) => {
      const agentId = await this.ensureAgent(client, memory.agentId);
      await client.query(
        `INSERT INTO memories
          (id, agent_id, memory_type, summary, structured_context, confidence, evidence_state, embedding, valid_from, valid_until, environment_version, tool_version, policy_version)
         VALUES ($1,$2,$3,$4,$5::JSONB,$6,$7,$8::VECTOR,$9,$10,$11,$12,$13)`,
        [memory.id, agentId, memory.memoryType, memory.summary, asJson(memory.structuredContext), memory.confidence, memory.evidenceState, vector, memory.validFrom ?? null, memory.validUntil ?? null, memory.environmentVersion ?? null, memory.toolVersion ?? null, memory.policyVersion ?? null],
      );
      for (const executionId of sourceExecutionIds) {
        await client.query(`INSERT INTO memory_sources (memory_id, execution_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [memory.id, executionId]);
      }
    });
  }

  async searchMemory(input: MemorySearchInput): Promise<MemorySearchResult> {
    const embedding = await this.embeddings.embed(input.query);
    const vector = toVectorLiteral(embedding);
    const retrievalId = randomUUID();
    const limit = Math.min(Math.max(input.limit ?? 8, 1), 50);
    const candidateLimit = resolveVectorCandidateLimit(limit);
    const beamSize = resolveVectorBeamSize();

    return withTransaction(this.pool, async (client) => {
      const agentResult = await client.query<{ id: string }>(`SELECT id FROM agents WHERE external_id=$1`, [input.agentId]);
      const agent = agentResult.rows[0];
      if (!agent) return { retrievalId, candidates: [] };

      await client.query(
        `INSERT INTO memory_retrievals (id, execution_id, agent_id, query, filters, retrieval_policy_version)
         VALUES ($1,$2,$3,$4,$5::JSONB,$6)`,
        [retrievalId, input.executionId ?? null, agent.id, input.query, asJson({ workflowType: input.workflowType, status: input.status, environmentVersion: input.environmentVersion, candidateLimit, beamSize }), input.retrievalPolicyVersion ?? "engram-hybrid-v1"],
      );

      await client.query(`SET LOCAL vector_search_beam_size = ${beamSize}`);
      const candidateRows = await client.query<{ id: string; semantic_score: number }>(
        `SELECT id,
                greatest(0, least(1, 1 - (embedding <=> $1::VECTOR))) AS semantic_score
           FROM memories
          WHERE agent_id=$2
          ORDER BY embedding <=> $1::VECTOR
          LIMIT $3`,
        [vector, agent.id, candidateLimit],
      );
      if (!candidateRows.rows.length) return { retrievalId, candidates: [] };

      const semanticScores = new Map(candidateRows.rows.map((row) => [row.id, Number(row.semantic_score)]));
      const candidateIds = candidateRows.rows.map((row) => row.id);

      const rows = await client.query<{
        id: string; memory_type: string; summary: string; structured_context: Record<string, unknown>; confidence: number;
        evidence_state: OperationalMemory["evidenceState"]; valid_from: Date | null; valid_until: Date | null;
        environment_version: string | null; tool_version: string | null; policy_version: string | null;
        source_status: string | null; created_at: Date;
      }>(
        `SELECT m.id, m.memory_type, m.summary, m.structured_context, m.confidence, m.evidence_state,
                m.valid_from, m.valid_until, m.environment_version, m.tool_version, m.policy_version, m.created_at,
                o.status AS source_status
           FROM memories m
           LEFT JOIN memory_sources ms ON ms.memory_id=m.id
           LEFT JOIN outcomes o ON o.execution_id=ms.execution_id
          WHERE m.id = ANY($1::UUID[])
            AND m.agent_id=$2
            AND (m.valid_from IS NULL OR m.valid_from <= now())
            AND (m.valid_until IS NULL OR m.valid_until > now())
            AND ($3::STRING IS NULL OR m.structured_context->>'workflowType'=$3)
            AND ($4::STRING IS NULL OR m.environment_version=$4)
            AND ($5::STRING[] IS NULL OR o.status = ANY($5::STRING[]))`,
        [candidateIds, agent.id, input.workflowType ?? null, input.environmentVersion ?? null, input.status?.length ? input.status : null],
      );

      const now = Date.now();
      const scored = rows.rows.map((row) => {
        const memory: OperationalMemory = {
          id: row.id,
          agentId: input.agentId,
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
        const contextScore = input.workflowType && row.structured_context.workflowType === input.workflowType ? 1 : 0.75;
        const outcomeScore = ["FAILURE", "COMPENSATED", "PARTIAL", "ABORTED", "UNKNOWN"].includes(row.source_status ?? "") ? 1 : 0.5;
        const ageDays = Math.max(0, (now - row.created_at.getTime()) / 86_400_000);
        const recencyScore = Math.max(0, 1 - ageDays / 30);
        const semanticScore = semanticScores.get(row.id);
        if (semanticScore === undefined) throw new Error(`Candidate ${row.id} is missing its Stage 1 semantic score`);
        const finalScore = scoreMemory({ memory, semanticScore, contextScore, outcomeScore, recencyScore });
        return { memory, semanticScore, contextScore, outcomeScore, confidenceScore: memory.confidence, recencyScore, finalScore };
      }).sort((a, b) => b.finalScore - a.finalScore).slice(0, limit);

      const candidates = scored.map((candidate, index) => ({ ...candidate, memoryId: candidate.memory.id, rank: index + 1 }));
      for (const c of candidates) {
        await client.query(
          `INSERT INTO memory_retrieval_results
            (retrieval_id,memory_id,semantic_score,context_score,outcome_score,confidence_score,recency_score,final_score,rank)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [retrievalId, c.memoryId, c.semanticScore, c.contextScore, c.outcomeScore, c.confidenceScore, c.recencyScore, c.finalScore, c.rank],
        );
      }
      return { retrievalId, candidates };
    });
  }

  async recordDecision(decision: Decision, retrievalId?: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO decisions (id, execution_id, decision_type, selected_action, alternatives, reasoning_summary)
         VALUES ($1,$2,$3,$4::JSONB,$5::JSONB,$6)`,
        [decision.id, decision.executionId, decision.decisionType, asJson(decision.selectedAction), asJson(decision.alternatives), decision.reasoningSummary],
      );
      for (const influence of decision.memoryInfluences) {
        await client.query(
          `INSERT INTO decision_memories
            (decision_id,memory_id,retrieval_id,influence_type,influence_summary,relevance,counterfactual_action)
           VALUES ($1,$2,$3,$4,$5,$6,$7::JSONB)`,
          [decision.id, influence.memoryId, retrievalId ?? null, influence.influenceType, influence.influenceSummary, influence.relevance ?? null, asJson(influence.counterfactualAction)],
        );
      }
    });
  }

  async getTrace(executionId: string): Promise<unknown> {
    const [execution, events, outcome, decisions, retrievals] = await Promise.all([
      this.pool.query(`SELECT e.*, a.external_id AS agent_external_id FROM executions e JOIN agents a ON a.id=e.agent_id WHERE e.id=$1`, [executionId]),
      this.pool.query(`SELECT * FROM execution_events WHERE execution_id=$1 ORDER BY sequence_no`, [executionId]),
      this.pool.query(`SELECT * FROM outcomes WHERE execution_id=$1`, [executionId]),
      this.pool.query(`SELECT d.*, COALESCE(json_agg(dm) FILTER (WHERE dm.memory_id IS NOT NULL), '[]'::JSON) AS memory_influences FROM decisions d LEFT JOIN decision_memories dm ON dm.decision_id=d.id WHERE d.execution_id=$1 GROUP BY d.id ORDER BY d.created_at`, [executionId]),
      this.pool.query(`SELECT mr.*, COALESCE(json_agg(mrr ORDER BY mrr.rank) FILTER (WHERE mrr.memory_id IS NOT NULL), '[]'::JSON) AS results FROM memory_retrievals mr LEFT JOIN memory_retrieval_results mrr ON mrr.retrieval_id=mr.id WHERE mr.execution_id=$1 GROUP BY mr.id ORDER BY mr.created_at`, [executionId]),
    ]);
    return { execution: execution.rows[0] ?? null, events: events.rows, outcome: outcome.rows[0] ?? null, retrievals: retrievals.rows, decisions: decisions.rows };
  }
}
