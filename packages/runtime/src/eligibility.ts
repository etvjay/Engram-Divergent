import type { OperationalMemory } from "../../memory-core/src/domain.js";
import type { RuntimeExecutionRecord } from "./types.js";

export type MemoryEligibilityStage = "RECALL" | "INFLUENCE";

export type MemoryEligibilityInput = {
  stage: MemoryEligibilityStage;
  execution: RuntimeExecutionRecord;
  memory: OperationalMemory;
};

/**
 * Optional extension point for workload/evaluation-aware eligibility rules.
 * Runtime core owns when eligibility is checked but remains ignorant of the
 * external evidence source that produced additional reasons.
 */
export interface MemoryEligibilityAdvisor {
  evaluate(input: MemoryEligibilityInput): Promise<string[]>;
}
