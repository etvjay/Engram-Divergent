import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OperationalMemory } from "../../packages/memory-core/src/domain.js";
import {
  decideCodingStrategy,
  executeCodingTask,
  type CodingContext,
} from "../../packages/scenarios/coding/src/index.js";

const context: CodingContext = {
  workflowType: "autonomous_coding",
  repository: "engram-fixture",
  subsystem: "parser",
  behaviorIsImplicit: true,
  environmentVersion: "repo-v2",
};

function priorRegressionMemory(overrides: Partial<OperationalMemory> = {}): OperationalMemory {
  return {
    id: randomUUID(),
    agentId: "coding-agent",
    memoryType: "OPERATIONAL_LESSON",
    summary: "A parser patch changed implicit behavior without a regression fixture; CI caught the regression and the patch was reverted.",
    structuredContext: {
      workflowType: "autonomous_coding",
      failureType: "BEHAVIORAL_REGRESSION",
      subsystem: "parser",
      behaviorWasImplicit: true,
      recoveryStrategy: "REVERT_PATCH",
      outcome: "COMPENSATED",
    },
    confidence: 0.93,
    evidenceState: "OBSERVED",
    environmentVersion: "repo-v2",
    ...overrides,
  };
}

describe("autonomous coding execution-memory scenario", () => {
  it("changes a comparable coding task from patch-first to regression-test-first", () => {
    const controlDecision = decideCodingStrategy({ context, memories: [] });
    expect(controlDecision.strategy).toBe("PATCH_FIRST");
    expect(controlDecision.memoryRefs).toEqual([]);

    const controlResult = executeCodingTask(controlDecision.strategy, context);
    expect(controlResult).toEqual({
      status: "COMPENSATED",
      strategy: "PATCH_FIRST",
      failureType: "BEHAVIORAL_REGRESSION",
      recovery: "REVERT_PATCH",
      regressionTestAdded: false,
    });

    const memory = priorRegressionMemory();
    const treatmentDecision = decideCodingStrategy({
      context,
      memories: [{ memory, finalScore: 0.97 }],
    });

    expect(treatmentDecision.strategy).toBe("REGRESSION_TEST_THEN_PATCH");
    expect(treatmentDecision.counterfactualStrategy).toBe("PATCH_FIRST");
    expect(treatmentDecision.memoryRefs).toEqual([memory.id]);

    const treatmentResult = executeCodingTask(treatmentDecision.strategy, context);
    expect(treatmentResult).toEqual({
      status: "SUCCESS",
      strategy: "REGRESSION_TEST_THEN_PATCH",
      regressionTestAdded: true,
    });
  });

  it("does not let a high-score regression from another subsystem change the action", () => {
    const memory = priorRegressionMemory();
    memory.structuredContext = {
      ...memory.structuredContext,
      subsystem: "scheduler",
    };

    const decision = decideCodingStrategy({
      context,
      memories: [{ memory, finalScore: 0.99 }],
    });

    expect(decision.strategy).toBe("PATCH_FIRST");
    expect(decision.memoryRefs).toEqual([]);
  });

  it("does not treat explicit well-tested behavior as equivalent to the prior implicit-behavior failure", () => {
    const memory = priorRegressionMemory();
    const explicitContext: CodingContext = { ...context, behaviorIsImplicit: false };

    const decision = decideCodingStrategy({
      context: explicitContext,
      memories: [{ memory, finalScore: 0.99 }],
    });

    expect(decision.strategy).toBe("PATCH_FIRST");
    expect(decision.memoryRefs).toEqual([]);
  });
});
