import { describe, expect, it } from "vitest";
import { ExecutionMemorySchema } from "../../packages/memory-core/src/execution-memory.js";
import { BehavioralMemoryEvaluationSchema } from "../../packages/evaluation/src/memory-evaluation.js";
import {
  applyMemoryUpdate,
  isCurrentMemoryEligible,
  MemoryUpdateRecordSchema,
  resolveCurrentMemory,
} from "../../packages/evaluation/src/memory-lifecycle.js";

const ids = {
  prior: "00000000-0000-4000-8000-000000000101",
  evaluation: "00000000-0000-4000-8000-000000000102",
  execution: "00000000-0000-4000-8000-000000000103",
  decision: "00000000-0000-4000-8000-000000000104",
  slice: "00000000-0000-4000-8000-000000000105",
  grant: "00000000-0000-4000-8000-000000000106",
};

function priorMemory() {
  return ExecutionMemorySchema.parse({
    id: ids.prior,
    agentId: "agent-a",
    memoryType: "TOOL_RECOVERY",
    summary: "Avoid Tool A after rate limits; use bounded Tool B fallback.",
    sourceCandidateMemoryId: "00000000-0000-4000-8000-000000000107",
    sourceExperienceIds: ["00000000-0000-4000-8000-000000000108"],
    sourceEpisodeIds: ["00000000-0000-4000-8000-000000000109"],
    applicability: { tool: "tool-a", failure: "rate_limit", context: "high_load" },
    confidence: 0.7,
    evidenceState: "OBSERVED",
    state: "ADMITTED",
    admittedAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
  });
}

function evaluation(directive: "STRENGTHEN" | "WEAKEN" | "QUALIFY" | "SUPERSEDE" | "INVALIDATE" | "NO_CHANGE") {
  return BehavioralMemoryEvaluationSchema.parse({
    id: ids.evaluation,
    executionMemoryId: ids.prior,
    memorySliceId: ids.slice,
    influenceGrantId: ids.grant,
    influencedExecutionId: ids.execution,
    influencedDecisionId: ids.decision,
    effect: directive === "STRENGTHEN" ? "BENEFICIAL" : directive === "WEAKEN" ? "HARMFUL" : "NEUTRAL",
    effectScore: directive === "STRENGTHEN" ? 0.8 : directive === "WEAKEN" ? -0.8 : 0,
    actionChanged: true,
    treatmentAction: { tool: "tool-b" },
    treatmentOutcome: directive === "STRENGTHEN" ? "SUCCESS" : "FAILURE",
    updateDirective: directive,
    rationale: `Evidence supports ${directive}.`,
    evidenceState: "OBSERVED",
    evaluatedAt: "2026-09-09T01:00:00.000Z",
  });
}

describe("versioned behavioral memory lifecycle", () => {
  it.each(["STRENGTHEN", "WEAKEN", "QUALIFY", "SUPERSEDE", "INVALIDATE", "NO_CHANGE"] as const)(
    "applies %s as an immutable versioned update",
    (directive) => {
      const prior = priorMemory();
      const result = applyMemoryUpdate({ prior, evaluation: evaluation(directive), newMemoryId: "00000000-0000-4000-8000-000000000110" });
      expect(result.priorMemory).toEqual(prior);
      expect(result.memory.id).not.toBe(prior.id);
      expect(result.record).toMatchObject({
        priorMemoryId: prior.id,
        evaluationId: ids.evaluation,
        influencedExecutionId: ids.execution,
        newMemoryId: result.memory.id,
        directive,
      });
      expect(() => MemoryUpdateRecordSchema.parse(result.record)).not.toThrow();
      expect(result.memory.supersedesMemoryIds).toContain(prior.id);
      if (directive === "INVALIDATE") expect(result.memory.state).toBe("INVALIDATED");
      if (directive === "QUALIFY" || directive === "WEAKEN") expect(result.memory.state).toBe("QUALIFIED");
      if (directive === "SUPERSEDE") expect(resolveCurrentMemory([prior, result.memory])).toEqual(result.memory);
    },
  );

  it("keeps superseded and invalidated versions from influencing future work", () => {
    const prior = priorMemory();
    const updated = applyMemoryUpdate({ prior, evaluation: evaluation("SUPERSEDE"), newMemoryId: "00000000-0000-4000-8000-000000000111" }).memory;
    expect(isCurrentMemoryEligible({ memory: prior, versions: [prior, updated], context: prior.applicability })).toBe(false);
    expect(isCurrentMemoryEligible({ memory: updated, versions: [prior, updated], context: prior.applicability })).toBe(true);
    const invalidationEvaluation = BehavioralMemoryEvaluationSchema.parse({ ...evaluation("INVALIDATE"), executionMemoryId: updated.id });
    const invalidated = applyMemoryUpdate({ prior: updated, evaluation: invalidationEvaluation, newMemoryId: "00000000-0000-4000-8000-000000000112" }).memory;
    expect(resolveCurrentMemory([prior, updated, invalidated])?.id).toBe(invalidated.id);
    expect(isCurrentMemoryEligible({ memory: invalidated, versions: [prior, updated, invalidated], context: prior.applicability })).toBe(false);
  });
});
