import { z } from "zod";
import { EvidenceStateSchema } from "./domain.js";

export const CandidateMemoryStatusSchema = z.enum(["CANDIDATE", "REJECTED", "ADMITTED"]);

export const CandidateMemorySchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().min(1),
  memoryType: z.string().min(1),
  summary: z.string().min(1),
  sourceExperienceIds: z.array(z.string().uuid()).min(1),
  sourceEpisodeIds: z.array(z.string().uuid()).min(1),
  applicability: z.record(z.string(), z.unknown()).default({}),
  proposedInfluence: z.array(z.string().min(1)).default([]),
  confidence: z.number().min(0).max(1),
  evidenceState: EvidenceStateSchema,
  status: CandidateMemoryStatusSchema.default("CANDIDATE"),
  proposedAt: z.coerce.date(),
});

export type CandidateMemory = z.infer<typeof CandidateMemorySchema>;
