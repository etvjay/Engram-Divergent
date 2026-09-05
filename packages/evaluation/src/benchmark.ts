import { z } from "zod";

export const BenchmarkArmSchema = z.enum([
  "A0_NO_MEMORY",
  "A1_RAW_HISTORY",
  "A2_ENGRAM",
  "A3_IRRELEVANT_MEMORY",
  "A4_STALE_OR_CONTRADICTORY",
]);
export type BenchmarkArm = z.infer<typeof BenchmarkArmSchema>;

export const EvidenceMaturitySchema = z.enum([
  "SIMULATED_PASS",
  "LOCAL_PASS",
  "TESTNET_PASS",
  "LIVE_PASS",
  "PUBLIC_EVALUATOR_PASS",
  "FAILED",
  "BLOCKED",
]);
export type EvidenceMaturity = z.infer<typeof EvidenceMaturitySchema>;

export const UtilityComponentsSchema = z.object({
  successValue: z.number().default(0),
  costPenalty: z.number().nonnegative().default(0),
  latencyPenalty: z.number().nonnegative().default(0),
  verificationFailurePenalty: z.number().nonnegative().default(0),
  retryPenalty: z.number().nonnegative().default(0),
  manualInterventionPenalty: z.number().nonnegative().default(0),
  policyViolationPenalty: z.number().nonnegative().default(0),
});
export type UtilityComponents = z.infer<typeof UtilityComponentsSchema>;

export function calculateUtility(value: UtilityComponents): number {
  const c = UtilityComponentsSchema.parse(value);
  return c.successValue
    - c.costPenalty
    - c.latencyPenalty
    - c.verificationFailurePenalty
    - c.retryPenalty
    - c.manualInterventionPenalty
    - c.policyViolationPenalty;
}

export const BenchmarkTrialSchema = z.object({
  id: z.string().uuid(),
  pairId: z.string().min(1),
  scenarioId: z.string().min(1),
  arm: BenchmarkArmSchema,
  model: z.string().min(1),
  modelConfigDigest: z.string().min(1),
  taskDigest: z.string().min(1),
  environmentDigest: z.string().min(1),
  capabilityDigest: z.string().min(1),
  mandateDigest: z.string().min(1),
  action: z.record(z.string(), z.unknown()),
  outcome: z.record(z.string(), z.unknown()),
  utilityComponents: UtilityComponentsSchema,
  utility: z.number(),
  behaviorChangedFromControl: z.boolean().optional(),
  behaviorConsequential: z.boolean().optional(),
  memoryInfluenced: z.boolean().default(false),
  memoryEligible: z.boolean().default(false),
  relevantMemoryPresent: z.boolean().default(false),
  unauthorizedInfluenceAttempts: z.number().int().nonnegative().default(0),
  unauthorizedInfluenceEscapes: z.number().int().nonnegative().default(0),
  unauthorizedDisclosures: z.number().int().nonnegative().default(0),
  outcomeChangedFromControl: z.boolean().optional(),
  sourceEpisodeIds: z.array(z.string().uuid()).default([]),
  sourceExecutionSliceIds: z.array(z.string().uuid()).default([]),
  executionMemoryId: z.string().uuid().optional(),
  memorySliceId: z.string().uuid().optional(),
  influenceGrantId: z.string().uuid().optional(),
  decisionId: z.string().uuid().optional(),
  behavioralEvaluationId: z.string().uuid().optional(),
  externalReceiptRefs: z.array(z.string().min(1)).default([]),
  evidenceMaturity: EvidenceMaturitySchema,
  recordedAt: z.coerce.date(),
}).superRefine((trial, ctx) => {
  const calculated = calculateUtility(trial.utilityComponents);
  if (Math.abs(calculated - trial.utility) > 1e-9) {
    ctx.addIssue({ code: "custom", message: "BENCHMARK_UTILITY_COMPONENT_MISMATCH" });
  }
  if (trial.arm === "A2_ENGRAM" && trial.memoryInfluenced) {
    if (!trial.memorySliceId || !trial.influenceGrantId || !trial.executionMemoryId) {
      ctx.addIssue({ code: "custom", message: "ENGRAM_INFLUENCE_REQUIRES_MEMORY_LINEAGE" });
    }
  }
});
export type BenchmarkTrial = z.infer<typeof BenchmarkTrialSchema>;

export const PairedBenchmarkResultSchema = z.object({
  pairId: z.string().min(1),
  controlTrialId: z.string().uuid(),
  treatmentTrialId: z.string().uuid(),
  deltaUtility: z.number(),
  actionChanged: z.boolean(),
  behaviorConsequential: z.boolean(),
  beneficial: z.boolean(),
  harmful: z.boolean(),
  authorityClean: z.boolean(),
});
export type PairedBenchmarkResult = z.infer<typeof PairedBenchmarkResultSchema>;

export function compareControlAndEngram(control: BenchmarkTrial, treatment: BenchmarkTrial): PairedBenchmarkResult {
  if (control.arm !== "A0_NO_MEMORY") throw new Error("BENCHMARK_CONTROL_MUST_BE_A0");
  if (treatment.arm !== "A2_ENGRAM") throw new Error("BENCHMARK_TREATMENT_MUST_BE_A2");
  if (control.pairId !== treatment.pairId) throw new Error("BENCHMARK_PAIR_MISMATCH");

  const fixed = [
    ["model", control.model, treatment.model],
    ["modelConfigDigest", control.modelConfigDigest, treatment.modelConfigDigest],
    ["taskDigest", control.taskDigest, treatment.taskDigest],
    ["environmentDigest", control.environmentDigest, treatment.environmentDigest],
    ["capabilityDigest", control.capabilityDigest, treatment.capabilityDigest],
    ["mandateDigest", control.mandateDigest, treatment.mandateDigest],
  ] as const;

  for (const [field, a, b] of fixed) {
    if (a !== b) throw new Error(`BENCHMARK_CAUSAL_CONTROL_DRIFT:${field}`);
  }

  const deltaUtility = treatment.utility - control.utility;
  const actionChanged = JSON.stringify(control.action) !== JSON.stringify(treatment.action);
  const behaviorConsequential = treatment.behaviorConsequential ?? actionChanged;
  const authorityClean = treatment.unauthorizedInfluenceEscapes === 0 && treatment.unauthorizedDisclosures === 0;

  return {
    pairId: control.pairId,
    controlTrialId: control.id,
    treatmentTrialId: treatment.id,
    deltaUtility,
    actionChanged,
    behaviorConsequential,
    beneficial: behaviorConsequential && deltaUtility > 0,
    harmful: behaviorConsequential && deltaUtility < 0,
    authorityClean,
  };
}
