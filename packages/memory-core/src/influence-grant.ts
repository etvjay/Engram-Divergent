import { z } from "zod";

export const InfluenceGrantSchema = z.object({
  id: z.string().uuid(),
  memorySliceId: z.string().uuid(),
  consumerAgentId: z.string().min(1),
  consumerExecutionId: z.string().uuid(),
  allowedEffects: z.array(z.string().min(1)).min(1),
  deniedEffects: z.array(z.string().min(1)).default([]),
  constraints: z.record(z.string(), z.unknown()).default({}),
  issuedAt: z.coerce.date(),
  expiresAt: z.coerce.date().optional(),
}).superRefine((grant, ctx) => {
  const denied = new Set(grant.deniedEffects);
  for (const effect of grant.allowedEffects) {
    if (denied.has(effect)) {
      ctx.addIssue({ code: "custom", message: `INFLUENCE_EFFECT_BOTH_ALLOWED_AND_DENIED:${effect}` });
    }
  }
});

export type InfluenceGrant = z.infer<typeof InfluenceGrantSchema>;
