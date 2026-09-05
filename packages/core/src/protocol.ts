import { z } from "zod";

export const ENGRAM_PROTOCOL_VERSION = "engram.protocol/v1" as const;

export const EvidenceStateSchema = z.enum([
  "VERIFIED",
  "OBSERVED",
  "SIMULATED",
  "INFERRED",
  "PROPOSED",
  "UNKNOWN",
]);
export type EvidenceState = z.infer<typeof EvidenceStateSchema>;

export const MemoryInfluenceTypeSchema = z.enum([
  "CHANGED_ACTION",
  "CONSTRAINED_ACTION",
  "SUPPORTED_ACTION",
  "CONSIDERED",
]);
export type MemoryInfluenceType = z.infer<typeof MemoryInfluenceTypeSchema>;

export const CounterfactualSourceSchema = z.enum([
  "APPLICATION_DECLARED",
  "CONTROL_RUN",
  "SHADOW_RUN",
  "REPLAY",
  "UNKNOWN",
]);
export type CounterfactualSource = z.infer<typeof CounterfactualSourceSchema>;

export const CounterfactualSchema = z.object({
  action: z.record(z.string(), z.unknown()),
  source: CounterfactualSourceSchema,
  evidenceState: EvidenceStateSchema,
  explanation: z.string().min(1),
  comparisonExecutionId: z.string().uuid().optional(),
});
export type Counterfactual = z.infer<typeof CounterfactualSchema>;

export const ProvenanceReferenceSchema = z.object({
  sourceType: z.enum([
    "EXECUTION",
    "EVENT",
    "DECISION",
    "OUTCOME",
    "MEMORY",
    "HUMAN",
    "EXTERNAL_SYSTEM",
  ]),
  sourceId: z.string().min(1),
  evidenceState: EvidenceStateSchema,
  observedAt: z.coerce.date().optional(),
  uri: z.string().url().optional(),
  digest: z.string().min(1).optional(),
});
export type ProvenanceReference = z.infer<typeof ProvenanceReferenceSchema>;

export const MemoryRecallReferenceSchema = z.object({
  retrievalId: z.string().uuid(),
  memoryId: z.string().uuid(),
  memoryStateDigest: z.string().min(1).optional(),
  rank: z.number().int().positive(),
  score: z.number().min(0).max(1).optional(),
});
export type MemoryRecallReference = z.infer<typeof MemoryRecallReferenceSchema>;

export const MemoryInfluenceSchema = z.object({
  memoryId: z.string().uuid(),
  retrievalId: z.string().uuid().optional(),
  influenceType: MemoryInfluenceTypeSchema,
  summary: z.string().min(1),
  relevance: z.number().min(0).max(1).optional(),
  counterfactual: CounterfactualSchema.optional(),
});
export type MemoryInfluence = z.infer<typeof MemoryInfluenceSchema>;

/**
 * Retrieval and influence are deliberately separate protocol objects.
 * A recalled memory is not evidence that it affected a decision.
 *
 * `memoryStateDigest` binds an exposed recall to the authority-relevant memory
 * state that was actually shown. It is optional only so historical v1 recall
 * records remain readable; a newly recorded influence must fail closed when
 * its persisted recall lacks this binding.
 */
export const MemoryRecallSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  query: z.string().min(1),
  policyVersion: z.string().min(1),
  recalledAt: z.coerce.date(),
  candidates: z.array(MemoryRecallReferenceSchema),
});
export type MemoryRecall = z.infer<typeof MemoryRecallSchema>;
