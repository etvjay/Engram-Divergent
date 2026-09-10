import { describe, expect, it } from "vitest";
import { decideProviderScenario, type ProviderScenarioCase } from "../../packages/scenarios/provider-continuity/src/index.js";

const base: ProviderScenarioCase = {
  failureMode: "TIMEOUT_OR_OUTAGE",
  providerId: "atlas",
  fallbackProviderId: "beacon",
  urgent: true,
  verificationPresent: true,
  currentCostUsd: 12,
  allowedCostUsd: 20,
};

describe("real-world provider continuity scenarios", () => {
  it.each([
    ["provider timeout", { ...base, failureMode: "TIMEOUT_OR_OUTAGE" }, "CHECK_STATUS", "atlas", true],
    ["urgent repeated SLA miss", { ...base, failureMode: "REPEATED_SLA_MISS", urgent: true }, "SWITCH_PROVIDER", "beacon", true],
    ["routine repeated SLA miss", { ...base, failureMode: "REPEATED_SLA_MISS", urgent: false }, "REDUCE_EXPOSURE", "atlas", true],
    ["terms remain inside limit", { ...base, failureMode: "TERMS_CHANGED", currentCostUsd: 18 }, "REDUCE_EXPOSURE", "atlas", true],
    ["terms exceed limit", { ...base, failureMode: "TERMS_CHANGED", currentCostUsd: 25 }, "ESCALATE", "atlas", false],
    ["missing milestone", { ...base, failureMode: "MISSING_MILESTONE" }, "REQUEST_VERIFICATION", "atlas", true],
    ["contradictory provider status", { ...base, failureMode: "CONTRADICTORY_STATUS" }, "RECONCILE", "atlas", true],
    ["safe substitution", { ...base, failureMode: "SAFE_SUBSTITUTION" }, "SWITCH_PROVIDER", "beacon", true],
  ] satisfies Array<[string, ProviderScenarioCase, string, string, boolean]>)('%s', (_name, input, action, providerId, safe) => {
    const decision = decideProviderScenario(input);
    expect(decision.action).toBe(action);
    expect(decision.providerId).toBe(providerId);
    expect(decision.safe).toBe(safe);
    expect(decision.reason.length).toBeGreaterThan(20);
  });
});
