import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type pg from "pg";
import { createCockroachPool } from "../../packages/cockroach/src/client.js";
import { CockroachMemoryRepository } from "../../packages/cockroach/src/repository.js";
import { admitOperationalMemory } from "../../packages/memory-core/src/admission.js";
import { decideRoute, ROUTE_C, ROUTE_D } from "../../packages/memory-core/src/policy.js";
import { executeRoute } from "../../packages/execution-simulator/src/index.js";
import type { EmbeddingProvider, Outcome } from "../../packages/memory-core/src/domain.js";

const live = Boolean(process.env.DATABASE_URL);
const suite = live ? describe : describe.skip;

class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1024;
  async embed(text: string): Promise<number[]> {
    const safeText = text || "engram";
    const vector = Array.from({ length: 1024 }, (_, index) => ((safeText.charCodeAt(index % safeText.length) || 1) % 97) / 97);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    return vector.map((value) => value / norm);
  }
}

suite("Engram CockroachDB persisted memory loop", () => {
  let pool: pg.Pool;
  let repo: CockroachMemoryRepository;
  const agentId = `agent-e2e-${randomUUID()}`;
  const context = { liquidity: { A: 100, B: 100, C: 20, D: 100 }, requiredLiquidity: 50 };

  beforeAll(async () => {
    pool = createCockroachPool();
    repo = new CockroachMemoryRepository(pool, new DeterministicEmbeddingProvider());
    const migration = await readFile(new URL("../../db/migrations/001_initial.sql", import.meta.url), "utf8");
    await pool.query(migration);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("persists Run A memory and uses it to change Run B", async () => {
    const runA = await repo.startExecution({
      agentId,
      workflowType: "multi_venue_execution",
      intent: "Acquire target asset using the lowest-risk route",
      context: { market: "demo", liquidityRegime: "thin" },
      constraints: { riskTolerance: "LOW" },
      environmentVersion: "demo-v1",
      policyVersion: "route-policy-v1",
    });

    const baseline = decideRoute({ memories: [], memoryAvailable: true });
    expect(baseline.route).toEqual(ROUTE_C);
    const resultA = executeRoute(baseline.route, context);
    expect(resultA.status).toBe("COMPENSATED");

    const outcomeA: Outcome = {
      id: randomUUID(),
      executionId: runA.executionId,
      status: "COMPENSATED",
      failureType: "LIQUIDITY_UNAVAILABLE",
      summary: "Venue C could not complete the route; prior exposure was unwound.",
      result: { failedVenue: resultA.failedVenue, recovery: resultA.recovery },
      evidenceState: "SIMULATED",
    };
    await repo.recordOutcome(outcomeA);

    const memory = admitOperationalMemory({
      agentId,
      executionId: runA.executionId,
      workflowType: "multi_venue_execution",
      environmentVersion: "demo-v1",
      policyVersion: "route-policy-v1",
      outcome: outcomeA,
      observation: {
        failedResource: resultA.failedVenue,
        failureType: outcomeA.failureType,
        recoveryStrategy: resultA.recovery?.strategy,
        recoverySucceeded: resultA.recovery?.capitalRecovered ?? false,
      },
    });
    expect(memory).not.toBeNull();
    await repo.persistMemory(memory!, [runA.executionId]);

    const runB = await repo.startExecution({
      agentId,
      workflowType: "multi_venue_execution",
      intent: "Acquire target asset using the lowest-risk route",
      context: { market: "demo", liquidityRegime: "thin" },
      constraints: { riskTolerance: "LOW" },
      environmentVersion: "demo-v1",
      policyVersion: "route-policy-v1",
    });

    const retrieval = await repo.searchMemory({
      agentId,
      executionId: runB.executionId,
      query: "multi venue acquisition under thin liquidity where a venue could fail",
      workflowType: "multi_venue_execution",
      environmentVersion: "demo-v1",
      status: ["COMPENSATED", "FAILURE", "PARTIAL"],
    });
    expect(retrieval.candidates[0]?.memory.id).toBe(memory!.id);

    const treatment = decideRoute({
      memoryAvailable: true,
      memories: retrieval.candidates.map((candidate) => ({
        memory: candidate.memory,
        semanticScore: candidate.semanticScore,
        contextScore: candidate.contextScore,
        outcomeScore: candidate.outcomeScore,
        recencyScore: candidate.recencyScore,
      })),
    });
    expect(treatment.route).toEqual(ROUTE_D);
    expect(treatment.counterfactualRoute).toEqual(ROUTE_C);
    expect(treatment.memoryRefs).toEqual([memory!.id]);

    await repo.recordDecision({
      id: randomUUID(),
      executionId: runB.executionId,
      decisionType: "ROUTE_SELECTION",
      selectedAction: { route: treatment.route },
      alternatives: [{ route: ROUTE_C }],
      reasoningSummary: treatment.reason,
      memoryRefs: treatment.memoryRefs,
      memoryInfluences: [{
        memoryId: memory!.id,
        influenceType: "CHANGED_ACTION",
        influenceSummary: "Prior compensated Venue C liquidity failure caused Route D to replace the baseline Route C.",
        relevance: retrieval.candidates[0]!.finalScore,
        counterfactualAction: { route: ROUTE_C },
      }],
    }, retrieval.retrievalId);

    const resultB = executeRoute(treatment.route, context);
    expect(resultB.status).toBe("SUCCESS");
    await repo.recordOutcome({
      id: randomUUID(),
      executionId: runB.executionId,
      status: "SUCCESS",
      summary: "Route D completed successfully after prior memory changed the route selection.",
      result: { route: resultB.route },
      evidenceState: "SIMULATED",
    });

    const trace = await repo.getTrace(runB.executionId) as { decisions: Array<{ memory_influences: unknown[] }>; retrievals: unknown[] };
    expect(trace.retrievals).toHaveLength(1);
    expect(trace.decisions).toHaveLength(1);
    expect(trace.decisions[0]?.memory_influences).toHaveLength(1);
  });
});
