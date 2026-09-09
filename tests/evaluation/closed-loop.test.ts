import { describe, expect, it } from "vitest";
import { aggregateLongitudinal, utilityForOutcome, type LongitudinalObservation } from "../../packages/evaluation/src/closed-loop.js";

describe("closed-loop longitudinal evaluation", () => {
  it("computes explicit outcome utility", () => {
    expect(utilityForOutcome({ outcome: "SUCCESS", costPenalty: 0.1, latencyPenalty: 0.05 })).toBeCloseTo(0.85);
    expect(utilityForOutcome({ outcome: "FAILURE" })).toBe(-1);
  });

  it("reports A5 versus A2 without requiring positive uplift", () => {
    const observations: LongitudinalObservation[] = [
      { runId: "r1", executionId: "e0", arm: "A0_NO_MEMORY", seed: 1, action: { tool: "a" }, outcome: "FAILURE", utility: -1, influenced: false, unauthorizedAttempts: 0, unauthorizedEscapes: 0 },
      { runId: "r1", executionId: "e2", arm: "A2_INITIAL_ENGRAM_MEMORY", seed: 1, action: { tool: "b" }, outcome: "SUCCESS", utility: 0.8, memoryId: "m1", influenced: true, unauthorizedAttempts: 0, unauthorizedEscapes: 0 },
      { runId: "r1", executionId: "e5", arm: "A5_EVALUATED_UPDATED_MEMORY", seed: 1, action: { tool: "a" }, outcome: "SUCCESS", utility: 0.9, memoryId: "m2", influenced: true, unauthorizedAttempts: 0, unauthorizedEscapes: 0 },
    ];
    const result = aggregateLongitudinal(observations);
    expect(result.deltaUA2A0).toBeCloseTo(1.8);
    expect(result.deltaUA5A2).toBeCloseTo(0.1);
    expect(result.byArm.A5_EVALUATED_UPDATED_MEMORY.count).toBe(1);
    expect(result.unauthorizedEscapes).toBe(0);
  });
});
