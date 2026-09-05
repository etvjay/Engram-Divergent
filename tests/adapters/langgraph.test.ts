import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { adaptExecutionEpisode } from "../../packages/adapters/src/contract.js";
import {
  collectLangGraphStateHistory,
  langGraphAdapter,
} from "../../packages/adapters/langgraph/src/index.js";

describe("LangGraph adapter", () => {
  it("maps checkpoint history to execution observations without calling checkpoints Engram memory", async () => {
    const executionId = randomUUID();
    const episode = await adaptExecutionEpisode(langGraphAdapter, {
      executionId,
      threadId: "thread-42",
      agentId: "workflow-agent",
      workflowType: "incident-response",
      intent: "Recover the service",
      startedAt: new Date("2026-08-16T00:00:00Z"),
      completedAt: new Date("2026-08-16T00:00:30Z"),
      checkpoints: [
        {
          values: { status: "investigating" },
          next: ["diagnose"],
          config: { configurable: { thread_id: "thread-42", checkpoint_id: "cp-1" } },
          metadata: { step: 1, source: "loop" },
        },
        {
          values: { status: "recovered" },
          next: [],
          config: { configurable: { thread_id: "thread-42", checkpoint_id: "cp-2" } },
          metadata: { step: 2, source: "loop" },
        },
      ],
      finalState: { status: "recovered" },
      outcome: {
        status: "SUCCESS",
        summary: "The application confirmed recovery.",
      },
    });

    expect(episode.decisions).toEqual([]);
    expect(episode.observations.filter((item) => item.type === "LANGGRAPH_CHECKPOINT")).toHaveLength(2);
    expect(episode.observations.some((item) => item.type.includes("MEMORY"))).toBe(false);
    expect(episode.outcome?.status).toBe("SUCCESS");
  });

  it("collects the public async state-history surface", async () => {
    const graph = {
      async *getStateHistory() {
        yield { values: { step: 2 }, metadata: { step: 2 } };
        yield { values: { step: 1 }, metadata: { step: 1 } };
      },
    };

    const history = await collectLangGraphStateHistory(graph, {
      configurable: { thread_id: "thread-1" },
    });

    expect(history.map((snapshot) => snapshot.metadata?.step)).toEqual([2, 1]);
  });

  it("does not infer workflow success from an empty next-node set", async () => {
    const episode = await adaptExecutionEpisode(langGraphAdapter, {
      executionId: randomUUID(),
      threadId: "thread-unknown",
      agentId: "agent",
      workflowType: "workflow",
      intent: "Run workflow",
      startedAt: new Date(),
      checkpoints: [{ values: {}, next: [] }],
    });

    expect(episode.outcome).toBeUndefined();
  });
});
