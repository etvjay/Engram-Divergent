import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type {
  Decision,
  ExecutionContext,
  ExecutionEvent,
  MemoryRepository,
  MemorySearchInput,
  MemorySearchResult,
  OperationalMemory,
  Outcome,
} from "../../packages/memory-core/src/domain.js";
import { runEngramDemo } from "../../services/demo/src/run-demo.js";

class InMemoryRepository implements MemoryRepository {
  memories: OperationalMemory[] = [];
  decisions: Decision[] = [];
  outcomes: Outcome[] = [];
  events: ExecutionEvent[] = [];
  retrievals: MemorySearchResult[] = [];

  async startExecution(_input: ExecutionContext) {
    return { executionId: randomUUID() };
  }

  async appendEvent(event: ExecutionEvent) {
    this.events.push(event);
  }

  async recordOutcome(outcome: Outcome) {
    this.outcomes.push(outcome);
  }

  async persistMemory(memory: OperationalMemory, _sourceExecutionIds: string[]) {
    this.memories.push(memory);
  }

  async searchMemory(_input: MemorySearchInput): Promise<MemorySearchResult> {
    const candidates = this.memories.map((memory, index) => ({
      memoryId: memory.id,
      memory,
      semanticScore: 0.95,
      contextScore: 1,
      outcomeScore: 1,
      confidenceScore: memory.confidence,
      recencyScore: 1,
      finalScore: 0.95,
      rank: index + 1,
    }));
    const result = { retrievalId: randomUUID(), candidates };
    this.retrievals.push(result);
    return result;
  }

  async recordDecision(decision: Decision, _retrievalId?: string) {
    this.decisions.push(decision);
  }

  async getTrace(_executionId: string) {
    return {};
  }
}

describe("Engram demo orchestration", () => {
  it("turns Run A failure into a memory that changes Run B", async () => {
    const repo = new InMemoryRepository();
    const result = await runEngramDemo(repo);

    expect(result.runA.route).toEqual(["A", "B", "C"]);
    expect(result.runA.outcome).toBe("COMPENSATED");
    expect(result.runB.route).toEqual(["A", "B", "D"]);
    expect(result.runB.counterfactualRoute).toEqual(["A", "B", "C"]);
    expect(result.runB.outcome).toBe("SUCCESS");
    expect(result.changedBehavior).toBe(true);

    expect(repo.memories).toHaveLength(1);
    expect(result.runB.memoryRefs).toEqual([repo.memories[0]!.id]);
    expect(repo.retrievals).toHaveLength(1);

    const runBDecision = repo.decisions.at(-1)!;
    expect(runBDecision.memoryInfluences).toHaveLength(1);
    expect(runBDecision.memoryInfluences[0]!.influenceType).toBe("CHANGED_ACTION");
    expect(runBDecision.memoryInfluences[0]!.counterfactualAction).toEqual({ route: ["A", "B", "C"] });

    expect(result.evidenceBoundary).toEqual({
      externalExecution: "SIMULATED",
      persistence: "REAL",
      retrieval: "REAL",
      decisionTrace: "REAL",
    });
  });
});
