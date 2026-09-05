import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { adaptExecutionEpisode } from "../../packages/adapters/src/contract.js";
import {
  EngramOpenAIAgentsTraceCollector,
  openAIAgentsAdapter,
} from "../../packages/adapters/openai-agents/src/index.js";

describe("OpenAI Agents adapter", () => {
  it("maps public run items and trace data into observations without inventing decisions", async () => {
    const executionId = randomUUID();
    const episode = await adaptExecutionEpisode(openAIAgentsAdapter, {
      executionId,
      agentId: "research-agent",
      workflowType: "research",
      intent: "Investigate a claim",
      context: { topic: "example" },
      constraints: {},
      startedAt: new Date("2026-08-16T00:00:00Z"),
      completedAt: new Date("2026-08-16T00:00:10Z"),
      result: {
        finalOutput: "done",
        newItems: [
          { type: "tool_call", name: "search", arguments: { q: "example" } },
          { type: "tool_output", output: "result" },
        ],
        lastAgent: { name: "Researcher" },
      },
      trace: {
        traceId: "trace_123",
        name: "Agent workflow",
        spans: [{ traceId: "trace_123", spanId: "span_1", data: { type: "function" } }],
      },
      outcome: {
        status: "SUCCESS",
        summary: "The application marked the research execution complete.",
      },
    });

    expect(episode.id).toBe(executionId);
    expect(episode.decisions).toEqual([]);
    expect(episode.observations.map((observation) => observation.type)).toEqual(expect.arrayContaining([
      "OPENAI_AGENTS_TOOL_CALL",
      "OPENAI_AGENTS_TOOL_OUTPUT",
      "OPENAI_AGENTS_TRACE",
    ]));
    expect(episode.outcome?.status).toBe("SUCCESS");
  });

  it("does not infer an outcome merely because finalOutput exists", async () => {
    const episode = await adaptExecutionEpisode(openAIAgentsAdapter, {
      executionId: randomUUID(),
      agentId: "agent",
      workflowType: "task",
      intent: "Do work",
      startedAt: new Date(),
      result: { finalOutput: "looks successful", newItems: [] },
    });

    expect(episode.outcome).toBeUndefined();
  });

  it("collects public trace/span lifecycle data through a tracing-processor-compatible surface", async () => {
    const collector = new EngramOpenAIAgentsTraceCollector();
    await collector.onTraceStart({ traceId: "trace_abc", name: "Agent workflow", metadata: { executionId: "e1" } });
    await collector.onSpanEnd({
      traceId: "trace_abc",
      spanId: "span_abc",
      parentId: null,
      spanData: { type: "function", name: "lookup" },
    });
    await collector.onTraceEnd({ traceId: "trace_abc", name: "Agent workflow" });

    const snapshot = collector.snapshot("trace_abc");
    expect(snapshot?.spans).toHaveLength(1);
    expect(snapshot?.spans[0]?.spanId).toBe("span_abc");
    expect(collector.drain("trace_abc")?.traceId).toBe("trace_abc");
    expect(collector.snapshot("trace_abc")).toBeNull();
  });
});
