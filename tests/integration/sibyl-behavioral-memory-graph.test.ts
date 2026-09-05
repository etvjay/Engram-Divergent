import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExecutionEpisodeSchema } from "../../packages/experience/src/episode.js";
import { ExecutionSliceSchema } from "../../packages/experience/src/execution-slice.js";
import { ExperienceSchema } from "../../packages/experience/src/experience.js";
import { CandidateMemorySchema } from "../../packages/memory-core/src/candidate-memory.js";
import { ExecutionMemorySchema } from "../../packages/memory-core/src/execution-memory.js";
import { MemorySliceSchema } from "../../packages/memory-core/src/memory-slice.js";
import { InfluenceGrantSchema } from "../../packages/memory-core/src/influence-grant.js";
import { BehavioralMemoryEvaluationSchema } from "../../packages/evaluation/src/memory-evaluation.js";
import { SibylBehavioralMemoryStore } from "../../packages/sibyl/src/behavioral-store.js";
import { validateBehavioralMemoryLineage } from "../../packages/experience/src/lineage.js";

const describeSibyl = process.env.ENGRAM_SIBYL_TEST_REQUIRED === "1" ? describe : describe.skip;

const ids = {
  sourceExecution: "10000000-0000-4000-8000-000000000001",
  futureExecution: "10000000-0000-4000-8000-000000000002",
  event: "10000000-0000-4000-8000-000000000003",
  outcome: "10000000-0000-4000-8000-000000000004",
  episode: "10000000-0000-4000-8000-000000000005",
  executionSlice: "10000000-0000-4000-8000-000000000006",
  experience: "10000000-0000-4000-8000-000000000007",
  candidate: "10000000-0000-4000-8000-000000000008",
  memory: "10000000-0000-4000-8000-000000000009",
  memorySlice: "10000000-0000-4000-8000-000000000010",
  grant: "10000000-0000-4000-8000-000000000011",
  decision: "10000000-0000-4000-8000-000000000012",
  evaluation: "10000000-0000-4000-8000-000000000013",
};

let dir: string;
let previousDb: string | undefined;
let previousTenant: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "engram-behavioral-graph-"));
  previousDb = process.env.ENGRAM_SIBYL_DB;
  previousTenant = process.env.ENGRAM_SIBYL_TENANT;
  process.env.ENGRAM_SIBYL_DB = join(dir, "memory.db");
  process.env.ENGRAM_SIBYL_TENANT = "engram-behavioral-graph-test";
});

afterEach(async () => {
  if (previousDb === undefined) delete process.env.ENGRAM_SIBYL_DB;
  else process.env.ENGRAM_SIBYL_DB = previousDb;
  if (previousTenant === undefined) delete process.env.ENGRAM_SIBYL_TENANT;
  else process.env.ENGRAM_SIBYL_TENANT = previousTenant;
  await rm(dir, { recursive: true, force: true });
});

