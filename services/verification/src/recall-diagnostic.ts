import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createCockroachPool } from "../../../packages/cockroach/src/client.js";

const OUTPUT = "evidence/live/cspann-recall-diagnostic-latest.json";
const DIMS = 1024;
const RESULT_LIMIT = 8;
const CANDIDATE_LIMIT = 400;
const WORKFLOW = "multi_venue_execution";
const ENV = "scale-v1";
const STATUS = ["COMPENSATED", "FAILURE", "PARTIAL"];
const BEAMS = [32, 64, 128, 256];

type Row = { id: string; distance: number };

function need(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function literal(vector: number[]): string {
  if (vector.length !== DIMS || vector.some((value) => !Number.isFinite(value))) throw new Error("Invalid diagnostic vector");
  return `[${vector.join(",")}]`;
}

function deterministicScaleVector(seed: number): number[] {
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

function ids(rows: Row[]): string[] {
  return rows.map((row) => row.id);
}

function recall(expected: Row[], actual: Row[]): number {
  const wanted = new Set(ids(expected.slice(0, RESULT_LIMIT)));
  const hits = actual.slice(0, RESULT_LIMIT).filter((row) => wanted.has(row.id)).length;
  return Number((hits / Math.max(1, wanted.size)).toFixed(4));
}

async function main() {
  need("DATABASE_URL");
  const pool = createCockroachPool();
  const client = await pool.connect();
  const startedAt = new Date().toISOString();

  try {
    const agentResult = await client.query<{ id: string; external_id: string; memory_count: string; max_ordinal: string }>(
      `SELECT a.id, a.external_id, count(m.id)::STRING AS memory_count,
              max((m.structured_context->>'ordinal')::INT)::STRING AS max_ordinal
         FROM agents a
         JOIN memories m ON m.agent_id=a.id
        WHERE a.external_id LIKE 'engram-scale-a-%'
          AND m.structured_context->>'fixture'='engram-cspann-scale-v1'
        GROUP BY a.id, a.external_id
        ORDER BY count(m.id) DESC, a.external_id DESC
        LIMIT 1`,
    );
    const agent = agentResult.rows[0];
    if (!agent) throw new Error("No Engram scale Agent A fixture exists; run npm run verify:scale first");

    const maxOrdinal = Number(agent.max_ordinal);
    if (!Number.isInteger(maxOrdinal) || maxOrdinal < 0) throw new Error(`Invalid scale max ordinal ${agent.max_ordinal}`);
    const queryOrdinal = Math.max(0, maxOrdinal - 16);
    const query = literal(deterministicScaleVector(queryOrdinal));

    const exhaustiveResult = await client.query<Row>(
      `SELECT m.id,(m.embedding <=> $1::VECTOR)::FLOAT8 AS distance
         FROM memories m
        WHERE m.agent_id=$2
          AND (m.valid_from IS NULL OR m.valid_from<=now())
          AND (m.valid_until IS NULL OR m.valid_until>now())
          AND m.structured_context->>'workflowType'=$3
          AND m.environment_version=$4
          AND EXISTS (
            SELECT 1
              FROM memory_sources ms
              JOIN outcomes o ON o.execution_id=ms.execution_id
             WHERE ms.memory_id=m.id
               AND o.status=ANY($5::STRING[])
          )
        ORDER BY ((m.embedding <=> $1::VECTOR)+0.0), m.id
        LIMIT ${RESULT_LIMIT}`,
      [query, agent.id, WORKFLOW, ENV, STATUS],
    );
    const exhaustive = exhaustiveResult.rows.map((row) => ({ id: row.id, distance: Number(row.distance) }));
    if (exhaustive.length !== RESULT_LIMIT) throw new Error(`Expected ${RESULT_LIMIT} exhaustive canonical rows, received ${exhaustive.length}`);

    const sourceFanoutResult = await client.query<{ id: string; source_rows: string; qualifying_source_rows: string }>(
      `SELECT m.id,
              count(ms.execution_id)::STRING AS source_rows,
              count(ms.execution_id) FILTER (WHERE o.status=ANY($2::STRING[]))::STRING AS qualifying_source_rows
         FROM memories m
         LEFT JOIN memory_sources ms ON ms.memory_id=m.id
         LEFT JOIN outcomes o ON o.execution_id=ms.execution_id
        WHERE m.id=ANY($1::UUID[])
        GROUP BY m.id
        ORDER BY m.id`,
      [ids(exhaustive), STATUS],
    );

    const sweeps: Array<Record<string, unknown>> = [];
    for (const beam of BEAMS) {
      await client.query(`SET vector_search_beam_size = ${beam}`);
      const started = performance.now();
      const candidateResult = await client.query<Row>(
        `SELECT id,(embedding <=> $1::VECTOR)::FLOAT8 AS distance
           FROM memories
          WHERE agent_id=$2
          ORDER BY embedding <=> $1::VECTOR
          LIMIT $3`,
        [query, agent.id, CANDIDATE_LIMIT],
      );
      const candidates = candidateResult.rows.map((row) => ({ id: row.id, distance: Number(row.distance) }));
      const candidateIds = ids(candidates);

      const stage2Result = await client.query<Row>(
        `SELECT m.id,(m.embedding <=> $1::VECTOR)::FLOAT8 AS distance
           FROM memories m
          WHERE m.id=ANY($2::UUID[])
            AND m.agent_id=$3
            AND (m.valid_from IS NULL OR m.valid_from<=now())
            AND (m.valid_until IS NULL OR m.valid_until>now())
            AND m.structured_context->>'workflowType'=$4
            AND m.environment_version=$5
            AND EXISTS (
              SELECT 1
                FROM memory_sources ms
                JOIN outcomes o ON o.execution_id=ms.execution_id
               WHERE ms.memory_id=m.id
                 AND o.status=ANY($6::STRING[])
            )
          ORDER BY m.embedding <=> $1::VECTOR, m.id
          LIMIT ${RESULT_LIMIT}`,
        [query, candidateIds, agent.id, WORKFLOW, ENV, STATUS],
      );
      const stage2 = stage2Result.rows.map((row) => ({ id: row.id, distance: Number(row.distance) }));
      const exhaustiveIds = ids(exhaustive);
      const missingFromCandidates = exhaustiveIds.filter((id) => !candidateIds.includes(id));
      const missingAfterStage2 = exhaustiveIds.filter((id) => !ids(stage2).includes(id));

      sweeps.push({
        beam,
        candidateLimit: CANDIDATE_LIMIT,
        elapsedMs: Number((performance.now() - started).toFixed(3)),
        candidateCount: candidates.length,
        stage2ResultCount: stage2.length,
        recallAt8: recall(exhaustive, stage2),
        missingFromStage1Candidates: missingFromCandidates,
        missingAfterStage2,
        exactTop8PresentInStage1: exhaustiveIds.map((id) => ({ id, present: candidateIds.includes(id), candidateRank: candidateIds.indexOf(id) + 1 })),
      });
    }

    await client.query("RESET vector_search_beam_size");

    const fanout = sourceFanoutResult.rows.map((row) => ({
      id: row.id,
      sourceRows: Number(row.source_rows),
      qualifyingSourceRows: Number(row.qualifying_source_rows),
    }));
    const fanoutContaminationPossible = fanout.some((row) => row.qualifyingSourceRows > 1);
    const first = sweeps[0] as any;
    const last = sweeps.at(-1) as any;
    const diagnosis = fanoutContaminationPossible
      ? "MULTI_SOURCE_FANOUT_PRESENT"
      : Number(last?.recallAt8 ?? 0) === 1
        ? "ANN_RECALL_RECOVERED_BY_BEAM"
        : Array.isArray(last?.missingFromStage1Candidates) && last.missingFromStage1Candidates.length > 0
          ? "ANN_MISS_PERSISTS_AT_MAX_BEAM"
          : Array.isArray(last?.missingAfterStage2) && last.missingAfterStage2.length > 0
            ? "STAGE2_SEMANTIC_MISMATCH"
            : Number(first?.recallAt8 ?? 0) === 1
              ? "NO_RECALL_GAP_REPRODUCED"
              : "UNCLASSIFIED_RECALL_GAP";

    const evidence = {
      schemaVersion: "engram-cspann-recall-diagnostic-v1",
      evidenceClass: "TESTED",
      startedAt,
      completedAt: new Date().toISOString(),
      agent: { ...agent, max_ordinal: maxOrdinal },
      queryOrdinal,
      exhaustiveCanonicalTop8: exhaustive,
      sourceFanout: fanout,
      fanoutContaminationPossible,
      sweeps,
      diagnosis,
      note: "Diagnostic only. Canonical membership uses EXISTS so source fanout cannot duplicate a memory before LIMIT. Do not change production retrieval or C-SPANN tuning until this artifact identifies the recall-loss stage.",
    };

    await mkdir("evidence/live", { recursive: true });
    await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ok: true, output: OUTPUT, diagnosis, fanoutContaminationPossible, sweeps: sweeps.map((s: any) => ({ beam: s.beam, recallAt8: s.recallAt8, missingFromStage1Candidates: s.missingFromStage1Candidates.length })) }));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
