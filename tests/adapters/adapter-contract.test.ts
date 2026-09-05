import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { adaptExecutionEpisode } from "../../packages/adapters/src/contract.js";
import { createCustomAdapter } from "../../packages/adapters/custom/src/index.js";

const source = {
  runId: randomUUID(),
  agent: "custom-agent",
  task: "deploy api",
  startedAt: new Date(),
};

describe("Engram adapter contract", () => {
  it("normalizes framework-native execution into a validated ExecutionEpisode", async () => {
    const adapter = createCustomAdapter<typeof source>({
      name: "example-runtime",
      version: "1.0.0",
      canAdapt: (input): input is typeof source => Boolean(
        input && typeof input === "object" && "runId" in input,
      ),
      map: (run) => ({
        schemaVersion: "engram.execution-episode/v1",
        protocolVersion: "engram.protocol/v1",
        id: run.runId,
        agent: { id: run.agent },
        workflowType: "deployment",
        intent: run.task,
        context: { service: "api" },
        constraints: {},
        environment: {},
        startedAt: run.startedAt,
        decisions: [],
        observations: [],
        provenance: [],
      }),
    });

    const episode = await adaptExecutionEpisode(adapter, source);
    expect(episode.id).toBe(source.runId);
    expect(episode.agent.id).toBe("custom-agent");
  });

  it("rejects adapter output that violates Engram semantics", async () => {
    const adapter = createCustomAdapter<Record<string, unknown>>({
      name: "invalid-runtime",
      version: "1.0.0",
      map: () => ({ id: "not-an-episode" } as never),
    });

    await expect(adaptExecutionEpisode(adapter, {})).rejects.toThrow();
  });
});
