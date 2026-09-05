import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { EmbeddingProvider, OperationalMemory } from "../../packages/memory-core/src/domain.js";
import { createCockroachPool } from "../../packages/cockroach/src/client.js";
import { applyEngramMigrations } from "../../packages/cockroach/src/migrations.js";
import { CockroachMemoryRepository } from "../../packages/cockroach/src/repository.js";

const live = Boolean(process.env.DATABASE_URL);
const suite = live ? describe : describe.skip;

class FixedEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1024;
  async embed(): Promise<number[]> {
    return Array.from({ length: this.dimensions }, (_, index) => index === 0 ? 1 : 0);
  }
}

suite("Cockroach agent memory isolation", () => {
  let pool: pg.Pool;
  let repository: CockroachMemoryRepository;

  beforeAll(async () => {
    pool = createCockroachPool();
    await applyEngramMigrations(pool);
    repository = new CockroachMemoryRepository(pool, new FixedEmbeddingProvider());
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("does not expose another agent's semantically identical memory", async () => {
    const agentA = `agent-a-${randomUUID()}`;
    const agentB = `agent-b-${randomUUID()}`;

    const sourceA = await repository.startExecution({
      agentId: agentA,
      workflowType: "deployment",
      intent: "Deploy service",
      context: {},
      constraints: {},
    });
    await repository.recordOutcome({
      id: randomUUID(),
      executionId: sourceA.executionId,
      status: "FAILURE",
      failureType: "DEPENDENCY_UNAVAILABLE",
      summary: "Dependency alpha failed",
      result: {},
      evidenceState: "OBSERVED",
    });

    const memoryA: OperationalMemory = {
      id: randomUUID(),
      agentId: agentA,
      memoryType: "UNEXPECTED_FAILURE",
      summary: "Dependency alpha can fail during deployment",
      structuredContext: { workflowType: "deployment" },
      confidence: 0.95,
      evidenceState: "OBSERVED",
      validFrom: new Date(),
    };
    await repository.persistMemory(memoryA, [sourceA.executionId]);

    await repository.startExecution({
      agentId: agentB,
      workflowType: "deployment",
      intent: "Deploy service",
      context: {},
      constraints: {},
    });

    const forA = await repository.searchMemory({
      agentId: agentA,
      query: "dependency alpha deployment failure",
      workflowType: "deployment",
      limit: 8,
    });
    const forB = await repository.searchMemory({
      agentId: agentB,
      query: "dependency alpha deployment failure",
      workflowType: "deployment",
      limit: 8,
    });

    expect(forA.candidates.some((candidate) => candidate.memory.id === memoryA.id)).toBe(true);
    expect(forB.candidates.some((candidate) => candidate.memory.id === memoryA.id)).toBe(false);
  });
});
