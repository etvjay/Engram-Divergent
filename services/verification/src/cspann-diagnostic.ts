import { mkdir, writeFile } from "node:fs/promises";
import type pg from "pg";
import { createCockroachPool } from "../../../packages/cockroach/src/client.js";
import { createConfiguredEmbeddingProvider } from "../../../packages/embeddings/src/provider.js";
import { ENGRAM_COSINE_VECTOR_INDEX } from "../../../packages/cockroach/src/vector-plan.js";

const OUTPUT = "evidence/live/cspann-diagnostic-latest.json";
const LIMIT = 8;

type PlanEvidence = {
  plan: string[];
  usesVectorSearch: boolean;
  usesCosineIndex: boolean;
  limitedScan: boolean;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function toVectorLiteral(values: number[]): string {
  if (values.length !== 1024) throw new Error(`Expected 1024-dimensional vector, got ${values.length}`);
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Vector contains non-finite values");
  return `[${values.join(",")}]`;
}

function parsePlan(rows: Array<Record<string, unknown>>): PlanEvidence {
  const plan = rows.map((row) => String(row.info ?? row[Object.keys(row)[0] ?? ""] ?? ""));
  const joined = plan.join("\n").toLowerCase();
  return {
    plan,
    usesVectorSearch: joined.includes("vector search"),
    usesCosineIndex: joined.includes(ENGRAM_COSINE_VECTOR_INDEX.toLowerCase()),
    limitedScan: joined.includes("limited scan"),
  };
}

async function explain(pool: pg.Pool, sql: string, params: unknown[] = []): Promise<PlanEvidence> {
  const result = await pool.query<Record<string, unknown>>(`EXPLAIN ${sql}`, params);
  return parsePlan(result.rows);
}

async function main() {
  requireEnv("DATABASE_URL");
  const pool = createCockroachPool();
  try {
    const provider = createConfiguredEmbeddingProvider();
    const query = process.env.ENGRAM_CSPANN_DIAGNOSTIC_QUERY?.trim()
      || "multi venue acquisition under thin liquidity where Venue C may fail";
    const vector = await provider.embed(query);
    const literal = toVectorLiteral(vector);

    const agentResult = await pool.query<{ id: string; external_id: string; memory_count: string }>(
      `SELECT a.id, a.external_id, count(m.id)::STRING AS memory_count
         FROM agents a
         JOIN memories m ON m.agent_id=a.id
        WHERE a.external_id LIKE 'engram-scale-a-%'
        GROUP BY a.id, a.external_id
        ORDER BY count(m.id) DESC
        LIMIT 1`,
    );
    const agent = agentResult.rows[0];
    if (!agent) throw new Error("No scale Agent A fixture found; run npm run verify:scale first");

    let vectorIndexEnabled: string | null = null;
    try {
      const setting = await pool.query<{ value: string }>("SHOW CLUSTER SETTING feature.vector_index.enabled");
      vectorIndexEnabled = String(setting.rows[0]?.value ?? "");
    } catch (error) {
      vectorIndexEnabled = `UNAVAILABLE:${error instanceof Error ? error.message : String(error)}`;
    }

    const indexes = await pool.query<Record<string, unknown>>(`SHOW INDEXES FROM memories`);

    const variants: Record<string, PlanEvidence | { error: string }> = {};
    const run = async (name: string, sql: string, params: unknown[] = []) => {
      try {
        variants[name] = await explain(pool, sql, params);
      } catch (error) {
        variants[name] = { error: error instanceof Error ? error.message : String(error) };
      }
    };

    // Natural, parameterized cosine search with only the required prefix equality.
    await run(
      "naturalParameterizedPrefixOnly",
      `SELECT id, embedding <=> $1::VECTOR AS distance
         FROM memories
        WHERE agent_id=$2
        ORDER BY embedding <=> $1::VECTOR
        LIMIT $3`,
      [literal, agent.id, LIMIT],
    );

    // Same shape as Engram's current vector-only diagnostic, retaining the explicit NULL filter.
    await run(
      "naturalParameterizedWithNotNull",
      `SELECT id, embedding <=> $1::VECTOR AS distance
         FROM memories
        WHERE agent_id=$2 AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::VECTOR
        LIMIT $3`,
      [literal, agent.id, LIMIT],
    );

    // Rule out placeholder/generic-plan matching by embedding the query vector as a SQL literal.
    await run(
      "naturalLiteralPrefixOnly",
      `SELECT id, embedding <=> '${literal}'::VECTOR AS distance
         FROM memories
        WHERE agent_id='${agent.id}'::UUID
        ORDER BY embedding <=> '${literal}'::VECTOR
        LIMIT ${LIMIT}`,
    );

    // Explicit index selection proves whether the cosine vector index is operable for this query shape.
    await run(
      "forcedCosineIndexPrefixOnly",
      `SELECT id, embedding <=> $1::VECTOR AS distance
         FROM memories@${ENGRAM_COSINE_VECTOR_INDEX}
        WHERE agent_id=$2
        ORDER BY embedding <=> $1::VECTOR
        LIMIT $3`,
      [literal, agent.id, LIMIT],
    );

    await run(
      "forcedCosineIndexWithNotNull",
      `SELECT id, embedding <=> $1::VECTOR AS distance
         FROM memories@${ENGRAM_COSINE_VECTOR_INDEX}
        WHERE agent_id=$2 AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::VECTOR
        LIMIT $3`,
      [literal, agent.id, LIMIT],
    );

    const naturalPrefix = variants.naturalParameterizedPrefixOnly as PlanEvidence | undefined;
    const naturalNotNull = variants.naturalParameterizedWithNotNull as PlanEvidence | undefined;
    const forced = variants.forcedCosineIndexPrefixOnly as PlanEvidence | undefined;

    let diagnosis = "UNRESOLVED";
    if (naturalPrefix?.usesVectorSearch && naturalPrefix?.usesCosineIndex) {
      diagnosis = naturalNotNull?.usesVectorSearch
        ? "NATURAL_CSPANN_WORKS"
        : "NOT_NULL_FILTER_SUPPRESSES_CSPANN";
    } else if (forced?.usesVectorSearch && forced?.usesCosineIndex) {
      diagnosis = "OPTIMIZER_COSTING_OR_MATCHING_SUPPRESSES_CSPANN";
    } else if ("error" in (variants.forcedCosineIndexPrefixOnly ?? {})) {
      diagnosis = "FORCED_VECTOR_INDEX_REJECTED";
    } else {
      diagnosis = "VECTOR_INDEX_PRESENT_BUT_VECTOR_SEARCH_NOT_PROVEN";
    }

    const evidence = {
      schemaVersion: "engram-cspann-diagnostic-v1",
      generatedAt: new Date().toISOString(),
      databaseVersion: (await pool.query<{ version: string }>("SELECT version() AS version")).rows[0]?.version ?? null,
      embedding: {
        provider: provider.provider,
        modelId: provider.modelId,
        dimensions: provider.dimensions,
      },
      agent,
      featureVectorIndexEnabled: vectorIndexEnabled,
      expectedIndex: ENGRAM_COSINE_VECTOR_INDEX,
      indexes: indexes.rows,
      diagnosis,
      variants,
      note: "Diagnostic only. Do not patch production retrieval or change distance metric solely to force an index plan; use this evidence to isolate optimizer/query-shape behavior first.",
    };

    await mkdir("evidence/live", { recursive: true });
    await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ok: true, diagnosis, evidence: OUTPUT }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