function graphObjects() {
  const now = new Date("2026-09-05T09:00:00Z");
  const episode = ExecutionEpisodeSchema.parse({
    id: ids.episode,
    executionId: ids.sourceExecution,
    agentId: "agent-source",
    workflowType: "provider_selection",
    intent: "obtain verified data",
    context: { urgency: "URGENT" },
    constraints: { maxLatencySeconds: 1800 },
    status: "FAILURE",
    events: [{ id: ids.event, executionId: ids.sourceExecution, sequenceNo: 0, eventType: "PROVIDER_SLA_BREACH", payload: { providerId: "provider-a" }, evidenceState: "OBSERVED", occurredAt: now }],
    decisionIds: [],
    outcome: { id: ids.outcome, executionId: ids.sourceExecution, status: "FAILURE", failureType: "SLA_BREACH", summary: "Provider A missed SLA", result: {}, evidenceState: "OBSERVED" },
    evidenceRefs: ["acp:job:test"], evidenceState: "OBSERVED",
    startedAt: new Date(now.getTime() - 3600000), completedAt: now, formedAt: now,
  });
  const executionSlice = ExecutionSliceSchema.parse({ id: ids.executionSlice, episodeId: ids.episode, executionId: ids.sourceExecution, purpose: "provider_performance_learning", subject: "provider-a", fields: { urgency: "URGENT", failureType: "SLA_BREACH" }, eventRefs: [ids.event], evidenceRefs: ["acp:job:test"], evidenceState: "OBSERVED", extractedAt: now });
  const experience = ExperienceSchema.parse({ id: ids.experience, agentId: "agent-source", workflowType: "provider_selection", sourceEpisodeIds: [ids.episode], sourceSliceIds: [ids.executionSlice], subject: "provider-a", observation: "Provider A missed the urgent SLA.", interpretation: "Guard Provider A on comparable urgent tasks.", applicability: { urgency: "URGENT" }, confidence: 0.8, evidenceState: "OBSERVED", formedAt: now });
  const candidateMemory = CandidateMemorySchema.parse({ id: ids.candidate, agentId: "agent-source", memoryType: "EXPERIENTIAL_RELATIONSHIP", summary: "Guard Provider A on comparable urgent work.", sourceExperienceIds: [ids.experience], sourceEpisodeIds: [ids.episode], applicability: { urgency: "URGENT" }, proposedInfluence: ["provider_selection"], confidence: 0.8, evidenceState: "OBSERVED", status: "CANDIDATE", proposedAt: now });
  const executionMemory = ExecutionMemorySchema.parse({ id: ids.memory, agentId: "agent-source", memoryType: "EXPERIENTIAL_RELATIONSHIP", summary: candidateMemory.summary, sourceCandidateMemoryId: ids.candidate, sourceExperienceIds: [ids.experience], sourceEpisodeIds: [ids.episode], applicability: { urgency: "URGENT" }, confidence: 0.8, evidenceState: "OBSERVED", state: "ADMITTED", admittedAt: now, updatedAt: now });
  const memorySlice = MemorySliceSchema.parse({ id: ids.memorySlice, executionMemoryIds: [ids.memory], consumerAgentId: "agent-qwen", consumerExecutionId: ids.futureExecution, purpose: "provider_selection", subject: "provider-a", claims: ["Prior urgent SLA breach observed."], applicability: { urgency: "URGENT" }, evidenceRefs: ["acp:job:test"], confidence: 0.8, disclosureScope: ["provider_performance"], redactedFields: [], derivedAt: now });
  const influenceGrant = InfluenceGrantSchema.parse({ id: ids.grant, memorySliceId: ids.memorySlice, consumerAgentId: "agent-qwen", consumerExecutionId: ids.futureExecution, allowedEffects: ["provider_selection"], deniedEffects: ["increase_budget"], constraints: { maxBudgetUsd: 20 }, issuedAt: now });
  const evaluation = BehavioralMemoryEvaluationSchema.parse({ id: ids.evaluation, executionMemoryId: ids.memory, memorySliceId: ids.memorySlice, influenceGrantId: ids.grant, influencedExecutionId: ids.futureExecution, influencedDecisionId: ids.decision, effect: "BENEFICIAL", effectScore: 0.7, actionChanged: true, controlAction: { providerId: "provider-a" }, treatmentAction: { providerId: "provider-b" }, controlOutcome: "SLA_BREACH", treatmentOutcome: "SUCCESS", updateDirective: "STRENGTHEN", rationale: "The bounded behavioral change improved the outcome.", evidenceState: "OBSERVED", evaluatedAt: now });
  return { episode, executionSlice, experience, candidateMemory, executionMemory, memorySlice, influenceGrant, evaluation };
}

describeSibyl("Sibyl behavioral memory graph", () => {
  it("reconstructs the full behavioral lineage through a fresh store instance", async () => {
    const source = new SibylBehavioralMemoryStore();
    const value = graphObjects();
    await source.persistEpisode(value.episode);
    await source.persistExecutionSlice(value.executionSlice);
    await source.persistExperience(value.experience);
    await source.persistCandidateMemory(value.candidateMemory);
    await source.persistExecutionMemory(value.executionMemory);
    await source.persistMemorySlice(value.memorySlice);
    await source.persistInfluenceGrant(value.influenceGrant);
    await source.persistBehavioralEvaluation(value.evaluation);

    const fresh = new SibylBehavioralMemoryStore();
    const graph = await fresh.loadBehavioralMemoryGraph(ids.memory);

    expect(graph.episodes.map((item) => item.id)).toEqual([ids.episode]);
    expect(graph.executionSlices.map((item) => item.id)).toEqual([ids.executionSlice]);
    expect(graph.experiences.map((item) => item.id)).toEqual([ids.experience]);
    expect(graph.memorySlices.map((item) => item.id)).toEqual([ids.memorySlice]);
    expect(graph.influenceGrants.map((item) => item.id)).toEqual([ids.grant]);
    expect(graph.evaluations.map((item) => item.id)).toEqual([ids.evaluation]);

    expect(validateBehavioralMemoryLineage({
      episodes: graph.episodes,
      executionSlices: graph.executionSlices,
      experiences: graph.experiences,
      candidateMemory: graph.candidateMemory,
      executionMemory: graph.executionMemory,
      memorySlice: graph.memorySlices[0]!,
      influenceGrant: graph.influenceGrants[0]!,
      evaluation: graph.evaluations[0]!,
    })).toEqual([]);
  }, 30_000);

  it("is idempotent for identical writes but rejects object mutation under the same id", async () => {
    const store = new SibylBehavioralMemoryStore();
    const value = graphObjects();
    await store.persistEpisode(value.episode);
    await expect(store.persistEpisode(value.episode)).resolves.toBeUndefined();
    await expect(store.persistEpisode({ ...value.episode, intent: "mutated intent" })).rejects.toThrow("BEHAVIORAL_OBJECT_IDEMPOTENCY_CONFLICT:execution_episode");
  }, 20_000);
});
