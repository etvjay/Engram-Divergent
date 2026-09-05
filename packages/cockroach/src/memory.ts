import type { Pool } from "pg";

export type HybridSearchInput = {
  agentExternalId: string;
  queryEmbedding: number[];
  workflowType?: string;
  environmentVersion?: string;
  limit?: number;
};

export type HybridMemoryRow = {
  id: string;
  summary: string;
  structured_context: Record<string, unknown>;
  confidence: number;
  semantic_score: number;
};

function toVectorLiteral(values: number[]): string {
  if (values.length === 0) throw new Error("queryEmbedding must not be empty");
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("queryEmbedding contains a non-finite value");
  }
  return `[${values.join(",")}]`;
}

async function resolveAgentId(pool: Pool, externalId: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM agents WHERE external_id = $1`,
    [externalId],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Low-level candidate-search helper retained for compatibility. Canonical
 * runtime retrieval lives in CockroachMemoryRepository; EXPLAIN evidence for
 * that exact query shape lives in vector-plan.ts.
 */
export async function searchMemoryCandidates(
  pool: Pool,
  input: HybridSearchInput,
): Promise<HybridMemoryRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
  const vector = toVectorLiteral(input.queryEmbedding);
  const agentId = await resolveAgentId(pool, input.agentExternalId);
  if (!agentId) return [];

  const result = await pool.query<HybridMemoryRow>(
    `
      SELECT
        m.id,
        m.summary,
        m.structured_context,
        m.confidence,
        1 - (m.embedding <=> $1::VECTOR) AS semantic_score
      FROM memories AS m
      WHERE m.agent_id = $2::UUID
        AND m.embedding IS NOT NULL
        AND (m.valid_from IS NULL OR m.valid_from <= now())
        AND (m.valid_until IS NULL OR m.valid_until > now())
        AND ($3::STRING IS NULL OR m.structured_context->>'workflowType' = $3)
        AND ($4::STRING IS NULL OR m.environment_version = $4)
      ORDER BY m.embedding <=> $1::VECTOR
      LIMIT $5
    `,
    [vector, agentId, input.workflowType ?? null, input.environmentVersion ?? null, limit],
  );

  return result.rows;
}

export async function getMemoryProvenance(pool: Pool, memoryId: string) {
  const result = await pool.query(
    `
      SELECT
        m.id AS memory_id,
        m.summary AS memory_summary,
        e.id AS execution_id,
        e.intent,
        o.status AS outcome_status,
        o.failure_type,
        o.summary AS outcome_summary
      FROM memories AS m
      JOIN memory_sources AS ms ON ms.memory_id = m.id
      JOIN executions AS e ON e.id = ms.execution_id
      LEFT JOIN outcomes AS o ON o.execution_id = e.id
      WHERE m.id = $1
      ORDER BY e.started_at ASC
    `,
    [memoryId],
  );

  return result.rows;
}
