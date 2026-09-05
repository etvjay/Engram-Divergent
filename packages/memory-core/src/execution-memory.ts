import { z } from "zod";
import { EvidenceStateSchema } from "./domain.js";

export const ExecutionMemoryStateSchema = z.enum([
  "ADMITTED",
  "SUPPORTED",
  "QUALIFIED",
  "SUPERSEDED",
  "INVALIDATED",
]);

export const ExecutionMemorySchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().min(1),
  memoryType: z.string().min(1),
  summary: z.string().min(1),
  sourceCandidateMemoryId: z.string().uuid(),
  sourceExperienceIds: z.array(z.string().uuid()).min(1),
  sourceEpisodeIds: z.array(z.string().uuid()).min(1),
  applicability: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
  evidenceState: EvidenceStateSchema,
  state: ExecutionMemoryStateSchema,
  admittedAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  supersedesMemoryIds: z.array(z.string().uuid()).default([]),
  invalidationReason: z.string().min(1).optional(),
});

export type ExecutionMemory = z.infer<typeof ExecutionMemorySchema>;
