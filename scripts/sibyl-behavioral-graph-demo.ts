import { randomUUID } from "node:crypto";
import { ExecutionEpisodeSchema } from "../packages/experience/src/episode.js";
import { ExecutionSliceSchema } from "../packages/experience/src/execution-slice.js";
import { ExperienceSchema } from "../packages/experience/src/experience.js";
import { CandidateMemorySchema } from "../packages/memory-core/src/candidate-memory.js";
import { ExecutionMemorySchema } from "../packages/memory-core/src/execution-memory.js";
import { MemorySliceSchema } from "../packages/memory-core/src/memory-slice.js";
import { InfluenceGrantSchema } from "../packages/memory-core/src/influence-grant.js";
import { SibylBehavioralMemoryStore } from "../packages/sibyl/src/behavioral-store.js";
import { assertBehavioralMemoryLineage } from "../packages/experience/src/lineage.js";

const mode = process.argv[2];
const store = new SibylBehavioralMemoryStore();

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (mode === "seed") {
  const now = new Date();
  const sourceExecutionId = randomUUID();
  const futureExecutionId = randomUUID();
  const eventId = randomUUID();
  const outcomeId = randomUUID();
  const episodeId = randomUUID();
  const executionSliceId = randomUUID();
  const experienceId = randomUUID();
  const candidateMemoryId = randomUUID();
  const executionMemoryId = randomUUID();
  const memorySliceId = randomUUID();
  const influenceGrantId = randomUUID();

  const episode = ExecutionEpisodeSchema.parse({
    id: episodeId,
    executionId: sourceExecutionId,
    agentId: "agent-source",
    workflowType: "provider_selection",
    intent: "obtain verified data within an urgent SLA",
    context: { taskType: "financial_data", urgency: "URGENT" },
    constraints: { maxLatencySeconds: 1800 },
    status: "FAILURE",
    events: [{
      id: eventId,
      executionId: sourceExecutionId,
      sequenceNo: 0,
      eventType: "PROVIDER_SLA_BREACH",
      payload: { providerId: "provider-a", latencySeconds: 3060 },
      evidenceState: "OBSERVED",
      occurredAt: now,
    }],
    decisionIds: [],
    outcome: {
      id: outcomeId,
      executionId: sourceExecutionId,
      status: "FAILURE",
      failureType: "SLA_BREACH",
      summary: "Provider A missed the urgent SLA.",
      result: { providerId: "provider-a", latencySeconds: 3060 },
      evidenceState: "OBSERVED",
    },
    evidenceRefs: ["demo:provider-a:urgent-sla"],
    evidenceState: "OBSERVED",
    startedAt: new Date(now.getTime() - 3_600_000),
    completedAt: now,
    formedAt: now,
  });

  const executionSlice = ExecutionSliceSchema.parse({
    id: executionSliceId,
    episodeId,
    executionId: sourceExecutionId,
    purpose: "provider_performance_learning",
    subject: "provider-a",
    fields: {
      taskType: "financial_data",
      urgency: "URGENT",
      maxLatencySeconds: 1800,
      observedLatencySeconds: 3060,
      failureType: "SLA_BREACH",
    },
    eventRefs: [eventId],
    evidenceRefs: ["demo:provider-a:urgent-sla"],
    evidenceState: "OBSERVED",
    extractedAt: now,
  });

  const experience = ExperienceSchema.parse({
    id: experienceId,
    agentId: "agent-source",
    workflowType: "provider_selection",
    sourceEpisodeIds: [episodeId],
    sourceSliceIds: [executionSliceId],
    subject: "provider-a",
    observation: "Provider A exceeded the urgent latency bound.",
    interpretation: "Provider A should receive guarded treatment on comparable urgent tasks.",
    applicability: { taskType: "financial_data", urgency: "URGENT" },
    confidence: 0.8,
    evidenceState: "OBSERVED",
    formedAt: now,
  });

  const candidateMemory = CandidateMemorySchema.parse({
    id: candidateMemoryId,
    agentId: "agent-source",
    memoryType: "EXPERIENTIAL_RELATIONSHIP",
    summary: "Guard Provider A on comparable urgent financial-data work.",
    sourceExperienceIds: [experienceId],
    sourceEpisodeIds: [episodeId],
    applicability: { taskType: "financial_data", urgency: "URGENT" },
    proposedInfluence: ["provider_selection", "timeout_policy"],
    confidence: 0.8,
    evidenceState: "OBSERVED",
    status: "CANDIDATE",
    proposedAt: now,
  });

  const executionMemory = ExecutionMemorySchema.parse({
    id: executionMemoryId,
    agentId: "agent-source",
    memoryType: "EXPERIENTIAL_RELATIONSHIP",
    summary: candidateMemory.summary,
    sourceCandidateMemoryId: candidateMemoryId,
    sourceExperienceIds: [experienceId],
    sourceEpisodeIds: [episodeId],
    applicability: candidateMemory.applicability,
    confidence: 0.8,
    evidenceState: "OBSERVED",
    state: "ADMITTED",
    admittedAt: now,
    updatedAt: now,
  });

  const memorySlice = MemorySliceSchema.parse({
    id: memorySliceId,
    executionMemoryIds: [executionMemoryId],
    consumerAgentId: "agent-local-model",
    consumerExecutionId: futureExecutionId,
    purpose: "provider_selection",
    subject: "provider-a",
    claims: ["Provider A has observed urgent SLA-breach evidence in a comparable task."],
    applicability: { taskType: "financial_data", urgency: "URGENT" },
    evidenceRefs: ["demo:provider-a:urgent-sla"],
    confidence: 0.8,
    disclosureScope: ["provider_performance"],
    redactedFields: ["raw_trace"],
    derivedAt: now,
  });

  const influenceGrant = InfluenceGrantSchema.parse({
    id: influenceGrantId,
    memorySliceId,
    consumerAgentId: "agent-local-model",
    consumerExecutionId: futureExecutionId,
    allowedEffects: ["provider_selection", "timeout_policy"],
    deniedEffects: ["increase_budget", "signer_policy"],
    constraints: { maxBudgetUsd: 20 },
    issuedAt: now,
  });

  await store.persistEpisode(episode);
  await store.persistExecutionSlice(executionSlice);
  await store.persistExperience(experience);
  await store.persistCandidateMemory(candidateMemory);
  await store.persistExecutionMemory(executionMemory);
  await store.persistMemorySlice(memorySlice);
  await store.persistInfluenceGrant(influenceGrant);

  process.stdout.write(`${JSON.stringify({
    phase: "seed",
    executionMemoryId,
    futureExecutionId,
    memorySliceId,
    influenceGrantId,
    instruction: "Terminate this process. Start a fresh process with mode load and --memory-id.",
  }, null, 2)}\n`);
} else if (mode === "load") {
  const executionMemoryId = arg("memory-id");
  if (!executionMemoryId) throw new Error("Missing --memory-id");
  const graph = await store.loadBehavioralMemoryGraph(executionMemoryId);
  const memorySlice = graph.memorySlices[0];
  const influenceGrant = graph.influenceGrants[0];
  if (!memorySlice || !influenceGrant) throw new Error("PERSISTED_GRAPH_MISSING_CONSUMER_BOUNDARY");

  assertBehavioralMemoryLineage({
    episodes: graph.episodes,
    executionSlices: graph.executionSlices,
    experiences: graph.experiences,
    candidateMemory: graph.candidateMemory,
    executionMemory: graph.executionMemory,
    memorySlice,
    influenceGrant,
  });

  process.stdout.write(`${JSON.stringify({
    phase: "load",
    executionMemoryId,
    reconstructed: {
      episodeIds: graph.episodes.map((item) => item.id),
      executionSliceIds: graph.executionSlices.map((item) => item.id),
      experienceIds: graph.experiences.map((item) => item.id),
      memorySliceId: memorySlice.id,
      influenceGrantId: influenceGrant.id,
    },
    agentInput: {
      memorySlice: {
        id: memorySlice.id,
        purpose: memorySlice.purpose,
        subject: memorySlice.subject,
        claims: memorySlice.claims,
        applicability: memorySlice.applicability,
        confidence: memorySlice.confidence,
      },
      influenceGrant: {
        id: influenceGrant.id,
        allowedEffects: influenceGrant.allowedEffects,
        deniedEffects: influenceGrant.deniedEffects,
        constraints: influenceGrant.constraints,
      },
    },
  }, null, 2)}\n`);
} else {
  throw new Error("Usage: tsx scripts/sibyl-behavioral-graph-demo.ts <seed|load> [--memory-id <uuid>]");
}
