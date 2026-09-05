import { z } from "zod";
import { EvidenceStateSchema } from "../../memory-core/src/domain.js";

export const ExperienceSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().min(1),
  workflowType: z.string().min(1),
  sourceEpisodeIds: z.array(z.string().uuid()).min(1),
  sourceSliceIds: z.array(z.string().uuid()).min(1),
  subject: z.string().min(1),
  observation: z.string().min(1),
  interpretation: z.string().min(1),
  applicability: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
  evidenceState: EvidenceStateSchema,
  formedAt: z.coerce.date(),
});

export type Experience = z.infer<typeof ExperienceSchema>;
