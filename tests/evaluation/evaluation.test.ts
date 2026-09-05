import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assessUsefulnessMetrics } from "../../packages/evaluation/src/quality.js";
import { assessMemoryStaleness } from "../../packages/evaluation/src/staleness.js";
import { MemoryRelationshipSchema } from "../../packages/evaluation/src/domain.js";
import { MEMORY_POLICY_CONTRACT_VERSION } from "../../packages/policy/src/contracts.js";

describe("Engram memory evaluation", () => {
  it("does not label changed behavior beneficial without explicit effect evidence", () => {
    const assessment = assessUsefulnessMetrics({
      memoryId: randomUUID(),
      retrievalCount: 4,
      exposedRetrievalCount: 3,
      influenceCount: 2,
      changedActionCount: 2,
      consideredCount: 0,
      explicitEvaluations: 0,
      beneficialEvaluations: 0,
      harmfulEvaluations: 0,
      neutralEvaluations: 0,
      unknownEvaluations: 0,
      controlledEvaluations: 0,
      observationalEvaluations: 0,
    });

    expect(assessment.interpretation).toBe("INSUFFICIENT_EVIDENCE");
    expect(assessment.warnings).toContain("CHANGED_ACTION_WITHOUT_EFFECT_EVALUATION");
  });

  it("distinguishes positive, negative, and mixed explicit evidence", () => {
    const base = {
      memoryId: randomUUID(),
      retrievalCount: 10,
      exposedRetrievalCount: 8,
      influenceCount: 5,
      changedActionCount: 3,
      consideredCount: 2,
      explicitEvaluations: 2,
      neutralEvaluations: 0,
      unknownEvaluations: 0,
      controlledEvaluations: 2,
      observationalEvaluations: 0,
    };

    expect(assessUsefulnessMetrics({ ...base, beneficialEvaluations: 2, harmfulEvaluations: 0 }).interpretation)
      .toBe("POSITIVE_EVIDENCE");
    expect(assessUsefulnessMetrics({ ...base, beneficialEvaluations: 0, harmfulEvaluations: 2 }).interpretation)
      .toBe("NEGATIVE_EVIDENCE");
    expect(assessUsefulnessMetrics({ ...base, beneficialEvaluations: 1, harmfulEvaluations: 1 }).interpretation)
      .toBe("MIXED_EVIDENCE");
  });

  it("marks memory stale deterministically from validity and environment/tool policy", () => {
    const memory = {
      id: randomUUID(),
      agentId: "agent",
      memoryType: "UNEXPECTED_FAILURE",
      summary: "old failure",
      structuredContext: {},
      confidence: 0.9,
      evidenceState: "OBSERVED" as const,
      validFrom: new Date("2026-01-01T00:00:00Z"),
      environmentVersion: "prod-v1",
      toolVersion: "1.9.0",
    };

    const assessment = assessMemoryStaleness(memory, {
      environmentVersion: "prod-v2",
      toolVersion: "2.0.0",
      now: new Date("2026-08-16T00:00:00Z"),
    }, {
      contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
      policyVersion: "expiry-v1",
      invalidateOnEnvironmentChange: true,
      invalidateOnToolMajorVersionChange: true,
      maxAgeSeconds: 60 * 60 * 24 * 30,
    });

    expect(assessment.stale).toBe(true);
    expect(assessment.reasons).toEqual(expect.arrayContaining([
      "ENVIRONMENT_CHANGED",
      "TOOL_MAJOR_VERSION_CHANGED",
      "MAX_AGE_EXCEEDED",
    ]));
  });

  it("requires conflict to be an explicit assessment between distinct memories", () => {
    const id = randomUUID();
    expect(() => MemoryRelationshipSchema.parse({
      id: randomUUID(),
      leftMemoryId: id,
      rightMemoryId: id,
      relation: "CONTRADICTS",
      rationale: "invalid self-conflict",
      evidenceState: "INFERRED",
      method: "EVALUATOR",
      assessedAt: new Date(),
    })).toThrow();
  });
});
