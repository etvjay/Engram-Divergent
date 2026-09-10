const randomUUID = () => globalThis.crypto.randomUUID();
import { z } from "zod";
import { ExecutionEpisodeSchema, type ExecutionEpisode } from "./episode.js";
import { ExecutionSliceSchema, type ExecutionSlice } from "./execution-slice.js";
import { ExperienceSchema, type Experience } from "./experience.js";
import { CandidateMemorySchema, type CandidateMemory } from "../../memory-core/src/candidate-memory.js";
import { ExecutionMemorySchema, type ExecutionMemory } from "../../memory-core/src/execution-memory.js";
import { MemorySliceSchema, type MemorySlice } from "../../memory-core/src/memory-slice.js";
import { InfluenceGrantSchema, type InfluenceGrant } from "../../memory-core/src/influence-grant.js";
import type { EvidenceState, ExecutionEvent, Outcome } from "../../memory-core/src/domain.js";

export type FormationExecution = {
  id: string;
  agentId: string;
  workflowType: string;
  intent: string;
  context: Record<string, unknown>;
  constraints: Record<string, unknown>;
  status: string;
  startedAt: Date;
  completedAt?: Date;
};

export type AdmissionDecision = {
  status: "ADMITTED" | "REJECTED";
  reason: string;
  evidenceState: EvidenceState;
  candidate: CandidateMemory;
  admittedMemory?: ExecutionMemory;
};

export function formExecutionEpisode(input: {
  execution: FormationExecution;
  events: ExecutionEvent[];
  outcome?: Outcome;
  evidenceRefs: string[];
  evidenceState: EvidenceState;
  formedAt?: Date;
}): ExecutionEpisode {
  const { execution, outcome } = input;
  if (!outcome) throw new Error("EXECUTION_OUTCOME_REQUIRED");
  if (input.evidenceRefs.length === 0) throw new Error("EXECUTION_EVIDENCE_REQUIRED");
  if (!execution.completedAt) throw new Error("EXECUTION_TERMINAL_TIMESTAMP_REQUIRED");
  if (outcome.executionId !== execution.id) throw new Error("EXECUTION_OUTCOME_ID_MISMATCH");
  if (outcome.status !== execution.status) throw new Error("EXECUTION_OUTCOME_STATUS_MISMATCH");
  if (["RUNNING", "MEMORY_UNAVAILABLE"].includes(execution.status)) {
    throw new Error("EXECUTION_NOT_TERMINAL");
  }
  const ordered = [...input.events].sort((a, b) => a.sequenceNo - b.sequenceNo);
  let previousEventTime = execution.startedAt.getTime();
  for (let index = 0; index < ordered.length; index += 1) {
    const event = ordered[index]!;
    if (event.executionId !== execution.id) throw new Error("EXECUTION_EVENT_ID_MISMATCH");
    if (event.sequenceNo !== index) throw new Error("EXECUTION_EVENT_SEQUENCE_INVALID");
    if (event.occurredAt.getTime() < previousEventTime) throw new Error("EXECUTION_EVENT_CHRONOLOGY_INVALID");
    if (event.occurredAt.getTime() < execution.startedAt.getTime()) throw new Error("EXECUTION_EVENT_BEFORE_START");
    if (event.occurredAt.getTime() > execution.completedAt.getTime()) throw new Error("EXECUTION_EVENT_AFTER_COMPLETION");
    previousEventTime = event.occurredAt.getTime();
  }
  return ExecutionEpisodeSchema.parse({
    id: randomUUID(),
    executionId: execution.id,
    agentId: execution.agentId,
    workflowType: execution.workflowType,
    intent: execution.intent,
    context: execution.context,
    constraints: execution.constraints,
    status: execution.status,
    events: ordered,
    decisionIds: [],
    outcome,
    evidenceRefs: input.evidenceRefs,
    evidenceState: input.evidenceState,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    formedAt: input.formedAt ?? new Date(),
  });
}

export function formExecutionSlice(input: {
  episode: ExecutionEpisode;
  purpose: string;
  subject: string;
  fields: Record<string, unknown>;
  evidenceRefs?: string[];
}): ExecutionSlice {
  return ExecutionSliceSchema.parse({
    id: randomUUID(),
    episodeId: input.episode.id,
    executionId: input.episode.executionId,
    purpose: input.purpose,
    subject: input.subject,
    fields: input.fields,
    eventRefs: input.episode.events.map((event) => event.id),
    evidenceRefs: input.evidenceRefs ?? input.episode.evidenceRefs,
    evidenceState: input.episode.evidenceState,
    extractedAt: input.episode.formedAt,
  });
}

export function formExperience(input: {
  episode: ExecutionEpisode;
  slice: ExecutionSlice;
  subject: string;
  observation: string;
  interpretation: string;
  applicability: Record<string, unknown>;
  confidence: number;
}): Experience {
  return ExperienceSchema.parse({
    id: randomUUID(),
    agentId: input.episode.agentId,
    workflowType: input.episode.workflowType,
    sourceEpisodeIds: [input.episode.id],
    sourceSliceIds: [input.slice.id],
    subject: input.subject,
    observation: input.observation,
    interpretation: input.interpretation,
    applicability: input.applicability,
    confidence: input.confidence,
    evidenceState: input.episode.evidenceState,
    formedAt: input.episode.formedAt,
  });
}

