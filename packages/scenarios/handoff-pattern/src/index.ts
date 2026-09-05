import type { OperationalMemory } from "../../../memory-core/src/domain.js";

export type HandoffStrategy = "MINIMAL_HANDOFF" | "CONSTRAINT_COMPLETE_HANDOFF";

export type HandoffContext = {
  workflowType: "multi_agent_handoff_pattern";
  rolePair: "PLANNER_EXECUTOR" | "RESEARCHER_WRITER";
  artifactClass: "CHANGE_PLAN" | "ANALYSIS_MEMO";
  constraintVisibility: "IMPLICIT" | "EXPLICIT";
  environmentVersion: string;
};

export type RecalledHandoffMemory = {
  memory: OperationalMemory;
  finalScore: number;
};

export type HandoffDecision = {
  strategy: HandoffStrategy;
  memoryRefs: string[];
  reason: string;
  counterfactualStrategy?: HandoffStrategy;
};

export type HandoffResult = {
  status: "SUCCESS";
  strategy: HandoffStrategy;
  clarificationRounds: number;
  coordinationLatencyMinutes: number;
  outputAccepted: true;
};

const BASELINE: HandoffStrategy = "MINIMAL_HANDOFF";
const COMPLETE: HandoffStrategy = "CONSTRAINT_COMPLETE_HANDOFF";

export function decideHandoffStrategy(input: {
  context: HandoffContext;
  memories: RecalledHandoffMemory[];
}): HandoffDecision {
  const pattern = input.memories.find(({ memory, finalScore }) => {
    const context = memory.structuredContext;
    return memory.memoryType === "REPEATED_PATTERN"
      && finalScore >= 0.65
      && memory.confidence >= 0.8
      && context.pattern === "MISSING_CONSTRAINTS_CAUSES_CLARIFICATION"
      && context.workflowType === input.context.workflowType
      && context.rolePair === input.context.rolePair
      && context.artifactClass === input.context.artifactClass
      && context.constraintVisibility === input.context.constraintVisibility
      && context.baselineStrategy === BASELINE
      && context.recommendedStrategy === COMPLETE
      && input.context.constraintVisibility === "IMPLICIT";
  });

  if (!pattern) {
    return {
      strategy: BASELINE,
      memoryRefs: [],
      reason: "No applicable repeated handoff pattern constrains the minimal handoff baseline.",
    };
  }

  return {
    strategy: COMPLETE,
    memoryRefs: [pattern.memory.id],
    counterfactualStrategy: BASELINE,
    reason: "Repeated comparable handoffs required clarification, so the planner supplies constraints explicitly before delegation.",
  };
}

export function executeHandoff(
  strategy: HandoffStrategy,
  context: HandoffContext,
): HandoffResult {
  const clarificationRequired = strategy === BASELINE
    && context.rolePair === "PLANNER_EXECUTOR"
    && context.artifactClass === "CHANGE_PLAN"
    && context.constraintVisibility === "IMPLICIT";

  if (clarificationRequired) {
    return {
      status: "SUCCESS",
      strategy,
      clarificationRounds: 2,
      coordinationLatencyMinutes: 14,
      outputAccepted: true,
    };
  }

  return {
    status: "SUCCESS",
    strategy,
    clarificationRounds: 0,
    coordinationLatencyMinutes: 5,
    outputAccepted: true,
  };
}
