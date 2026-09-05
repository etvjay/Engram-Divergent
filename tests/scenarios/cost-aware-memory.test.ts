import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OperationalMemory } from "../../packages/memory-core/src/domain.js";
import {
  decideComputeStrategy,
  executeCompute,
  type ComputeContext,
} from "../../packages/scenarios/cost-aware/src/index.js";

const context: ComputeContext = {
  workflowType: "analysis_compute",
  datasetClass: "STABLE_WITH_SMALL_DELTA",
  freshnessRequirement: "STANDARD",
  environmentVersion: "analysis-v4",
};

function costlySuccessMemory(): OperationalMemory {
  return {
    id: randomUUID(),
    agentId: "analysis-agent",
    memoryType: "OPERATIONAL_LESSON",
    summary: "Full recompute succeeded and produced accepted output, but cost 120 units on a stable dataset with a small delta; reuse verified prior artifacts and compute only the delta next time.",
    structuredContext: {
      workflowType: "analysis_compute",
      signalType: "SIGNIFICANT_COST",
      datasetClass: "STABLE_WITH_SMALL_DELTA",
      expensiveStrategy: "FULL_RECOMPUTE",
      preferredStrategy: "INCREMENTAL_REUSE",
      priorCostUnits: 120,
      outcome: "SUCCESS",
    },
    confidence: 0.94,
    evidenceState: "OBSERVED",
    environmentVersion: "analysis-v4",
  };
}

describe("costly-success execution-memory scenario", () => {
  it("changes a comparable successful task to the lower-cost strategy", () => {
    const control = decideComputeStrategy({ context, memories: [] });
    expect(control.strategy).toBe("FULL_RECOMPUTE");
    expect(executeCompute(control.strategy, context)).toEqual({
      status: "SUCCESS",
      strategy: "FULL_RECOMPUTE",
      costUnits: 120,
      outputQuality: "ACCEPTED",
    });

    const memory = costlySuccessMemory();
    const treatment = decideComputeStrategy({
      context,
      memories: [{ memory, finalScore: 0.98 }],
    });

    expect(treatment.strategy).toBe("INCREMENTAL_REUSE");
    expect(treatment.counterfactualStrategy).toBe("FULL_RECOMPUTE");
    expect(treatment.memoryRefs).toEqual([memory.id]);
    expect(executeCompute(treatment.strategy, context)).toEqual({
      status: "SUCCESS",
      strategy: "INCREMENTAL_REUSE",
      costUnits: 18,
      outputQuality: "ACCEPTED",
    });
  });

  it("does not reuse the cost lesson when strict freshness requires a full rebuild", () => {
    const decision = decideComputeStrategy({
      context: { ...context, freshnessRequirement: "STRICT_FULL_REBUILD" },
      memories: [{ memory: costlySuccessMemory(), finalScore: 0.99 }],
    });
    expect(decision.strategy).toBe("FULL_RECOMPUTE");
    expect(decision.memoryRefs).toEqual([]);
  });

  it("does not overgeneralize a stable-delta cost lesson to volatile data", () => {
    const decision = decideComputeStrategy({
      context: { ...context, datasetClass: "VOLATILE" },
      memories: [{ memory: costlySuccessMemory(), finalScore: 0.99 }],
    });
    expect(decision.strategy).toBe("FULL_RECOMPUTE");
    expect(decision.memoryRefs).toEqual([]);
  });
});
