import type { OperationalMemory } from "../../../memory-core/src/domain.js";

export type DeploymentStrategy = "PARALLEL_MIGRATE_AND_DEPLOY" | "MIGRATE_THEN_DEPLOY";

export type DeploymentContext = {
  workflowType: "software_deployment";
  service: string;
  migrationTouchesHotTable: boolean;
  environmentVersion: string;
};

export type DeploymentDecision = {
  strategy: DeploymentStrategy;
  memoryRefs: string[];
  reason: string;
  counterfactualStrategy?: DeploymentStrategy;
};

export type DeploymentResult = {
  status: "SUCCESS" | "COMPENSATED";
  strategy: DeploymentStrategy;
  failureType?: "MIGRATION_LOCK_CONTENTION";
  recovery?: "ROLLBACK_RELEASE";
  customerImpact: "NONE" | "ELEVATED_ERRORS";
};

export type RecalledDeploymentMemory = {
  memory: OperationalMemory;
  finalScore: number;
};

const BASELINE_STRATEGY: DeploymentStrategy = "PARALLEL_MIGRATE_AND_DEPLOY";
const SAFE_STRATEGY: DeploymentStrategy = "MIGRATE_THEN_DEPLOY";

export function decideDeploymentStrategy(input: {
  context: DeploymentContext;
  memories: RecalledDeploymentMemory[];
}): DeploymentDecision {
  const relevant = input.memories.find(({ memory, finalScore }) => {
    const context = memory.structuredContext;
    return finalScore >= 0.65
      && memory.confidence >= 0.8
      && context.workflowType === input.context.workflowType
      && context.failureType === "MIGRATION_LOCK_CONTENTION"
      && context.migrationTouchesHotTable === true
      && input.context.migrationTouchesHotTable;
  });

  if (!relevant) {
    return {
      strategy: BASELINE_STRATEGY,
      memoryRefs: [],
      reason: "No eligible prior execution memory constrains the baseline deployment strategy.",
    };
  }

  return {
    strategy: SAFE_STRATEGY,
    memoryRefs: [relevant.memory.id],
    counterfactualStrategy: BASELINE_STRATEGY,
    reason: "A comparable prior execution observed migration lock contention during parallel rollout, so the application selects a sequential migration strategy.",
  };
}

export function executeDeployment(
  strategy: DeploymentStrategy,
  context: DeploymentContext,
): DeploymentResult {
  if (strategy === BASELINE_STRATEGY && context.migrationTouchesHotTable) {
    return {
      status: "COMPENSATED",
      strategy,
      failureType: "MIGRATION_LOCK_CONTENTION",
      recovery: "ROLLBACK_RELEASE",
      customerImpact: "ELEVATED_ERRORS",
    };
  }

  return {
    status: "SUCCESS",
    strategy,
    customerImpact: "NONE",
  };
}
