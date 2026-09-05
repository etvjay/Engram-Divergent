import type { OperationalMemory } from "../../../memory-core/src/domain.js";

export type CodingStrategy = "PATCH_FIRST" | "REGRESSION_TEST_THEN_PATCH";

export type CodingContext = {
  workflowType: "autonomous_coding";
  repository: string;
  subsystem: string;
  behaviorIsImplicit: boolean;
  environmentVersion: string;
};

export type CodingDecision = {
  strategy: CodingStrategy;
  memoryRefs: string[];
  reason: string;
  counterfactualStrategy?: CodingStrategy;
};

export type CodingResult = {
  status: "SUCCESS" | "COMPENSATED";
  strategy: CodingStrategy;
  failureType?: "BEHAVIORAL_REGRESSION";
  recovery?: "REVERT_PATCH";
  regressionTestAdded: boolean;
};

export type RecalledCodingMemory = {
  memory: OperationalMemory;
  finalScore: number;
};

const BASELINE: CodingStrategy = "PATCH_FIRST";
const TEST_FIRST: CodingStrategy = "REGRESSION_TEST_THEN_PATCH";

export function decideCodingStrategy(input: {
  context: CodingContext;
  memories: RecalledCodingMemory[];
}): CodingDecision {
  const relevant = input.memories.find(({ memory, finalScore }) => {
    const context = memory.structuredContext;
    return finalScore >= 0.65
      && memory.confidence >= 0.8
      && context.workflowType === input.context.workflowType
      && context.failureType === "BEHAVIORAL_REGRESSION"
      && context.subsystem === input.context.subsystem
      && context.behaviorWasImplicit === true
      && input.context.behaviorIsImplicit;
  });

  if (!relevant) {
    return {
      strategy: BASELINE,
      memoryRefs: [],
      reason: "No applicable prior execution memory constrains the patch-first baseline.",
    };
  }

  return {
    strategy: TEST_FIRST,
    memoryRefs: [relevant.memory.id],
    counterfactualStrategy: BASELINE,
    reason: "A comparable prior patch regressed implicit behavior, so the coding agent pins the behavior with a regression test before modifying it.",
  };
}

export function executeCodingTask(strategy: CodingStrategy, context: CodingContext): CodingResult {
  if (strategy === BASELINE && context.behaviorIsImplicit) {
    return {
      status: "COMPENSATED",
      strategy,
      failureType: "BEHAVIORAL_REGRESSION",
      recovery: "REVERT_PATCH",
      regressionTestAdded: false,
    };
  }

  return {
    status: "SUCCESS",
    strategy,
    regressionTestAdded: strategy === TEST_FIRST,
  };
}
