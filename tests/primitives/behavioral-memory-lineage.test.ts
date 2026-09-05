import { describe, expect, it } from "vitest";
import { ExecutionEpisodeSchema } from "../../packages/experience/src/episode.js";
import { ExecutionSliceSchema } from "../../packages/experience/src/execution-slice.js";
import { ExperienceSchema } from "../../packages/experience/src/experience.js";
import {
  assertBehavioralMemoryLineage,
  assertInfluenceAllowed,
  validateBehavioralMemoryLineage,
} from "../../packages/experience/src/lineage.js";
import { CandidateMemorySchema } from "../../packages/memory-core/src/candidate-memory.js";
import { ExecutionMemorySchema } from "../../packages/memory-core/src/execution-memory.js";
import { MemorySliceSchema } from "../../packages/memory-core/src/memory-slice.js";
import { InfluenceGrantSchema } from "../../packages/memory-core/src/influence-grant.js";
import { BehavioralMemoryEvaluationSchema } from "../../packages/evaluation/src/memory-evaluation.js";

const IDs = {
  execution1: "00000000-0000-4000-8000-000000000001",
  execution2: "00000000-0000-4000-8000-000000000002",
  event1: "00000000-0000-4000-8000-000000000003",
  outcome1: "00000000-0000-4000-8000-000000000004",
  episode1: "00000000-0000-4000-8000-000000000005",
  slice1: "00000000-0000-4000-8000-000000000006",
  experience1: "00000000-0000-4000-8000-000000000007",
  candidate1: "00000000-0000-4000-8000-000000000008",
  memory1: "00000000-0000-4000-8000-000000000009",
  memorySlice1: "00000000-0000-4000-8000-000000000010",
  influence1: "00000000-0000-4000-8000-000000000011",
  decision2: "00000000-0000-4000-8000-000000000012",
  evaluation1: "00000000-0000-4000-8000-000000000013",
};

