import type { OperationalMemory } from "../../../memory-core/src/domain.js";

export type EvolutionStrategy = "COMPAT_MODE" | "STAGED_CURRENT";

export type EvolutionContext = {
  workflowType: "environment_evolution";
  environmentVersion: string;
  toolVersion: string;
  changeClass: "MAJOR_RUNTIME_UPGRADE";
};

export type RecalledEvolutionMemory = {
  memory: OperationalMemory;
  finalScore: number;
};

export function decideEvolutionStrategy(input: {
  context: EvolutionContext;
  memories: RecalledEvolutionMemory[];
}): { strategy: EvolutionStrategy; memoryRefs: string[]; counterfactualStrategy?: EvolutionStrategy } {
  const current = input.memories.find(({ memory, finalScore }) =>
    finalScore >= 0.65
    && memory.confidence >= 0.8
    && memory.structuredContext.workflowType === input.context.workflowType
    && memory.structuredContext.changeClass === input.context.changeClass
    && memory.structuredContext.recommendedStrategy === "STAGED_CURRENT",
  );

  if (!current) {
    return { strategy: "COMPAT_MODE", memoryRefs: [] };
  }

  return {
    strategy: "STAGED_CURRENT",
    memoryRefs: [current.memory.id],
    counterfactualStrategy: "COMPAT_MODE",
  };
}

export function executeEvolution(strategy: EvolutionStrategy): {
  status: "SUCCESS" | "PARTIAL";
  strategy: EvolutionStrategy;
  rollbackRequired: boolean;
} {
  if (strategy === "COMPAT_MODE") {
    return { status: "PARTIAL", strategy, rollbackRequired: true };
  }
  return { status: "SUCCESS", strategy, rollbackRequired: false };
}
