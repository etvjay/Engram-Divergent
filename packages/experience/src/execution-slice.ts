import { z } from "zod";
import { EvidenceStateSchema } from "../../memory-core/src/domain.js";

export const ExecutionSliceSchema = z.object({
  id: z.string().uuid(),
  episodeId: z.string().uuid(),
  executionId: z.string().uuid(),
  purpose: z.string().min(1),
  subject: z.string().min(1),
  fields: z.record(z.string(), z.unknown()),
  eventRefs: z.array(z.string().uuid()).default([]),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  evidenceState: EvidenceStateSchema,
  extractedAt: z.coerce.date(),
});

export type ExecutionSlice = z.infer<typeof ExecutionSliceSchema>;
