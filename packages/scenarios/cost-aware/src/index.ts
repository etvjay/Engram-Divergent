import type { OperationalMemory } from "../../../memory-core/src/domain.js";

export type ComputeStrategy = "FULL_RECOMPUTE" | "INCREMENTAL_REUSE";

export type ComputeContext = {
  workflowType: "analysis_compute";
  datasetClass: "STABLE_WITH_SMALL_DELTA" | "VOLATILE";
  freshnessRequirement: "STANDARD" | "STRICT_FULL_REBUILD";
  environmentVersion: string;
};

export type ComputeDecision = {
  strategy: ComputeStrategy;
  memoryRefs: string[];
  reason: string;
  counterfactualStrategy?: ComputeStrategy;
};

export type ComputeResult = {
  status: "SUCCESS";
  strategy: ComputeStrategy;
  costUnits: number;
  outputQuality: "ACCEPTED";
};

export type RecalledCostMemory = {
  memory: OperationalMemory;
  finalScore: number;
};

const BASELINE: ComputeStrategy = "FULL_RECOMPUTE";
const LOWER_COST: ComputeStrategy = "INCREMENTAL_REUSE";

export function decideComputeStrategy(input: {
  context: ComputeContext;
  memories: RecalledCostMemory[];
}): ComputeDecision {
  const costLesson = input.memories.find(({ memory, finalScore }) => {
    const context = memory.structuredContext;
    return finalScore >= 0.65
      && memory.confidence >= 0.8
      && context.workflowType === input.context.workflowType
      && context.signalType === "SIGNIFICANT_COST"
      && context.datasetClass === input.context.datasetClass
      && context.expensiveStrategy === BASELINE
      && context.preferredStrategy === LOWER_COST
      && input.context.datasetClass === "STABLE_WITH_SMALL_DELTA"
      && input.context.freshnessRequirement === "STANDARD";
  });

  if (!costLesson) {
    return {
      strategy: BASELINE,
      memoryRefs: [],
      reason: "No applicable prior cost memory constrains the full-recompute baseline.",
    };
  }

  return {
    strategy: LOWER_COST,
    memoryRefs: [costLesson.memory.id],
    counterfactualStrategy: BASELINE,
    reason: "A comparable successful execution produced acceptable output at disproportionate full-recompute cost, so the application reuses verified prior work and computes only the delta.",
  };
}

export function executeCompute(strategy: ComputeStrategy, context: ComputeContext): ComputeResult {
  if (strategy === LOWER_COST && context.datasetClass === "STABLE_WITH_SMALL_DELTA" && context.freshnessRequirement === "STANDARD") {
    return { status: "SUCCESS", strategy, costUnits: 18, outputQuality: "ACCEPTED" };
  }
  return { status: "SUCCESS", strategy: BASELINE, costUnits: 120, outputQuality: "ACCEPTED" };
}
