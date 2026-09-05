import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OperationalMemory } from "../../packages/memory-core/src/domain.js";
import {
  decideCoordinationStrategy,
  executeCoordination,
  type CoordinationContext,
} from "../../packages/scenarios/multi-agent-coordination/src/index.js";

function memory(overrides: Partial<OperationalMemory> = {}): OperationalMemory {
  return {
    id: randomUUID(),
    agentId: "coordinator-agent",
    memoryType: "UNEXPECTED_FAILURE",
    summary: "Parallel unleased workers raced on the same shared mutable artifact; prefer leased serialization.",
    structuredContext: {
      workflowType: "multi_agent_coordination",
      failureType: "CONCURRENT_WRITE_CONFLICT",
      resourceClass: "SHARED_MUTABLE_ARTIFACT",
      contentionMode: "SAME_TARGET",
      failedStrategy: "PARALLEL_UNLEASED",
      recommendedStrategy: "LEASED_SERIALIZATION",
    },
    confidence: 0.95,
    evidenceState: "OBSERVED",
    validFrom: new Date(),
    ...overrides,
  };
}

const sharedContext: CoordinationContext = {
  workflowType: "multi_agent_coordination",
  resourceClass: "SHARED_MUTABLE_ARTIFACT",
  contentionMode: "SAME_TARGET",
  environmentVersion: "coord-v1",
};

describe("multi-agent coordination memory applicability", () => {
  it("changes coordinator strategy only for an applicable shared-target race memory", () => {
    const baseline = decideCoordinationStrategy({ context: sharedContext, memories: [] });
    expect(baseline.strategy).toBe("PARALLEL_UNLEASED");
    expect(executeCoordination(baseline.strategy, sharedContext)).toMatchObject({
      status: "PARTIAL",
      conflictType: "CONCURRENT_WRITE_CONFLICT",
    });

    const recalled = memory();
    const treatment = decideCoordinationStrategy({
      context: sharedContext,
      memories: [{ memory: recalled, finalScore: 0.99 }],
    });
    expect(treatment.strategy).toBe("LEASED_SERIALIZATION");
    expect(treatment.memoryRefs).toEqual([recalled.id]);
    expect(executeCoordination(treatment.strategy, sharedContext).status).toBe("SUCCESS");
  });

  it("does not apply a high-scoring race lesson to independent artifacts", () => {
    const context: CoordinationContext = {
      ...sharedContext,
      resourceClass: "INDEPENDENT_ARTIFACTS",
      contentionMode: "DISTINCT_TARGETS",
    };
    const decision = decideCoordinationStrategy({
      context,
      memories: [{ memory: memory(), finalScore: 0.99 }],
    });
    expect(decision.strategy).toBe("PARALLEL_UNLEASED");
    expect(executeCoordination(decision.strategy, context).status).toBe("SUCCESS");
  });

  it("does not apply another workflow's conflict memory solely because retrieval score is high", () => {
    const unrelated = memory({
      structuredContext: {
        workflowType: "batch_import",
        failureType: "CONCURRENT_WRITE_CONFLICT",
        resourceClass: "SHARED_MUTABLE_ARTIFACT",
        contentionMode: "SAME_TARGET",
        failedStrategy: "PARALLEL_UNLEASED",
        recommendedStrategy: "LEASED_SERIALIZATION",
      },
    });
    const decision = decideCoordinationStrategy({
      context: sharedContext,
      memories: [{ memory: unrelated, finalScore: 0.99 }],
    });
    expect(decision.strategy).toBe("PARALLEL_UNLEASED");
  });
});
