import type { ExecutionMemory } from "../../../memory-core/src/execution-memory.js";
import { isExecutionMemoryApplicable } from "../../../experience/src/formation.js";

export const TOOL_RECOVERY_EFFECTS = ["tool_selection", "retry_policy", "timeout_policy", "fallback_policy", "verification_policy"] as const;
export type ToolRecoveryEffect = (typeof TOOL_RECOVERY_EFFECTS)[number];

export const TOOL_RECOVERY_DENIED_EFFECTS = ["increase_budget", "new_signer", "new_wallet", "new_asset", "new_capability"] as const;

export type ToolRecoveryContext = {
  workflowType: "tool_recovery";
  taskType: string;
  toolId: string;
  workloadClass: string;
  urgency: string;
  requestVolume: string;
};

export function isToolRecoveryMemoryApplicable(memory: ExecutionMemory, context: ToolRecoveryContext): boolean {
  return isExecutionMemoryApplicable(memory, context);
}
