import type { OperationalMemory } from "../../../memory-core/src/domain.js";

export type MaintenanceStrategy = "IMMEDIATE_BLOCKING_REBUILD" | "ONLINE_STAGED_REBUILD";

export type MaintenanceContext = {
  workflowType: "production_maintenance";
  resourceType: "DATABASE_INDEX" | "OTHER";
  trafficClass: "PEAK" | "OFF_PEAK";
  environmentVersion: string;
};

export type MaintenanceDecision = {
  strategy: MaintenanceStrategy;
  memoryRefs: string[];
  reason: string;
  counterfactualStrategy?: MaintenanceStrategy;
};

export type RecalledCorrectionMemory = {
  memory: OperationalMemory;
  finalScore: number;
};

const BASELINE: MaintenanceStrategy = "IMMEDIATE_BLOCKING_REBUILD";
const CORRECTED: MaintenanceStrategy = "ONLINE_STAGED_REBUILD";

export function decideMaintenanceStrategy(input: {
  context: MaintenanceContext;
  memories: RecalledCorrectionMemory[];
}): MaintenanceDecision {
  const correction = input.memories.find(({ memory, finalScore }) => {
    const context = memory.structuredContext;
    return finalScore >= 0.65
      && memory.confidence >= 0.8
      && context.workflowType === input.context.workflowType
      && context.correctionType === "HUMAN_CORRECTION"
      && context.resourceType === input.context.resourceType
      && context.trafficClass === input.context.trafficClass
      && context.rejectedStrategy === BASELINE
      && context.correctedStrategy === CORRECTED;
  });

  if (!correction) {
    return {
      strategy: BASELINE,
      memoryRefs: [],
      reason: "No applicable prior human correction constrains the maintenance baseline.",
    };
  }

  return {
    strategy: CORRECTED,
    memoryRefs: [correction.memory.id],
    counterfactualStrategy: BASELINE,
    reason: "A prior human correction rejected blocking maintenance under the same operating conditions, so the application selects an online staged rebuild.",
  };
}
