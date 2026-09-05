import { z } from "zod";

export const MemorySliceSchema = z.object({
  id: z.string().uuid(),
  executionMemoryIds: z.array(z.string().uuid()).min(1),
  consumerAgentId: z.string().min(1),
  consumerExecutionId: z.string().uuid(),
  purpose: z.string().min(1),
  subject: z.string().min(1),
  claims: z.array(z.string().min(1)).min(1),
  applicability: z.record(z.string(), z.unknown()).default({}),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  confidence: z.number().min(0).max(1),
  disclosureScope: z.array(z.string().min(1)).default([]),
  redactedFields: z.array(z.string().min(1)).default([]),
  derivedAt: z.coerce.date(),
  expiresAt: z.coerce.date().optional(),
});

export type MemorySlice = z.infer<typeof MemorySliceSchema>;