export function formCandidateMemory(input: {
  experience: Experience;
  memoryType: string;
  summary: string;
  proposedInfluence: string[];
}): CandidateMemory {
  return CandidateMemorySchema.parse({
    id: randomUUID(),
    agentId: input.experience.agentId,
    memoryType: input.memoryType,
    summary: input.summary,
    sourceExperienceIds: input.experience.id ? [input.experience.id] : [],
    sourceEpisodeIds: input.experience.sourceEpisodeIds,
    applicability: input.experience.applicability,
    proposedInfluence: input.proposedInfluence,
    confidence: input.experience.confidence,
    evidenceState: input.experience.evidenceState,
    status: "CANDIDATE",
    proposedAt: input.experience.formedAt,
  });
}

export function admitCandidateMemory(input: {
  candidate: CandidateMemory;
  minimumConfidence?: number;
  allowedEvidenceStates?: EvidenceState[];
  reason: string;
}): AdmissionDecision {
  const minimumConfidence = input.minimumConfidence ?? 0.65;
  const allowedEvidenceStates = input.allowedEvidenceStates ?? ["VERIFIED", "OBSERVED", "SIMULATED"];
  if (!allowedEvidenceStates.includes(input.candidate.evidenceState)) {
    return { status: "REJECTED", reason: "EVIDENCE_STATE_NOT_ADMISSIBLE", evidenceState: input.candidate.evidenceState, candidate: input.candidate };
  }
  if (input.candidate.confidence < minimumConfidence) {
    return { status: "REJECTED", reason: "CONFIDENCE_BELOW_ADMISSION_THRESHOLD", evidenceState: input.candidate.evidenceState, candidate: input.candidate };
  }
  return { status: "ADMITTED", reason: input.reason, evidenceState: input.candidate.evidenceState, candidate: { ...input.candidate, status: "ADMITTED" } };
}

export function formExecutionMemory(input: {
  candidate: CandidateMemory;
  admittedAt?: Date;
}): ExecutionMemory {
  if (input.candidate.status !== "ADMITTED") throw new Error("CANDIDATE_MEMORY_NOT_ADMITTED");
  const admittedAt = input.admittedAt ?? new Date();
  return ExecutionMemorySchema.parse({
    id: randomUUID(),
    agentId: input.candidate.agentId,
    memoryType: input.candidate.memoryType,
    summary: input.candidate.summary,
    sourceCandidateMemoryId: input.candidate.id,
    sourceExperienceIds: input.candidate.sourceExperienceIds,
    sourceEpisodeIds: input.candidate.sourceEpisodeIds,
    applicability: input.candidate.applicability,
    confidence: input.candidate.confidence,
    evidenceState: input.candidate.evidenceState,
    state: "ADMITTED",
    admittedAt,
    updatedAt: admittedAt,
    supersedesMemoryIds: [],
  });
}

export function isExecutionMemoryApplicable(memory: ExecutionMemory, context: Record<string, unknown>): boolean {
  return Object.entries(memory.applicability).every(([key, value]) => context[key] === value);
}

export function materializeMemorySlice(input: {
  memory: ExecutionMemory;
  consumerAgentId: string;
  consumerExecutionId: string;
  purpose: string;
  subject: string;
  claims: string[];
  evidenceRefs: string[];
  expiresAt?: Date;
}): MemorySlice {
  return MemorySliceSchema.parse({
    id: randomUUID(),
    executionMemoryIds: [input.memory.id],
    consumerAgentId: input.consumerAgentId,
    consumerExecutionId: input.consumerExecutionId,
    purpose: input.purpose,
    subject: input.subject,
    claims: input.claims,
    applicability: input.memory.applicability,
    evidenceRefs: input.evidenceRefs,
    confidence: input.memory.confidence,
    disclosureScope: [input.purpose],
    redactedFields: ["rawHistory", "sourceEvents"],
    derivedAt: new Date(),
    expiresAt: input.expiresAt,
  });
}

export function materializeInfluenceGrant(input: {
  slice: MemorySlice;
  allowedEffects: string[];
  deniedEffects: string[];
  constraints: Record<string, unknown>;
  expiresAt?: Date;
}): InfluenceGrant {
  return InfluenceGrantSchema.parse({
    id: randomUUID(),
    memorySliceId: input.slice.id,
    consumerAgentId: input.slice.consumerAgentId,
    consumerExecutionId: input.slice.consumerExecutionId,
    allowedEffects: input.allowedEffects,
    deniedEffects: input.deniedEffects,
    constraints: input.constraints,
    issuedAt: new Date(),
    expiresAt: input.expiresAt,
  });
}

export const AdmissionDecisionSchema = z.object({
  status: z.enum(["ADMITTED", "REJECTED"]),
  reason: z.string().min(1),
  evidenceState: z.string().min(1),
});
