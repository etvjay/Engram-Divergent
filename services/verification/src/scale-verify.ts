import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type pg from "pg";
import { createCockroachPool } from "../../../packages/cockroach/src/client.js";
import { applyEngramMigrations } from "../../../packages/cockroach/src/migrations.js";
import { explainEngramMemorySearch } from "../../../packages/cockroach/src/vector-plan.js";
import { resolveVectorCandidateLimit, resolveVectorBeamSize } from "../../../packages/cockroach/src/repository.js";
import { createConfiguredEmbeddingProvider } from "../../../packages/embeddings/src/provider.js";

const OUTPUT = "evidence/live/scale-latest.json";
const WORKFLOW = "multi_venue_execution";
const ENV = "scale-v1";
const MARKER = "engram-cspann-scale-v1";
const STATUS = ["COMPENSATED", "FAILURE", "PARTIAL"];
const DIMS = 1024;
const RESULT_LIMIT = 8;

type Row = { id: string; distance: number };

function need(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function checkpointSizes(): number[] {
  const parsed = (process.env.ENGRAM_SCALE_SIZES ?? "10000,25000,50000")
    .split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0);
  if (!parsed.length) throw new Error("ENGRAM_SCALE_SIZES must contain positive integers");
  return [...new Set(parsed)].sort((a, b) => a - b);
}

function fixtureId(namespace: string, ordinal: number): string {
  const hex = createHash("sha256").update(`${namespace}:${ordinal}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function deterministicScaleVector(seed: number): number[] {
  const vector = Array<number>(DIMS).fill(0);
  let state = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < 12; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    const position = state % DIMS;
    const sign = (state & 1) === 0 ? 1 : -1;
    vector[position] = (vector[position] ?? 0) + sign * (0.25 + ((state >>> 8) % 1000) / 1000);
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

function literal(vector: number[]): string {
  if (vector.length !== DIMS || vector.some((value) => !Number.isFinite(value))) throw new Error("Invalid scale vector");
  return `[${vector.join(",")}]`;
}

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return Number((sorted[index] ?? 0).toFixed(3));
}

function recallAt8(expected: Row[], actual: Row[]): number {
  const ids = new Set(expected.slice(0, RESULT_LIMIT).map((row) => row.id));
  const hits = actual.slice(0, RESULT_LIMIT).filter((row) => ids.has(row.id)).length;
  return Number((hits / Math.max(1, ids.size)).toFixed(4));
}

async function ensureAgent(pool: pg.Pool, externalId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO agents (external_id,name,agent_version,runtime)
     VALUES ($1,$2,'scale-v1','fixture')
     ON CONFLICT (external_id) DO UPDATE SET name=excluded.name RETURNING id`,
    [externalId, `Engram scale fixture ${externalId}`],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Agent upsert returned no row");
  return id;
}

async function ensureSource(pool: pg.Pool, agentId: string, externalId: string): Promise<string> {
  const intent = `${MARKER}:${externalId}`;
  const existing = await pool.query<{ id: string }>(`SELECT id FROM executions WHERE agent_id=$1 AND intent=$2 LIMIT 1`, [agentId, intent]);
  if (existing.rows[0]?.id) return existing.rows[0].id;
  const id = randomUUID();
  await pool.query(
    `INSERT INTO executions (id,agent_id,workflow_type,intent,context,constraints,environment_version,policy_version,status,completed_at)
     VALUES ($1,$2,$3,$4,$5::JSONB,'{}'::JSONB,$6,'scale-fixture-v1','COMPENSATED',now())`,
    [id, agentId, WORKFLOW, intent, JSON.stringify({ fixture: MARKER }), ENV],
  );
  await pool.query(
    `INSERT INTO outcomes (id,execution_id,status,failure_type,summary,result,evidence_state)
     VALUES ($1,$2,'COMPENSATED','FIXTURE','Synthetic scale fixture outcome','{}'::JSONB,'SIMULATED')`,
    [randomUUID(), id],
  );
  return id;
}

async function fixtureCount(pool: pg.Pool, agentId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::STRING AS count FROM memories WHERE agent_id=$1 AND structured_context->>'fixture'=$2`,
    [agentId, MARKER],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function seed(pool: pg.Pool, input: { agentId: string; externalId: string; sourceId: string; target: number; offset: number }) {
  const current = await fixtureCount(pool, input.agentId);
  if (current >= input.target) return { inserted: 0, elapsedMs: 0 };
  const batch = Math.min(Math.max(Number(process.env.ENGRAM_SCALE_INSERT_BATCH ?? "25"), 1), 50);
  const started = performance.now();
  let inserted = 0;

  for (let start = current; start < input.target; start += batch) {
    const count = Math.min(batch, input.target - start);
    const memoryParams: unknown[] = [];
    const memoryValues: string[] = [];
    const sourceParams: unknown[] = [];
    const sourceValues: string[] = [];
    for (let j = 0; j < count; j += 1) {
      const ordinal = start + j;
      const id = fixtureId(input.externalId, ordinal);
      const m = memoryParams.length;
      memoryParams.push(id, input.agentId, `Synthetic scale memory ${input.externalId} #${ordinal}`, JSON.stringify({ fixture: MARKER, workflowType: WORKFLOW, ordinal }), literal(deterministicScaleVector(input.offset + ordinal)), ENV);
      memoryValues.push(`($${m + 1},$${m + 2},'OPERATIONAL',$${m + 3},$${m + 4}::JSONB,0.8,'SIMULATED',$${m + 5}::VECTOR,now(),$${m + 6},'scale-fixture-v1')`);
      const s = sourceParams.length;
      sourceParams.push(id, input.sourceId);
      sourceValues.push(`($${s + 1},$${s + 2})`);
    }
    await pool.query(`INSERT INTO memories (id,agent_id,memory_type,summary,structured_context,confidence,evidence_state,embedding,valid_from,environment_version,policy_version) VALUES ${memoryValues.join(",")} ON CONFLICT (id) DO NOTHING`, memoryParams);
    await pool.query(`INSERT INTO memory_sources (memory_id,execution_id) VALUES ${sourceValues.join(",")} ON CONFLICT DO NOTHING`, sourceParams);
    inserted += count;
    if ((current + inserted) % 1000 === 0 || current + inserted === input.target) {
      console.log(JSON.stringify({ stage: "seed", agent: input.externalId, rows: current + inserted, target: input.target }));
    }
  }
  return { inserted, elapsedMs: Number((performance.now() - started).toFixed(3)) };
}

