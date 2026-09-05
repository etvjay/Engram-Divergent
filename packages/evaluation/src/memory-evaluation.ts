import { z } from "zod";
import { EvidenceStateSchema } from "../../memory-core/src/domain.js";

export const BehavioralEffectSchema = z.enum(["BENEFICIAL", "HARMFUL", "NEUTRAL", "UNKNOWN"]);

export const MemoryUpdateDirectiveSchema = z.enum([
  "STRENGTHEN",
  "WEAKEN",
  "QUALIFY",
  "SUPERSEDE",
  "INVALIDATE",
  "NO_CHANGE",
]);

export const BehavioralMemoryEvaluationSchema = z.object({
  id: z.string().uuid(),
  executionMemoryId: z.string().uuid(),
  memorySliceId: z.string().uuid(),
  influenceGrantId: z.string().uuid(),
  influencedExecutionId: z.string().uuid(),
  influencedDecisionId: z.string().uuid(),
  baselineExecutionId: z.string().uuid().optional(),
  effect: BehavioralEffectSchema,
  effectScore: z.number().min(-1).max(1).optional(),
  actionChanged: z.boolean(),
  controlAction: z.record(z.string(), z.unknown()).optional(),
  treatmentAction: z.record(z.string(), z.unknown()),
  controlOutcome: z.string().min(1).optional(),
  treatmentOutcome: z.string().min(1),
  updateDirective: MemoryUpdateDirectiveSchema,
  rationale: z.string().min(1),
  evidenceState: EvidenceStateSchema,
  evaluatedAt: z.coerce.date(),
});

export type BehavioralMemoryEvaluation = z.infer<typeof BehavioralMemoryEvaluationSchema>;
