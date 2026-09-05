import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { EmbeddingProvider } from "../../packages/memory-core/src/domain.js";
import { createCockroachPool } from "../../packages/cockroach/src/client.js";
import { applyEngramMigrations } from "../../packages/cockroach/src/migrations.js";
import { CockroachMemoryRepository } from "../../packages/cockroach/src/repository.js";

const live = Boolean(process.env.DATABASE_URL);
const suite = live ? describe : describe.skip;

class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1024;
  async embed(): Promise<number[]> {
    return Array.from({ length: this.dimensions }, (_, index) => index === 0 ? 1 : 0);
  }
}

suite("Cockroach idempotency", () => {
  let pool: pg.Pool;
  let repository: CockroachMemoryRepository;

  beforeAll(async () => {
    pool = createCockroachPool();
    await applyEngramMigrations(pool);
    repository = new CockroachMemoryRepository(pool, new DeterministicEmbeddingProvider());
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("accepts an exact event replay but rejects the same sequence with different semantics", async () => {
    const started = await repository.startExecution({
      agentId: `idempotency-agent-${randomUUID()}`,
      workflowType: "idempotency-proof",
      intent: "record one event exactly once",
      context: {},
      constraints: {},
    });
    const occurredAt = new Date();
    const event = {
      id: randomUUID(),
      executionId: started.executionId,
      sequenceNo: 0,
      eventType: "TOOL_RESULT",
      payload: { result: "alpha" },
      evidenceState: "OBSERVED" as const,
      occurredAt,
    };

    await repository.appendEvent(event);
    await expect(repository.appendEvent(event)).resolves.toBeUndefined();

    await expect(repository.appendEvent({
      ...event,
      id: randomUUID(),
      payload: { result: "different" },
    })).rejects.toThrow(`EVENT_IDEMPOTENCY_CONFLICT:${started.executionId}:0`);
  });

  it("accepts an exact outcome replay but rejects a semantic rewrite", async () => {
    const started = await repository.startExecution({
      agentId: `outcome-idempotency-agent-${randomUUID()}`,
      workflowType: "idempotency-proof",
      intent: "record one outcome exactly once",
      context: {},
      constraints: {},
    });
    const outcome = {
      id: randomUUID(),
      executionId: started.executionId,
      status: "FAILURE" as const,
      failureType: "DEPENDENCY_UNAVAILABLE",
      summary: "Dependency alpha failed",
      result: { dependency: "alpha" },
      evidenceState: "OBSERVED" as const,
    };

    await repository.recordOutcome(outcome);
    await expect(repository.recordOutcome(outcome)).resolves.toBeUndefined();

    await expect(repository.recordOutcome({
      ...outcome,
      id: randomUUID(),
      status: "SUCCESS",
      failureType: undefined,
      summary: "Rewritten to success",
      result: { dependency: "alpha", rewritten: true },
    })).rejects.toThrow(`OUTCOME_IDEMPOTENCY_CONFLICT:${started.executionId}`);
  });
});
