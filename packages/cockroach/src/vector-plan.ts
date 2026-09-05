import type pg from "pg";
import { resolveVectorBeamSize } from "./repository.js";

export const ENGRAM_COSINE_VECTOR_INDEX = "memories_agent_embedding_cosine_idx" as const;

function toVectorLiteral(values: number[]): string {
  if (values.length !== 1024) throw new Error(`Expected 1024-dimensional embedding, received ${values.length}`);
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Embedding contains a non-finite value");
  return `[${values.join(",")}]`;
}

export type VectorPlanInput = {
  agentExternalId: string;
  queryEmbedding: number[];
  workflowType?: string;
  environmentVersion?: string;
  status?: string[];
  limit?: number;
};

export type VectorPlanEvidence = {
  plan: string[];
  usesVectorSearch: boolean;
  usesCosineIndex: boolean;
  limitedScan: boolean;
};

function candidateLimit(resultLimit: number): number {
  const configured = Number(process.env.ENGRAM_VECTOR_CANDIDATE_LIMIT ?? "");
  const desired = Number.isInteger(configured) && configured > 0
    ? configured
    : Math.max(resultLimit * 8, 64);
  return Math.min(Math.max(desired, resultLimit), 400);
}

/**
 * Explain Stage 1 of CockroachMemoryRepository search: agent-scoped cosine
 * candidate generation only. Canonical validity/context/source filters are
 * applied in Stage 2 over the returned candidate IDs and intentionally do not
 * participate in the vector-index access path.
 *
 * Do not add `embedding IS NOT NULL` here. CockroachDB 26.2.5 live diagnostics
 * proved that predicate suppresses the C-SPANN vector-search plan for this index.
 */
export async function explainEngramMemorySearch(
  pool: pg.Pool,
  input: VectorPlanInput,
): Promise<VectorPlanEvidence> {
  const agentResult = await pool.query<{ id: string }>(
    `SELECT id FROM agents WHERE external_id=$1`,
    [input.agentExternalId],
  );
  const agent = agentResult.rows[0];
  if (!agent) throw new Error(`Agent ${input.agentExternalId} does not exist`);

  const vector = toVectorLiteral(input.queryEmbedding);
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 50);
  const candidates = candidateLimit(limit);
  const beamSize = resolveVectorBeamSize();
  const client = await pool.connect();
  let result: import("pg").QueryResult<Record<string, unknown>>;
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL vector_search_beam_size = ${beamSize}`);
    result = await client.query<Record<string, unknown>>(
      `EXPLAIN SELECT id,
                      greatest(0, least(1, 1 - (embedding <=> $1::VECTOR))) AS semantic_score
         FROM memories
        WHERE agent_id=$2
        ORDER BY embedding <=> $1::VECTOR
        LIMIT $3`,
      [vector, agent.id, candidates],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  const plan = result.rows.map((row) => {
    const value = row.info ?? row[Object.keys(row)[0] ?? ""];
    return String(value ?? "");
  });
  const joined = plan.join("\n").toLowerCase();
  return {
    plan,
    usesVectorSearch: joined.includes("vector search"),
    usesCosineIndex: joined.includes(ENGRAM_COSINE_VECTOR_INDEX.toLowerCase()),
    limitedScan: joined.includes("limited scan"),
  };
}
