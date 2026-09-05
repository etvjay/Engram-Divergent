import { z } from "zod";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { InfluenceGrant } from "../../memory-core/src/influence-grant.js";
import type { MemorySlice } from "../../memory-core/src/memory-slice.js";
import { BenchmarkArmSchema, type BenchmarkArm } from "../../evaluation/src/benchmark.js";
import type { RenderedMemoryContext } from "./model-adapter.js";

const MemoryFixtureSchema = z.object({
  slice: z.object({
    purpose: z.string().min(1),
    subject: z.string().min(1),
    claims: z.array(z.string().min(1)).min(1),
    applicability: z.record(z.string(), z.unknown()).default({}),
    confidence: z.number().min(0).max(1),
    contradictoryClaim: z.string().min(1).optional(),
  }),
  grant: z.object({
    allowedEffects: z.array(z.string().min(1)).min(1),
    deniedEffects: z.array(z.string().min(1)).default([]),
    constraints: z.record(z.string(), z.unknown()).default({}),
    /** Grant validity window in days relative to the run; omit/<=0 marks expired. */
    validDays: z.number().optional(),
  }),
});

export const BenchmarkScenarioSchema = z.object({
  scenarioId: z.string().min(1),
  version: z.number().int().positive(),
  taskFamily: z.string().min(1),
  description: z.string().min(1),
  fixed: z.object({
    taskDigest: z.string().min(1),
    environmentDigest: z.string().min(1),
    capabilityDigest: z.string().min(1),
    mandateDigest: z.string().min(1),
  }),
  constraints: z.object({
    urgency: z.string().min(1),
    verificationRequired: z.boolean(),
    maxLatencySeconds: z.number().positive(),
    maxBudgetUsd: z.number().positive(),
  }),
  candidateProviders: z.array(z.string().min(1)).min(1),
  providerTerms: z.record(
    z.string(),
    z.object({
      costUsd: z.number().nonnegative(),
      expectedLatencySeconds: z.number().nonnegative(),
      knownSlaBreachRisk: z.boolean().default(false),
    }),
  ),
  requiredArms: z.array(BenchmarkArmSchema).min(2),
  utility: z.object({ components: z.array(z.string().min(1)).min(1) }),
  memory: z.object({
    rawHistoryText: z.string().min(1),
    engram: MemoryFixtureSchema,
    irrelevant: MemoryFixtureSchema,
    staleOrContradictory: MemoryFixtureSchema,
  }),
});
export type BenchmarkScenario = z.infer<typeof BenchmarkScenarioSchema>;

export function loadBenchmarkScenario(path: string): BenchmarkScenario {
  return BenchmarkScenarioSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function scenarioCandidates(scenario: BenchmarkScenario) {
  return scenario.candidateProviders.map((providerId) => {
    const terms = scenario.providerTerms[providerId];
    if (!terms) throw new Error(`BENCHMARK_SCENARIO_PROVIDER_TERMS_MISSING:${providerId}`);
    return {
      providerId,
      costUsd: terms.costUsd,
      expectedLatencySeconds: terms.expectedLatencySeconds,
      knownSlaBreachRisk: terms.knownSlaBreachRisk,
    };
  });
}

interface MaterializeInput {
  executionId: string;
  consumerAgentId: string;
  now: Date;
}

function fixtureSlice(
  scenario: BenchmarkScenario,
  fixture: { slice: { purpose: string; subject: string; claims: string[]; applicability: Record<string, unknown>; confidence: number; contradictoryClaim?: string } },
  ctx: MaterializeInput,
  expiresAt: Date | undefined,
): MemorySlice {
  const claims = fixture.slice.contradictoryClaim
    ? [...fixture.slice.claims, fixture.slice.contradictoryClaim]
    : fixture.slice.claims;
  return {
    id: randomUUID(),
    executionMemoryIds: [randomUUID()],
    consumerAgentId: ctx.consumerAgentId,
    consumerExecutionId: ctx.executionId,
    purpose: fixture.slice.purpose,
    subject: fixture.slice.subject,
    claims,
    applicability: fixture.slice.applicability,
    evidenceRefs: [],
    confidence: fixture.slice.confidence,
    disclosureScope: [],
    redactedFields: [],
    derivedAt: ctx.now,
    expiresAt,
  };
}

function fixtureGrant(
  fixtureGrantDef: { allowedEffects: string[]; deniedEffects: string[]; constraints: Record<string, unknown>; validDays?: number },
  slice: MemorySlice,
  ctx: MaterializeInput,
): InfluenceGrant {
  const validDays = fixtureGrantDef.validDays ?? 7;
  const expired = validDays <= 0;
  const issuedAt = new Date(ctx.now.getTime() - (expired ? (Math.abs(validDays) + 1) * 86_400_000 : 0));
  return {
    id: randomUUID(),
    memorySliceId: slice.id,
    consumerAgentId: ctx.consumerAgentId,
    consumerExecutionId: ctx.executionId,
    allowedEffects: fixtureGrantDef.allowedEffects,
    deniedEffects: fixtureGrantDef.deniedEffects,
    constraints: fixtureGrantDef.constraints,
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + Math.max(validDays, 0.001) * 86_400_000),
  };
}

/**
 * Builds the per-arm memory condition. Same task/model/tools/mandate on every
 * call — only the rendered memory differs, which is the causal intervention.
 */
export function materializeArmMemory(
  scenario: BenchmarkScenario,
  arm: BenchmarkArm,
  ctx: MaterializeInput,
): RenderedMemoryContext {
  const empty = { slices: [], grants: [], eligibleGrantIds: [] as string[] };
  switch (arm) {
    case "A0_NO_MEMORY":
      return { arm, ...empty };
    case "A1_RAW_HISTORY":
      return { arm, rawHistoryText: scenario.memory.rawHistoryText, ...empty };
    case "A2_ENGRAM": {
      const slice = fixtureSlice(scenario, scenario.memory.engram, ctx, new Date(ctx.now.getTime() + 7 * 86_400_000));
      const grant = fixtureGrant(scenario.memory.engram.grant, slice, ctx);
      return { arm, slices: [slice], grants: [grant], eligibleGrantIds: [grant.id] };
    }
    case "A3_IRRELEVANT_MEMORY": {
      const slice = fixtureSlice(scenario, scenario.memory.irrelevant, ctx, new Date(ctx.now.getTime() + 7 * 86_400_000));
      const grant = fixtureGrant(scenario.memory.irrelevant.grant, slice, ctx);
      return { arm, slices: [slice], grants: [grant], eligibleGrantIds: [grant.id] };
    }
    case "A4_STALE_OR_CONTRADICTORY": {
      // Expired grant + contradictory claim: the runner pre-disqualifies it.
      const slice = fixtureSlice(scenario, scenario.memory.staleOrContradictory, ctx, new Date(ctx.now.getTime() - 86_400_000));
      const grant = fixtureGrant(scenario.memory.staleOrContradictory.grant, slice, ctx);
      return { arm, slices: [slice], grants: [grant], eligibleGrantIds: [] };
    }
    default: {
      const exhaustive: never = arm;
      throw new Error(`BENCHMARK_UNKNOWN_ARM:${String(exhaustive)}`);
    }
  }
}
