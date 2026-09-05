import type { OperationalMemory } from "../../../memory-core/src/domain.js";

export type RecoveryStrategy = "RESTART_ALL" | "ISOLATE_DRAIN_STAGED_RESTART";

export type IncidentContext = {
  workflowType: "incident_response";
  service: string;
  failureMode: "SATURATED_DEPENDENCY" | "OTHER";
  fleetSize: "SMALL" | "LARGE";
  environmentVersion: string;
};

export type RecoveryDecision = {
  strategy: RecoveryStrategy;
  memoryRefs: string[];
  reason: string;
  counterfactualStrategy?: RecoveryStrategy;
};

export type RecoveryResult = {
  status: "SUCCESS" | "PARTIAL";
  strategy: RecoveryStrategy;
  secondaryFailure?: "THUNDERING_HERD";
  timeToRecoveryMinutes: number;
  customerImpact: "CONTAINED" | "PROLONGED";
};

export type RecalledIncidentMemory = {
  memory: OperationalMemory;
  finalScore: number;
};

const BASELINE: RecoveryStrategy = "RESTART_ALL";
const STAGED: RecoveryStrategy = "ISOLATE_DRAIN_STAGED_RESTART";

export function decideRecoveryStrategy(input: {
  context: IncidentContext;
  memories: RecalledIncidentMemory[];
}): RecoveryDecision {
  const relevant = input.memories.find(({ memory, finalScore }) => {
    const context = memory.structuredContext;
    return finalScore >= 0.65
      && memory.confidence >= 0.8
      && context.workflowType === input.context.workflowType
      && context.failureMode === "SATURATED_DEPENDENCY"
      && context.recoveryStrategy === "RESTART_ALL"
      && context.secondaryFailure === "THUNDERING_HERD"
      && input.context.failureMode === "SATURATED_DEPENDENCY"
      && input.context.fleetSize === "LARGE";
  });

  if (!relevant) {
    return {
      strategy: BASELINE,
      memoryRefs: [],
      reason: "No applicable prior recovery memory constrains the restart-all baseline.",
    };
  }

  return {
    strategy: STAGED,
    memoryRefs: [relevant.memory.id],
    counterfactualStrategy: BASELINE,
    reason: "A prior large-fleet restart under dependency saturation produced a thundering herd, so the operator application selects isolation, drain, and staged restart.",
  };
}

export function executeRecovery(strategy: RecoveryStrategy, context: IncidentContext): RecoveryResult {
  if (strategy === BASELINE && context.failureMode === "SATURATED_DEPENDENCY" && context.fleetSize === "LARGE") {
    return {
      status: "PARTIAL",
      strategy,
      secondaryFailure: "THUNDERING_HERD",
      timeToRecoveryMinutes: 24,
      customerImpact: "PROLONGED",
    };
  }

  return {
    status: "SUCCESS",
    strategy,
    timeToRecoveryMinutes: strategy === STAGED ? 9 : 6,
    customerImpact: "CONTAINED",
  };
}
