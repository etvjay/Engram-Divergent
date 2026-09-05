import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OperationalMemory } from "../../packages/memory-core/src/domain.js";
import {
  decideHandoffStrategy,
  executeHandoff,
  type HandoffContext,
} from "../../packages/scenarios/handoff-pattern/src/index.js";

function patternMemory(overrides: Partial<OperationalMemory> = {}): OperationalMemory {
  return {
    id: randomUUID(),
    agentId: "handoff-coordinator",
    memoryType: "REPEATED_PATTERN",
    summary: "Comparable planner-to-executor handoffs repeatedly required clarification when constraints were implicit.",
    structuredContext: {
      pattern: "MISSING_CONSTRAINTS_CAUSES_CLARIFICATION",
      workflowType: "multi_agent_handoff_pattern",
      rolePair: "PLANNER_EXECUTOR",
      artifactClass: "CHANGE_PLAN",
      constraintVisibility: "IMPLICIT",
      baselineStrategy: "MINIMAL_HANDOFF",
      recommendedStrategy: "CONSTRAINT_COMPLETE_HANDOFF",
      sourceExecutionIds: [randomUUID(), randomUUID(), randomUUID()],
    },
    confidence: 0.94,
    evidenceState: "OBSERVED",
    validFrom: new Date(),
    ...overrides,
  };
}

const comparable: HandoffContext = {
  workflowType: "multi_agent_handoff_pattern",
  rolePair: "PLANNER_EXECUTOR",
  artifactClass: "CHANGE_PLAN",
  constraintVisibility: "IMPLICIT",
  environmentVersion: "handoff-v1",
};

describe("repeated handoff-pattern memory", () => {
  it("changes a comparable later handoff from minimal to constraint-complete", () => {
    const baseline = decideHandoffStrategy({ context: comparable, memories: [] });
    expect(baseline.strategy).toBe("MINIMAL_HANDOFF");
    expect(executeHandoff(baseline.strategy, comparable)).toMatchObject({
      status: "SUCCESS",
      clarificationRounds: 2,
      coordinationLatencyMinutes: 14,
    });

    const memory = patternMemory();
    const treatment = decideHandoffStrategy({
      context: comparable,
      memories: [{ memory, finalScore: 0.98 }],
    });
    expect(treatment.strategy).toBe("CONSTRAINT_COMPLETE_HANDOFF");
    expect(treatment.memoryRefs).toEqual([memory.id]);
    expect(executeHandoff(treatment.strategy, comparable)).toMatchObject({
      status: "SUCCESS",
      clarificationRounds: 0,
      coordinationLatencyMinutes: 5,
    });
  });

  it("does not apply the pattern to another role pair despite a high score", () => {
    const context: HandoffContext = {
      ...comparable,
      rolePair: "RESEARCHER_WRITER",
      artifactClass: "ANALYSIS_MEMO",
    };
    const decision = decideHandoffStrategy({
      context,
      memories: [{ memory: patternMemory(), finalScore: 0.99 }],
    });
    expect(decision.strategy).toBe("MINIMAL_HANDOFF");
  });

  it("does not apply an implicit-constraint lesson when current constraints are explicit", () => {
    const context: HandoffContext = {
      ...comparable,
      constraintVisibility: "EXPLICIT",
    };
    const decision = decideHandoffStrategy({
      context,
      memories: [{ memory: patternMemory(), finalScore: 0.99 }],
    });
    expect(decision.strategy).toBe("MINIMAL_HANDOFF");
    expect(executeHandoff(decision.strategy, context).clarificationRounds).toBe(0);
  });
});
