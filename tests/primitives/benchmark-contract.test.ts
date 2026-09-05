import { describe, expect, it } from "vitest";
import {
  BenchmarkTrialSchema,
  compareControlAndEngram,
} from "../../packages/evaluation/src/benchmark.js";

const IDS = {
  control: "10000000-0000-4000-8000-000000000001",
  treatment: "10000000-0000-4000-8000-000000000002",
  memory: "10000000-0000-4000-8000-000000000003",
  memorySlice: "10000000-0000-4000-8000-000000000004",
  grant: "10000000-0000-4000-8000-000000000005",
};

function baseTrial(arm: "A0_NO_MEMORY" | "A2_ENGRAM") {
  const influenced = arm === "A2_ENGRAM";
  return {
    id: arm === "A0_NO_MEMORY" ? IDS.control : IDS.treatment,
    pairId: "provider-urgent-001",
    scenarioId: "provider-urgent",
    arm,
    model: "qwen2.5",
    modelConfigDigest: "model-config-v1",
    taskDigest: "task-v1",
    environmentDigest: "env-v1",
    capabilityDigest: "caps-v1",
    mandateDigest: "mandate-v1",
    action: influenced ? { provider: "beacon" } : { provider: "atlas" },
    outcome: influenced ? { status: "SUCCESS" } : { status: "FAILURE" },
    utilityComponents: influenced
      ? { successValue: 1, costPenalty: 0.1, latencyPenalty: 0.05 }
      : { successValue: 0, costPenalty: 0.1, latencyPenalty: 0.4, verificationFailurePenalty: 0.5 },
    utility: influenced ? 0.85 : -1,
    behaviorChangedFromControl: influenced,
    behaviorConsequential: influenced,
    memoryInfluenced: influenced,
    memoryEligible: influenced,
    relevantMemoryPresent: influenced,
    unauthorizedInfluenceEscapes: 0,
    unauthorizedDisclosures: 0,
    sourceEpisodeIds: [],
    sourceExecutionSliceIds: [],
    executionMemoryId: influenced ? IDS.memory : undefined,
    memorySliceId: influenced ? IDS.memorySlice : undefined,
    influenceGrantId: influenced ? IDS.grant : undefined,
    externalReceiptRefs: [],
    evidenceMaturity: "LOCAL_PASS",
    recordedAt: new Date("2026-09-05T09:00:00Z"),
  } as const;
}

describe("Engram execution-memory benchmark contract", () => {
  it("computes causal utility uplift for a matched A0/A2 pair", () => {
    const control = BenchmarkTrialSchema.parse(baseTrial("A0_NO_MEMORY"));
    const treatment = BenchmarkTrialSchema.parse(baseTrial("A2_ENGRAM"));
    const result = compareControlAndEngram(control, treatment);

    expect(result.deltaUtility).toBeCloseTo(1.85);
    expect(result.actionChanged).toBe(true);
    expect(result.behaviorConsequential).toBe(true);
    expect(result.beneficial).toBe(true);
    expect(result.harmful).toBe(false);
    expect(result.authorityClean).toBe(true);
  });

  it("rejects utility values that do not reconcile from exposed components", () => {
    expect(() => BenchmarkTrialSchema.parse({
      ...baseTrial("A0_NO_MEMORY"),
      utility: 999,
    })).toThrow("BENCHMARK_UTILITY_COMPONENT_MISMATCH");
  });

  it("rejects causal pairs when the model changes", () => {
    const control = BenchmarkTrialSchema.parse(baseTrial("A0_NO_MEMORY"));
    const treatment = BenchmarkTrialSchema.parse({
      ...baseTrial("A2_ENGRAM"),
      model: "another-model",
    });

    expect(() => compareControlAndEngram(control, treatment)).toThrow("BENCHMARK_CAUSAL_CONTROL_DRIFT:model");
  });

  it("requires lineage when Engram is credited with influence", () => {
    expect(() => BenchmarkTrialSchema.parse({
      ...baseTrial("A2_ENGRAM"),
      memorySliceId: undefined,
    })).toThrow("ENGRAM_INFLUENCE_REQUIRES_MEMORY_LINEAGE");
  });

  it("counts changed behavior with lower utility as harmful", () => {
    const control = BenchmarkTrialSchema.parse(baseTrial("A0_NO_MEMORY"));
    const treatment = BenchmarkTrialSchema.parse({
      ...baseTrial("A2_ENGRAM"),
      utilityComponents: {
        successValue: 0,
        costPenalty: 1,
        latencyPenalty: 1,
      },
      utility: -2,
    });

    const result = compareControlAndEngram(control, treatment);
    expect(result.beneficial).toBe(false);
    expect(result.harmful).toBe(true);
  });
});
