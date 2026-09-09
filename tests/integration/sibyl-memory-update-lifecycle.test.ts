import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { ExecutionMemorySchema } from "../../packages/memory-core/src/execution-memory.js";
import { BehavioralMemoryEvaluationSchema } from "../../packages/evaluation/src/memory-evaluation.js";
import { applyMemoryUpdate } from "../../packages/evaluation/src/memory-lifecycle.js";
import { SibylBehavioralMemoryStore } from "../../packages/sibyl/src/behavioral-store.js";

const describeSibyl = process.env.ENGRAM_SIBYL_TEST_REQUIRED === "1" ? describe : describe.skip;
let dir = "";
let previousDb: string | undefined;
let previousTenant: string | undefined;

const prior = ExecutionMemorySchema.parse({
  id: "10000000-0000-4000-8000-000000000001",
  agentId: "agent-a",
  memoryType: "TOOL_RECOVERY",
  summary: "Use Tool B after Tool A rate limits.",
  sourceCandidateMemoryId: "10000000-0000-4000-8000-000000000002",
  sourceExperienceIds: ["10000000-0000-4000-8000-000000000003"],
  sourceEpisodeIds: ["10000000-0000-4000-8000-000000000004"],
  applicability: { tool: "tool-a", context: "high-load" },
  confidence: 0.7,
  evidenceState: "OBSERVED",
  state: "ADMITTED",
  admittedAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
});
const evaluation = BehavioralMemoryEvaluationSchema.parse({
  id: "10000000-0000-4000-8000-000000000005",
  executionMemoryId: prior.id,
  memorySliceId: "10000000-0000-4000-8000-000000000006",
  influenceGrantId: "10000000-0000-4000-8000-000000000007",
  influencedExecutionId: "10000000-0000-4000-8000-000000000008",
  influencedDecisionId: "10000000-0000-4000-8000-000000000009",
  effect: "BENEFICIAL",
  effectScore: 0.8,
  actionChanged: true,
  treatmentAction: { tool: "tool-b" },
  treatmentOutcome: "SUCCESS",
  updateDirective: "STRENGTHEN",
  rationale: "Bounded fallback avoided the rate limit.",
  evidenceState: "OBSERVED",
  evaluatedAt: "2026-09-09T01:00:00.000Z",
});

describeSibyl("Sibyl versioned memory evaluation lifecycle", () => {
  beforeEach(async () => {
    dir = await mkdtemp(join("/tmp", "engram-memory-update-"));
    previousDb = process.env.ENGRAM_SIBYL_DB;
    previousTenant = process.env.ENGRAM_SIBYL_TENANT;
    process.env.ENGRAM_SIBYL_DB = join(dir, "memory.db");
    process.env.ENGRAM_SIBYL_TENANT = "engram-memory-update-test";
  });
  afterEach(async () => {
    if (previousDb === undefined) delete process.env.ENGRAM_SIBYL_DB; else process.env.ENGRAM_SIBYL_DB = previousDb;
    if (previousTenant === undefined) delete process.env.ENGRAM_SIBYL_TENANT; else process.env.ENGRAM_SIBYL_TENANT = previousTenant;
    await rm(dir, { recursive: true, force: true });
  });

  it("persists immutable prior, evaluated outcome, update record, and new version across a fresh store", async () => {
    const result = applyMemoryUpdate({ prior, evaluation, newMemoryId: "10000000-0000-4000-8000-000000000010", updateRecordId: "10000000-0000-4000-8000-000000000011" });
    const source = new SibylBehavioralMemoryStore();
    await source.persistExecutionMemory(prior);
    await source.persistBehavioralEvaluation(evaluation);
    await source.persistMemoryUpdate(result.record);
    await source.persistExecutionMemory(result.memory);

    const fresh = new SibylBehavioralMemoryStore();
    await expect(fresh.getExecutionMemory(prior.id)).resolves.toEqual(prior);
    await expect(fresh.getExecutionMemory(result.memory.id)).resolves.toEqual(result.memory);
    await expect(fresh.listMemoryUpdatesForMemory(prior.id)).resolves.toEqual([result.record]);
  });
});
