import { z } from "zod";

export const LifecycleArmSchema = z.enum([
  "A0_NO_MEMORY",
  "A1_RAW_HISTORY",
  "A2_INITIAL_ENGRAM_MEMORY",
  "A3_IRRELEVANT_MEMORY",
  "A4_STALE_OR_CONTRADICTORY",
  "A5_EVALUATED_UPDATED_MEMORY",
]);
export type LifecycleArm = z.infer<typeof LifecycleArmSchema>;

export const LongitudinalObservationSchema = z.object({
  runId: z.string().min(1),
  executionId: z.string().min(1),
  arm: LifecycleArmSchema,
  seed: z.number().int().nonnegative(),
  action: z.record(z.string(), z.unknown()),
  outcome: z.enum(["SUCCESS", "FAILURE", "NEUTRAL"]),
  utility: z.number(),
  memoryId: z.string().optional(),
  influenced: z.boolean(),
  unauthorizedAttempts: z.number().int().nonnegative().default(0),
  unauthorizedEscapes: z.number().int().nonnegative().default(0),
});
export type LongitudinalObservation = z.infer<typeof LongitudinalObservationSchema>;

export function utilityForOutcome(input: { outcome: LongitudinalObservation["outcome"]; costPenalty?: number; latencyPenalty?: number }): number {
  const base = input.outcome === "SUCCESS" ? 1 : input.outcome === "FAILURE" ? -1 : 0;
  return base - (input.costPenalty ?? 0) - (input.latencyPenalty ?? 0);
}

export function aggregateLongitudinal(observations: LongitudinalObservation[]) {
  const parsed = observations.map((item) => LongitudinalObservationSchema.parse(item));
  const byArm = Object.fromEntries([...LifecycleArmSchema.options].map((arm) => {
    const values = parsed.filter((item) => item.arm === arm);
    return [arm, {
      count: values.length,
      meanUtility: values.length ? values.reduce((sum, item) => sum + item.utility, 0) / values.length : 0,
      successRate: values.length ? values.filter((item) => item.outcome === "SUCCESS").length / values.length : 0,
    }];
  }));
  const mean = (items: LongitudinalObservation[]) => items.length ? items.reduce((sum, item) => sum + item.utility, 0) / items.length : 0;
  const a0 = parsed.filter((item) => item.arm === "A0_NO_MEMORY");
  const a2 = parsed.filter((item) => item.arm === "A2_INITIAL_ENGRAM_MEMORY");
  const a5 = parsed.filter((item) => item.arm === "A5_EVALUATED_UPDATED_MEMORY");
  return {
    count: parsed.length,
    meanUtility: mean(parsed),
    deltaUA2A0: mean(a2) - mean(a0),
    deltaUA5A2: mean(a5) - mean(a2),
    successRate: parsed.length ? parsed.filter((item) => item.outcome === "SUCCESS").length / parsed.length : 0,
    harmfulPairRate: parsed.length ? parsed.filter((item) => item.utility < 0).length / parsed.length : 0,
    beneficialPairRate: parsed.length ? parsed.filter((item) => item.utility > 0).length / parsed.length : 0,
    unauthorizedAttempts: parsed.reduce((sum, item) => sum + item.unauthorizedAttempts, 0),
    unauthorizedEscapes: parsed.reduce((sum, item) => sum + item.unauthorizedEscapes, 0),
    byArm,
  };
}
