import type pg from "pg";
import { CockroachMemoryRepository } from "./repository.js";
import { CockroachRuntimeStore } from "./runtime-store.js";

/**
 * Production/serverless runtime store. Event sequence numbers are allocated by
 * CockroachDB so concurrent Lambda invocations cannot derive the same sequence
 * from an application-side trace snapshot.
 */
export class AtomicCockroachRuntimeStore extends CockroachRuntimeStore {
  constructor(
    private readonly atomicPool: pg.Pool,
    memory: CockroachMemoryRepository,
  ) {
    super(atomicPool, memory);
  }

  async nextEventSequence(executionId: string): Promise<number> {
    const result = await this.atomicPool.query<{ sequence_no: string | number }>(
      `UPDATE executions
          SET next_event_sequence = next_event_sequence + 1
        WHERE id = $1
        RETURNING next_event_sequence - 1 AS sequence_no`,
      [executionId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Execution ${executionId} does not exist`);
    return Number(row.sequence_no);
  }
}
