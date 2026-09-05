import type { OperationalMemory } from "../../../memory-core/src/domain.js";

export type CoordinationStrategy = "PARALLEL_UNLEASED" | "LEASED_SERIALIZATION";

export type CoordinationContext = {
  workflowType: "multi_agent_coordination";
  resourceClass: "SHARED_MUTABLE_ARTIFACT" | "INDEPENDENT_ARTIFACTS";
  contentionMode: "SAME_TARGET" | "DISTINCT_TARGETS";
  environmentVersion: string;
};

export type CoordinationDecision = {
  strategy: CoordinationStrategy;
  memoryRefs: string[];
  reason: string;
  counterfactualStrategy?: CoordinationStrategy;
};

export type CoordinationResult = {
  status: "SUCCESS" | "PARTIAL";
  strategy: CoordinationStrategy;
  workerResults: Array<{ workerId: string; state: "COMMITTED" | "CONFLICTED" }>;
  conflictType?: "CONCURRENT_WRITE_CONFLICT";
};

export type RecalledCoordinationMemory = {
  memory: OperationalMemory;
  finalScore: number;
};

const BASELINE: CoordinationStrategy = "PARALLEL_UNLEASED";
const SAFE: CoordinationStrategy = "LEASED_SERIALIZATION";

export function decideCoordinationStrategy(input: {
  context: CoordinationContext;
  memories: RecalledCoordinationMemory[];
}): CoordinationDecision {
  const lesson = input.memories.find(({ memory, finalScore }) => {
    const context = memory.structuredContext;
    return finalScore >= 0.65
      && memory.confidence >= 0.8
      && context.workflowType === input.context.workflowType
      && context.failureType === "CONCURRENT_WRITE_CONFLICT"
      && context.resourceClass === input.context.resourceClass
      && context.contentionMode === input.context.contentionMode
      && context.failedStrategy === BASELINE
      && context.recommendedStrategy === SAFE
      && input.context.resourceClass === "SHARED_MUTABLE_ARTIFACT"
      && input.context.contentionMode === "SAME_TARGET";
  });

  if (!lesson) {
    return {
      strategy: BASELINE,
      memoryRefs: [],
      reason: "No applicable coordinator-owned execution memory constrains parallel dispatch.",
    };
  }

  return {
    strategy: SAFE,
    memoryRefs: [lesson.memory.id],
    counterfactualStrategy: BASELINE,
    reason: "A comparable coordinator execution observed workers racing on the same mutable target, so the coordinator acquires a lease and serializes commits.",
  };
}

export function executeCoordination(
  strategy: CoordinationStrategy,
  context: CoordinationContext,
): CoordinationResult {
  if (
    strategy === BASELINE
    && context.resourceClass === "SHARED_MUTABLE_ARTIFACT"
    && context.contentionMode === "SAME_TARGET"
  ) {
    return {
      status: "PARTIAL",
      strategy,
      conflictType: "CONCURRENT_WRITE_CONFLICT",
      workerResults: [
        { workerId: "worker-a", state: "COMMITTED" },
        { workerId: "worker-b", state: "CONFLICTED" },
      ],
    };
  }

  return {
    status: "SUCCESS",
    strategy,
    workerResults: [
      { workerId: "worker-a", state: "COMMITTED" },
      { workerId: "worker-b", state: "COMMITTED" },
    ],
  };
}
