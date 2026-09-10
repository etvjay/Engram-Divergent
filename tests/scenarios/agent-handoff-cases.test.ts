import { describe, expect, it } from "vitest";
import { decideHandoff, type HandoffScenarioCase } from "../../packages/scenarios/agent-handoff/src/index.js";

const base: HandoffScenarioCase = { scenarioId: "CUSTOMER_SUPPORT_ESCALATION", evidenceComplete: true, approvedSource: true };

describe("real-world agent handoff scenarios", () => {
  it.each([
    ["support escalation", { ...base, scenarioId: "CUSTOMER_SUPPORT_ESCALATION" }, "INSPECT_SCOPED_CASE"],
    ["incident response", { ...base, scenarioId: "INCIDENT_RESPONSE_HANDOFF" }, "CHECK_HEALTH"],
    ["research verification", { ...base, scenarioId: "RESEARCH_VERIFICATION_HANDOFF" }, "VERIFY_SOURCES"],
    ["procurement within budget", { ...base, scenarioId: "PROCUREMENT_APPROVAL_HANDOFF", withinBudget: true }, "APPROVE_WITHIN_LIMIT"],
    ["procurement over budget", { ...base, scenarioId: "PROCUREMENT_APPROVAL_HANDOFF", withinBudget: false }, "ESCALATE"],
    ["deployment gate passed", { ...base, scenarioId: "DEPLOYMENT_RELEASE_HANDOFF", releaseGatePassed: true }, "APPROVE_STAGING"],
    ["deployment gate failed", { ...base, scenarioId: "DEPLOYMENT_RELEASE_HANDOFF", releaseGatePassed: false }, "ESCALATE"],
    ["incomplete evidence", { ...base, scenarioId: "RESEARCH_VERIFICATION_HANDOFF", evidenceComplete: false }, "ESCALATE"],
  ] satisfies Array<[string, HandoffScenarioCase, string]>)('%s', (_name, input, action) => {
    const decision = decideHandoff(input);
    expect(decision.action).toBe(action);
    expect(decision.safe).toBe(true);
    expect(decision.reason.length).toBeGreaterThan(20);
  });
});