function lineage() {
  const now = new Date("2026-09-05T08:30:00Z");
  const episode = ExecutionEpisodeSchema.parse({
    id: IDs.episode1,
    executionId: IDs.execution1,
    agentId: "agent-a",
    workflowType: "provider_selection",
    intent: "obtain verified data",
    context: { taskType: "financial_data", urgency: "URGENT" },
    constraints: { maxLatencySeconds: 1800 },
    status: "FAILURE",
    events: [{
      id: IDs.event1,
      executionId: IDs.execution1,
      sequenceNo: 0,
      eventType: "PROVIDER_SLA_BREACH",
      payload: { providerId: "provider-a", latencySeconds: 3060 },
      evidenceState: "OBSERVED",
      occurredAt: now,
    }],
    decisionIds: [],
    outcome: {
      id: IDs.outcome1,
      executionId: IDs.execution1,
      status: "FAILURE",
      failureType: "SLA_BREACH",
      summary: "Provider A missed the urgent SLA.",
      result: { providerId: "provider-a" },
      evidenceState: "OBSERVED",
    },
    evidenceRefs: ["acp:job:184"],
    evidenceState: "OBSERVED",
    startedAt: new Date(now.getTime() - 3_600_000),
    completedAt: now,
    formedAt: now,
  });

  const executionSlice = ExecutionSliceSchema.parse({
    id: IDs.slice1,
    episodeId: episode.id,
    executionId: episode.executionId,
    purpose: "provider_performance_learning",
    subject: "provider-a",
    fields: {
      taskType: "financial_data",
      urgency: "URGENT",
      expectedLatencySeconds: 1800,
      observedLatencySeconds: 3060,
      failureType: "SLA_BREACH",
    },
    eventRefs: [IDs.event1],
    evidenceRefs: ["acp:job:184"],
    evidenceState: "OBSERVED",
    extractedAt: now,
  });

  const experience = ExperienceSchema.parse({
    id: IDs.experience1,
    agentId: "agent-a",
    workflowType: "provider_selection",
    sourceEpisodeIds: [episode.id],
    sourceSliceIds: [executionSlice.id],
    subject: "provider-a",
    observation: "Provider A exceeded the urgent latency bound.",
    interpretation: "Provider A may require guarded treatment on comparable urgent financial-data tasks.",
    applicability: { taskType: "financial_data", urgency: "URGENT" },
    confidence: 0.72,
    evidenceState: "OBSERVED",
    formedAt: now,
  });

  const candidateMemory = CandidateMemorySchema.parse({
    id: IDs.candidate1,
    agentId: "agent-a",
    memoryType: "EXPERIENTIAL_RELATIONSHIP",
    summary: "Provider A requires guarded treatment for comparable urgent financial-data work.",
    sourceExperienceIds: [experience.id],
    sourceEpisodeIds: [episode.id],
    applicability: { taskType: "financial_data", urgency: "URGENT" },
    proposedInfluence: ["provider_selection", "timeout_policy"],
    confidence: 0.72,
    evidenceState: "OBSERVED",
    status: "CANDIDATE",
    proposedAt: now,
  });

  const executionMemory = ExecutionMemorySchema.parse({
    id: IDs.memory1,
    agentId: "agent-a",
    memoryType: "EXPERIENTIAL_RELATIONSHIP",
    summary: candidateMemory.summary,
    sourceCandidateMemoryId: candidateMemory.id,
    sourceExperienceIds: candidateMemory.sourceExperienceIds,
    sourceEpisodeIds: candidateMemory.sourceEpisodeIds,
    applicability: candidateMemory.applicability,
    confidence: 0.72,
    evidenceState: "OBSERVED",
    state: "ADMITTED",
    admittedAt: now,
    updatedAt: now,
  });

  const memorySlice = MemorySliceSchema.parse({
    id: IDs.memorySlice1,
    executionMemoryIds: [executionMemory.id],
    consumerAgentId: "agent-b",
    consumerExecutionId: IDs.execution2,
    purpose: "provider_selection",
    subject: "provider-a",
    claims: ["Provider A has prior observed urgent-SLA failure evidence."],
    applicability: { taskType: "financial_data", urgency: "URGENT" },
    evidenceRefs: ["acp:job:184"],
    confidence: 0.72,
    disclosureScope: ["provider_performance"],
    redactedFields: ["commercial_terms"],
    derivedAt: now,
  });

  const influenceGrant = InfluenceGrantSchema.parse({
    id: IDs.influence1,
    memorySliceId: memorySlice.id,
    consumerAgentId: memorySlice.consumerAgentId,
    consumerExecutionId: memorySlice.consumerExecutionId,
    allowedEffects: ["provider_selection", "timeout_policy"],
    deniedEffects: ["increase_budget", "signer_policy"],
    constraints: { maxBudgetUsd: 20 },
    issuedAt: now,
  });

  const evaluation = BehavioralMemoryEvaluationSchema.parse({
    id: IDs.evaluation1,
    executionMemoryId: executionMemory.id,
    memorySliceId: memorySlice.id,
    influenceGrantId: influenceGrant.id,
    influencedExecutionId: IDs.execution2,
    influencedDecisionId: IDs.decision2,
    effect: "BENEFICIAL",
    effectScore: 0.8,
    actionChanged: true,
    controlAction: { providerId: "provider-a" },
    treatmentAction: { providerId: "provider-b" },
    controlOutcome: "SLA_BREACH",
    treatmentOutcome: "SUCCESS",
    updateDirective: "STRENGTHEN",
    rationale: "The bounded provider-selection adaptation avoided the previously observed failure mode.",
    evidenceState: "OBSERVED",
    evaluatedAt: now,
  });

  return {
    episodes: [episode],
    executionSlices: [executionSlice],
    experiences: [experience],
    candidateMemory,
    executionMemory,
    memorySlice,
    influenceGrant,
    evaluation,
  };
}

describe("behavioral memory primitives", () => {
  it("preserves machine-verifiable episode → slice → experience → memory → influence → evaluation lineage", () => {
    const value = lineage();
    expect(validateBehavioralMemoryLineage(value)).toEqual([]);
    expect(() => assertBehavioralMemoryLineage(value)).not.toThrow();
  });

  it("separates disclosure from authority", () => {
    const value = lineage();
    expect(() => assertInfluenceAllowed(value.influenceGrant, "provider_selection")).not.toThrow();
    expect(() => assertInfluenceAllowed(value.influenceGrant, "increase_budget")).toThrow("INFLUENCE_EFFECT_DENIED:increase_budget");
    expect(() => assertInfluenceAllowed(value.influenceGrant, "asset_selection")).toThrow("INFLUENCE_EFFECT_NOT_GRANTED:asset_selection");
  });

  it("fails closed when lineage is broken", () => {
    const value = lineage();
    const broken = {
      ...value,
      influenceGrant: {
        ...value.influenceGrant,
        consumerExecutionId: IDs.execution1,
      },
    };
    expect(validateBehavioralMemoryLineage(broken)).toContain("INFLUENCE_GRANT_CONSUMER_EXECUTION_MISMATCH");
  });

  it("rejects an influence grant that both allows and denies the same effect", () => {
    const value = lineage();
    expect(() => InfluenceGrantSchema.parse({
      ...value.influenceGrant,
      allowedEffects: ["provider_selection"],
      deniedEffects: ["provider_selection"],
    })).toThrow();
  });
});
