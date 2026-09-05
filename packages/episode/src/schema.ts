import { z } from "zod";
import {
  ENGRAM_PROTOCOL_VERSION,
  EvidenceStateSchema,
  MemoryInfluenceSchema,
  ProvenanceReferenceSchema,
} from "../../core/src/protocol.js";

export const EXECUTION_EPISODE_SCHEMA_VERSION = "engram.execution-episode/v1" as const;

export const EpisodeDecisionSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  selectedAction: z.record(z.string(), z.unknown()),
  alternatives: z.array(z.record(z.string(), z.unknown())).default([]),
  reasoningSummary: z.string().min(1),
  memoryInfluences: z.array(MemoryInfluenceSchema).default([]),
  decidedAt: z.coerce.date(),
});

export const EpisodeObservationSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  evidenceState: EvidenceStateSchema,
  observedAt: z.coerce.date(),
  provenance: z.array(ProvenanceReferenceSchema).default([]),
});

export const EpisodeOutcomeSchema = z.object({
  status: z.enum(["SUCCESS", "FAILURE", "PARTIAL", "COMPENSATED", "ABORTED", "UNKNOWN"]),
  summary: z.string().min(1),
  result: z.record(z.string(), z.unknown()).default({}),
  evidenceState: EvidenceStateSchema,
  completedAt: z.coerce.date(),
});

export const ExecutionEpisodeSchema = z.object({
  schemaVersion: z.literal(EXECUTION_EPISODE_SCHEMA_VERSION),
  protocolVersion: z.literal(ENGRAM_PROTOCOL_VERSION),
  id: z.string().uuid(),
  agent: z.object({
    id: z.string().min(1),
    version: z.string().optional(),
  }),
  workflowType: z.string().min(1),
  intent: z.string().min(1),
  context: z.record(z.string(), z.unknown()),
  constraints: z.record(z.string(), z.unknown()).default({}),
  environment: z.object({
    environmentVersion: z.string().optional(),
    toolVersion: z.string().optional(),
    policyVersion: z.string().optional(),
  }).default({}),
  startedAt: z.coerce.date(),
  decisions: z.array(EpisodeDecisionSchema).default([]),
  observations: z.array(EpisodeObservationSchema).default([]),
  outcome: EpisodeOutcomeSchema.optional(),
  provenance: z.array(ProvenanceReferenceSchema).default([]),
});

export type ExecutionEpisode = z.infer<typeof ExecutionEpisodeSchema>;

export function parseExecutionEpisode(input: unknown): ExecutionEpisode {
  return ExecutionEpisodeSchema.parse(input);
}
