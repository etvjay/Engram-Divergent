import { z } from "zod";
import { EvidenceStateSchema } from "../../core/src/protocol.js";

export const MEMORY_EVALUATION_SCHEMA_VERSION = "engram.memory-evaluation/v1" as const;

export const EvaluationMethodSchema = z.enum([
  "CONTROL_RUN",
  "SHADOW_RUN",
  "REPLAY",
  "HUMAN_ASSESSMENT",
  "OBSERVATIONAL",
]);
export type EvaluationMethod = z.infer<typeof EvaluationMethodSchema>;

export const MemoryEffectSchema = z.enum([
  "BENEFICIAL",
  "HARMFUL",
  "NEUTRAL",
  "UNKNOWN",
]);
export type MemoryEffect = z.infer<typeof MemoryEffectSchema>;

export const MemoryEvaluationSchema = z.object({
  schemaVersion: z.literal(MEMORY_EVALUATION_SCHEMA_VERSION),
  id: z.string().uuid(),
  memoryId: z.string().uuid(),
  influencedExecutionId: z.string().uuid(),
  influencedDecisionId: z.string().uuid().optional(),
  baselineExecutionId: z.string().uuid().optional(),
  method: EvaluationMethodSchema,
  effect: MemoryEffectSchema,
  effectScore: z.number().min(-1).max(1).optional(),
  rationale: z.string().min(1),
  evidenceState: EvidenceStateSchema,
  controlledVariables: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  evaluatedAt: z.coerce.date(),
});
export type MemoryEvaluation = z.infer<typeof MemoryEvaluationSchema>;

export const MemoryRelationshipSchema = z.object({
  id: z.string().uuid(),
  leftMemoryId: z.string().uuid(),
  rightMemoryId: z.string().uuid(),
  relation: z.enum(["CONTRADICTS", "QUALIFIES", "SUPERSEDES", "INDEPENDENT", "UNKNOWN"]),
  rationale: z.string().min(1),
  evidenceState: EvidenceStateSchema,
  method: z.enum(["RULE", "HUMAN_ASSESSMENT", "EVALUATOR", "UNKNOWN"]),
  assessedAt: z.coerce.date(),
}).superRefine((value, ctx) => {
  if (value.leftMemoryId === value.rightMemoryId) {
    ctx.addIssue({ code: "custom", message: "A memory cannot have a conflict relationship with itself" });
  }
});
export type MemoryRelationship = z.infer<typeof MemoryRelationshipSchema>;

export const CounterfactualExperimentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  controlExecutionId: z.string().uuid(),
  treatmentExecutionId: z.string().uuid(),
  influentialMemoryIds: z.array(z.string().uuid()).min(1),
  controlledVariables: z.record(z.string(), z.unknown()),
  actionChanged: z.boolean(),
  controlAction: z.record(z.string(), z.unknown()),
  treatmentAction: z.record(z.string(), z.unknown()),
  controlOutcome: z.string().min(1),
  treatmentOutcome: z.string().min(1),
  conclusion: z.string().min(1),
  evidenceState: EvidenceStateSchema,
  createdAt: z.coerce.date(),
});
export type CounterfactualExperiment = z.infer<typeof CounterfactualExperimentSchema>;

export type MemoryUsefulnessMetrics = {
  memoryId: string;
  retrievalCount: number;
  exposedRetrievalCount: number;
  influenceCount: number;
  changedActionCount: number;
  consideredCount: number;
  explicitEvaluations: number;
  beneficialEvaluations: number;
  harmfulEvaluations: number;
  neutralEvaluations: number;
  unknownEvaluations: number;
  controlledEvaluations: number;
  observationalEvaluations: number;
};

export type MemoryQualityAssessment = {
  memoryId: string;
  usefulness: MemoryUsefulnessMetrics;
  warnings: string[];
  interpretation: "POSITIVE_EVIDENCE" | "NEGATIVE_EVIDENCE" | "MIXED_EVIDENCE" | "INSUFFICIENT_EVIDENCE";
};
