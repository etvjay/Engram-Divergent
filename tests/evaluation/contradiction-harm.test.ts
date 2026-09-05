import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MemoryEvaluationSchema, MemoryRelationshipSchema } from "../../packages/evaluation/src/domain.js";
import { assessUsefulnessMetrics } from "../../packages/evaluation/src/quality.js";

describe("contradictory and harmful operational memory", () => {
  it("represents contradiction as an explicit relationship between preserved memory identities", () => {
    const olderMemoryId = randomUUID();
    const newerMemoryId = randomUUID();

    const relationship = MemoryRelationshipSchema.parse({
      id: randomUUID(),
      leftMemoryId: newerMemoryId,
      rightMemoryId: olderMemoryId,
      relation: "CONTRADICTS",
      rationale: "A later observed execution succeeded under the condition the older lesson warned against.",
      evidenceState: "OBSERVED",
      method: "EVALUATOR",
      assessedAt: new Date("2026-08-16T00:00:00Z"),
    });

    expect(relationship.relation).toBe("CONTRADICTS");
    expect(relationship.leftMemoryId).toBe(newerMemoryId);
    expect(relationship.rightMemoryId).toBe(olderMemoryId);
    expect(relationship.leftMemoryId).not.toBe(relationship.rightMemoryId);
  });

  it("records controlled harmful effect evidence without converting it into deletion semantics", () => {
    const memoryId = randomUUID();
    const evaluation = MemoryEvaluationSchema.parse({
      schemaVersion: "engram.memory-evaluation/v1",
      id: randomUUID(),
      memoryId,
      influencedExecutionId: randomUUID(),
      influencedDecisionId: randomUUID(),
      baselineExecutionId: randomUUID(),
      method: "CONTROL_RUN",
      effect: "HARMFUL",
      effectScore: -0.8,
      rationale: "The treatment followed the memory and produced a worse controlled outcome than the memory-free baseline.",
      evidenceState: "OBSERVED",
      controlledVariables: {
        intent: "same",
        environmentVersion: "same",
        constraints: "same",
      },
      metadata: { deletionRequested: false },
      evaluatedAt: new Date("2026-08-16T00:00:00Z"),
    });

    const assessment = assessUsefulnessMetrics({
      memoryId,
      retrievalCount: 3,
      exposedRetrievalCount: 3,
      influenceCount: 2,
      changedActionCount: 1,
      consideredCount: 1,
      explicitEvaluations: 1,
      beneficialEvaluations: 0,
      harmfulEvaluations: 1,
      neutralEvaluations: 0,
      unknownEvaluations: 0,
      controlledEvaluations: 1,
      observationalEvaluations: 0,
    });

    expect(evaluation.effect).toBe("HARMFUL");
    expect(evaluation.metadata.deletionRequested).toBe(false);
    expect(assessment.interpretation).toBe("NEGATIVE_EVIDENCE");
    expect(assessment.warnings).toContain("HARMFUL_EFFECT_RECORDED");
  });

  it("reports mixed evidence rather than allowing a newer positive result to erase a harmful result", () => {
    const memoryId = randomUUID();
    const assessment = assessUsefulnessMetrics({
      memoryId,
      retrievalCount: 8,
      exposedRetrievalCount: 7,
      influenceCount: 5,
      changedActionCount: 3,
      consideredCount: 2,
      explicitEvaluations: 2,
      beneficialEvaluations: 1,
      harmfulEvaluations: 1,
      neutralEvaluations: 0,
      unknownEvaluations: 0,
      controlledEvaluations: 2,
      observationalEvaluations: 0,
    });

    expect(assessment.interpretation).toBe("MIXED_EVIDENCE");
    expect(assessment.warnings).toContain("HARMFUL_EFFECT_RECORDED");
  });
});