async function stage1(pool: pg.Pool, query: string, agentId: string, candidateLimit: number): Promise<Row[]> {
  const beamSize = resolveVectorBeamSize();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL vector_search_beam_size = ${beamSize}`);
    const result = await client.query<Row>(
      `SELECT id,(embedding <=> $1::VECTOR)::FLOAT8 AS distance
         FROM memories
        WHERE agent_id=$2
        ORDER BY embedding <=> $1::VECTOR
        LIMIT $3`,
      [query, agentId, candidateLimit],
    );
    await client.query("COMMIT");
    return result.rows.map((row) => ({ id: row.id, distance: Number(row.distance) }));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function stage2(pool: pg.Pool, query: string, agentId: string, candidateIds: string[]): Promise<Row[]> {
  if (!candidateIds.length) return [];
  const result = await pool.query<Row>(
    `SELECT m.id,(m.embedding <=> $1::VECTOR)::FLOAT8 AS distance
       FROM memories m
       LEFT JOIN memory_sources ms ON ms.memory_id=m.id
       LEFT JOIN outcomes o ON o.execution_id=ms.execution_id
      WHERE m.id=ANY($2::UUID[])
        AND m.agent_id=$3
        AND (m.valid_from IS NULL OR m.valid_from<=now())
        AND (m.valid_until IS NULL OR m.valid_until>now())
        AND m.structured_context->>'workflowType'=$4
        AND m.environment_version=$5
        AND o.status=ANY($6::STRING[])
      ORDER BY m.embedding <=> $1::VECTOR
      LIMIT ${RESULT_LIMIT}`,
    [query, candidateIds, agentId, WORKFLOW, ENV, STATUS],
  );
  return result.rows.map((row) => ({ id: row.id, distance: Number(row.distance) }));
}

async function exhaustiveCanonical(pool: pg.Pool, query: string, agentId: string): Promise<Row[]> {
  const result = await pool.query<Row>(
    `SELECT m.id,(m.embedding <=> $1::VECTOR)::FLOAT8 AS distance
       FROM memories m
       LEFT JOIN memory_sources ms ON ms.memory_id=m.id
       LEFT JOIN outcomes o ON o.execution_id=ms.execution_id
      WHERE m.agent_id=$2
        AND (m.valid_from IS NULL OR m.valid_from<=now())
        AND (m.valid_until IS NULL OR m.valid_until>now())
        AND m.structured_context->>'workflowType'=$3
        AND m.environment_version=$4
        AND o.status=ANY($5::STRING[])
      ORDER BY ((m.embedding <=> $1::VECTOR)+0.0)
      LIMIT ${RESULT_LIMIT}`,
    [query, agentId, WORKFLOW, ENV, STATUS],
  );
  return result.rows.map((row) => ({ id: row.id, distance: Number(row.distance) }));
}

async function main() {
  need("DATABASE_URL");
  const sizes = checkpointSizes();
  const iterations = Math.min(Math.max(Number(process.env.ENGRAM_SCALE_QUERY_ITERATIONS ?? "7"), 3), 30);
  const candidateLimit = resolveVectorCandidateLimit(RESULT_LIMIT);
  const pool = createCockroachPool();
  const startedAt = new Date().toISOString();

  try {
    await applyEngramMigrations(pool);
    const provider = createConfiguredEmbeddingProvider();
    if ((await provider.embed("Engram C-SPANN scale verification smoke test")).length !== DIMS) throw new Error("Configured embedding provider is not 1024d");

    const suffix = createHash("sha256").update(`${process.env.GITHUB_SHA ?? "local"}:${MARKER}`).digest("hex").slice(0, 10);
    const externalA = `engram-scale-a-${suffix}`;
    const externalB = `engram-scale-b-${suffix}`;
    const agentA = await ensureAgent(pool, externalA);
    const agentB = await ensureAgent(pool, externalB);
    const sourceA = await ensureSource(pool, agentA, externalA);
    const sourceB = await ensureSource(pool, agentB, externalB);
    const checkpoints: Array<Record<string, unknown>> = [];

    for (const size of sizes) {
      const seedA = await seed(pool, { agentId: agentA, externalId: externalA, sourceId: sourceA, target: size, offset: 0 });
      const seedB = await seed(pool, { agentId: agentB, externalId: externalB, sourceId: sourceB, target: size, offset: 1_000_000 });
      await pool.query("ANALYZE memories");
      await pool.query("ANALYZE memory_sources");
      await pool.query("ANALYZE outcomes");

      const ordinal = Math.max(0, size - 17);
      const target = fixtureId(externalA, ordinal);
      const embedding = deterministicScaleVector(ordinal);
      const query = literal(embedding);
      const candidatePlan = await explainEngramMemorySearch(pool, { agentExternalId: externalA, queryEmbedding: embedding, limit: RESULT_LIMIT });
      const exhaustive = await exhaustiveCanonical(pool, query, agentA);
      const samples: number[] = [];
      let twoStage: Row[] = [];
      let stage1Rows: Row[] = [];

      for (let i = 0; i < iterations; i += 1) {
        const started = performance.now();
        stage1Rows = await stage1(pool, query, agentA, candidateLimit);
        twoStage = await stage2(pool, query, agentA, stage1Rows.map((row) => row.id));
        samples.push(Number((performance.now() - started).toFixed(3)));
      }

      const foreign = twoStage.length
        ? await pool.query<{ count: string }>(`SELECT count(*)::STRING AS count FROM memories WHERE id=ANY($1::UUID[]) AND agent_id<>$2`, [twoStage.map((row) => row.id), agentA])
        : { rows: [{ count: "0" }] };
      const crossAgent = Number(foreign.rows[0]?.count ?? 0);
      const recall = recallAt8(exhaustive, twoStage);

      checkpoints.push({
        sizePerAgent: size,
        totalFixtureMemories: size * 2,
        candidateLimit,
        beamSize: resolveVectorBeamSize(),
        seed: { agentA: seedA, agentB: seedB },
        plans: { stage1CandidateGeneration: candidatePlan },
        correctness: {
          canonicalFilteredRecallAt8VsExhaustive: recall,
          targetTwoStageRank: twoStage.findIndex((row) => row.id === target) + 1,
          targetExhaustiveRank: exhaustive.findIndex((row) => row.id === target) + 1,
          stage1CandidateCount: stage1Rows.length,
          twoStageResultCount: twoStage.length,
          crossAgentResults: crossAgent,
          agentIsolationPassed: crossAgent === 0,
        },
        latencyMs: {
          twoStage: {
            p50: percentile(samples, 0.5),
            p95: percentile(samples, 0.95),
            samples,
          },
        },
      });
    }

    const final = checkpoints.at(-1) as any;
    const cspann = Boolean(final?.plans?.stage1CandidateGeneration?.usesVectorSearch && final?.plans?.stage1CandidateGeneration?.usesCosineIndex);
    const recall = Number(final?.correctness?.canonicalFilteredRecallAt8VsExhaustive ?? 0);
    const isolated = Boolean(final?.correctness?.agentIsolationPassed);
    const diagnosis = !cspann
      ? "STAGE1_CSPANN_UNVERIFIED"
      : !isolated
        ? "AGENT_ISOLATION_FAILURE"
        : recall < 1
          ? "TWO_STAGE_RECALL_GAP"
          : "TWO_STAGE_CSPANN_VERIFIED";

    const evidence = {
      schemaVersion: "engram-cspann-scale-proof-v2",
      evidenceClass: "TESTED",
      verificationKind: "LIVE_TWO_STAGE_SCALE_AND_QUERY_PLAN",
      startedAt,
      completedAt: new Date().toISOString(),
      commitSha: process.env.GITHUB_SHA ?? null,
      embeddingProviderSmoke: { provider: provider.provider, modelId: provider.modelId, dimensions: provider.dimensions, evidenceState: "VERIFIED" },
      benchmarkBoundary: {
        fixtureExecutionEvidence: "SIMULATED",
        fixtureVectors: "DETERMINISTIC_SYNTHETIC_1024D",
        cockroachPersistence: "REAL",
        stage1CspannQuery: "REAL",
        stage2CanonicalFiltering: "REAL",
        exhaustiveCanonicalBaseline: "REAL",
      },
      diagnosis,
      cspannCandidateGeneration: cspann ? "VERIFIED" : "UNVERIFIED",
      canonicalFilteredRecallAt8: recall,
      agentIsolationAtScale: isolated ? "VERIFIED" : "FAILED",
      checkpoints,
    };

    await mkdir("evidence/live", { recursive: true });
    await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ok: true, output: OUTPUT, diagnosis, cspannCandidateGeneration: evidence.cspannCandidateGeneration, canonicalFilteredRecallAt8: recall, agentIsolationAtScale: evidence.agentIsolationAtScale }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
