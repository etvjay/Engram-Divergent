import type { MemoryInfluence, MemoryRecall } from "./protocol.js";

export type DecisionInfluenceEnvelope = {
  executionId: string;
  influences: MemoryInfluence[];
};

export type ProtocolViolation = {
  code:
    | "INFLUENCE_WITHOUT_RECALL"
    | "RETRIEVAL_MISMATCH"
    | "CHANGED_ACTION_WITHOUT_COUNTERFACTUAL";
  message: string;
  memoryId?: string;
};

export function validateDecisionInfluences(
  decision: DecisionInfluenceEnvelope,
  recalls: MemoryRecall[],
): ProtocolViolation[] {
  const violations: ProtocolViolation[] = [];
  const recallsForExecution = recalls.filter((recall) => recall.executionId === decision.executionId);
  const recalledByMemory = new Map<string, Set<string>>();

  for (const recall of recallsForExecution) {
    for (const candidate of recall.candidates) {
      const ids = recalledByMemory.get(candidate.memoryId) ?? new Set<string>();
      ids.add(recall.id);
      recalledByMemory.set(candidate.memoryId, ids);
    }
  }

  for (const influence of decision.influences) {
    const retrievalIds = recalledByMemory.get(influence.memoryId);
    if (!retrievalIds || retrievalIds.size === 0) {
      violations.push({
        code: "INFLUENCE_WITHOUT_RECALL",
        memoryId: influence.memoryId,
        message: `Memory ${influence.memoryId} cannot influence a decision without first being recalled for the same execution.`,
      });
      continue;
    }

    if (influence.retrievalId && !retrievalIds.has(influence.retrievalId)) {
      violations.push({
        code: "RETRIEVAL_MISMATCH",
        memoryId: influence.memoryId,
        message: `Influence references retrieval ${influence.retrievalId}, but that retrieval did not recall memory ${influence.memoryId} for this execution.`,
      });
    }

    if (influence.influenceType === "CHANGED_ACTION" && !influence.counterfactual) {
      violations.push({
        code: "CHANGED_ACTION_WITHOUT_COUNTERFACTUAL",
        memoryId: influence.memoryId,
        message: "CHANGED_ACTION influence requires an explicit, sourced counterfactual.",
      });
    }
  }

  return violations;
}

export function assertDecisionInfluencesValid(
  decision: DecisionInfluenceEnvelope,
  recalls: MemoryRecall[],
): void {
  const violations = validateDecisionInfluences(decision, recalls);
  if (violations.length > 0) {
    throw new Error(violations.map((violation) => `${violation.code}: ${violation.message}`).join("\n"));
  }
}
