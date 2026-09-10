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

export type ToolRecoveryFailureMode =
  | "RATE_LIMIT"
  | "TIMEOUT_UNKNOWN"
  | "PARTIAL_COMPLETION"
  | "SCHEMA_DRIFT"
  | "AMBIGUOUS_COMPLETION";

export type ToolRecoveryCase = {
  failureMode: ToolRecoveryFailureMode;
  retryCount: number;
  maxRetries: number;
  operationStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "UNKNOWN";
  completedSteps: number;
  totalSteps: number;
  currentSchemaVersion: string;
  requiredSchemaVersion?: string;
};

export type ToolRecoveryDecision = {
  action:
    | "BACKOFF"
    | "CHECK_STATUS"
    | "RESUME_FROM_CHECKPOINT"
    | "USE_COMPATIBLE_SCHEMA"
    | "RECONCILE"
    | "ESCALATE"
    | "STOP";
  safeToRetry: boolean;
  reason: string;
};

/**
 * Deterministic recovery policy used by the scenario fixtures. It never
 * assumes that an unknown write failed, and it never expands authority.
 */
export function decideToolRecovery(input: ToolRecoveryCase): ToolRecoveryDecision {
  switch (input.failureMode) {
    case "RATE_LIMIT":
      return input.retryCount < input.maxRetries
        ? { action: "BACKOFF", safeToRetry: true, reason: "Rate limit is recoverable with bounded backoff." }
        : { action: "ESCALATE", safeToRetry: false, reason: "Retry budget is exhausted; do not increase it silently." };
    case "TIMEOUT_UNKNOWN":
      return { action: "CHECK_STATUS", safeToRetry: false, reason: "A timed-out write may have succeeded; check status before retrying." };
    case "PARTIAL_COMPLETION":
      return input.completedSteps < input.totalSteps
        ? { action: "RESUME_FROM_CHECKPOINT", safeToRetry: true, reason: "Resume after the last confirmed completed step." }
        : { action: "STOP", safeToRetry: false, reason: "No unfinished step remains." };
    case "SCHEMA_DRIFT":
      return input.requiredSchemaVersion && input.requiredSchemaVersion !== input.currentSchemaVersion
        ? { action: "USE_COMPATIBLE_SCHEMA", safeToRetry: true, reason: "The old request is invalid; use the approved tool schema." }
        : { action: "ESCALATE", safeToRetry: false, reason: "No approved compatible schema is available." };
    case "AMBIGUOUS_COMPLETION":
      return { action: "RECONCILE", safeToRetry: false, reason: "The authoritative state must be checked before repeating an irreversible action." };
  }
}

export function isToolRecoveryMemoryApplicable(memory: ExecutionMemory, context: ToolRecoveryContext): boolean {
  return isExecutionMemoryApplicable(memory, context);
}
