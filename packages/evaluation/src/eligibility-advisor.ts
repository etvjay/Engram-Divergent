import type { MemoryEligibilityAdvisor, MemoryEligibilityStage } from "../../runtime/src/eligibility.js";
import { assessMemoryRelationships } from "./relationships.js";
import type { MemoryEvaluationStore } from "./store.js";

export type RelationshipEligibilityPolicy = {
  unresolvedContradictionStages?: MemoryEligibilityStage[];
  supersededMemoryStages?: MemoryEligibilityStage[];
};

/**
 * Evaluation-layer adapter that turns already-assessed relationship evidence
 * into optional runtime eligibility reasons. It never infers relationships.
 */
export class RelationshipMemoryEligibilityAdvisor implements MemoryEligibilityAdvisor {
  constructor(
    private readonly store: Pick<MemoryEvaluationStore, "listRelationships">,
    private readonly policy: RelationshipEligibilityPolicy,
  ) {}

  async evaluate(input: Parameters<MemoryEligibilityAdvisor["evaluate"]>[0]): Promise<string[]> {
    const relationships = await this.store.listRelationships(input.memory.id);
    const assessment = assessMemoryRelationships(input.memory.id, relationships);
    const reasons: string[] = [];

    if (
      this.policy.unresolvedContradictionStages?.includes(input.stage) &&
      assessment.unresolvedContradictions.length > 0
    ) {
      reasons.push("UNRESOLVED_MEMORY_CONTRADICTION");
    }

    if (
      this.policy.supersededMemoryStages?.includes(input.stage) &&
      assessment.supersededBy.length > 0
    ) {
      reasons.push("MEMORY_SUPERSEDED");
    }

    return reasons;
  }
}
