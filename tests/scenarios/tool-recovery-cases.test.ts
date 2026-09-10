import { describe, expect, it } from "vitest";
import { decideToolRecovery, type ToolRecoveryCase } from "../../packages/scenarios/tool-recovery/src/index.js";

const base: ToolRecoveryCase = {
  failureMode: "RATE_LIMIT",
  retryCount: 0,
  maxRetries: 2,
  operationStatus: "UNKNOWN",
  completedSteps: 0,
  totalSteps: 1,
  currentSchemaVersion: "v1",
};

describe("real-world tool recovery scenarios", () => {
  it.each([
    ["rate limit with retry budget", { ...base, failureMode: "RATE_LIMIT", retryCount: 1 }, "BACKOFF", true],
    ["rate limit after budget exhaustion", { ...base, failureMode: "RATE_LIMIT", retryCount: 2 }, "ESCALATE", false],
    ["timeout with unknown write result", { ...base, failureMode: "TIMEOUT_UNKNOWN" }, "CHECK_STATUS", false],
    ["partial workflow", { ...base, failureMode: "PARTIAL_COMPLETION", completedSteps: 3, totalSteps: 5 }, "RESUME_FROM_CHECKPOINT", true],
    ["schema drift with approved version", { ...base, failureMode: "SCHEMA_DRIFT", currentSchemaVersion: "v1", requiredSchemaVersion: "v2" }, "USE_COMPATIBLE_SCHEMA", true],
    ["schema drift without approved version", { ...base, failureMode: "SCHEMA_DRIFT" }, "ESCALATE", false],
    ["ambiguous completion", { ...base, failureMode: "AMBIGUOUS_COMPLETION" }, "RECONCILE", false],
  ] satisfies Array<[string, ToolRecoveryCase, string, boolean]>)('%s', (_name, input, action, safeToRetry) => {
    const decision = decideToolRecovery(input);
    expect(decision.action).toBe(action);
    expect(decision.safeToRetry).toBe(safeToRetry);
    expect(decision.reason.length).toBeGreaterThan(20);
  });
});
