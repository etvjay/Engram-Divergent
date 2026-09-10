export type HandoffScenarioId =
  | "CUSTOMER_SUPPORT_ESCALATION"
  | "INCIDENT_RESPONSE_HANDOFF"
  | "RESEARCH_VERIFICATION_HANDOFF"
  | "PROCUREMENT_APPROVAL_HANDOFF"
  | "DEPLOYMENT_RELEASE_HANDOFF";

export type HandoffScenarioCase = {
  scenarioId: HandoffScenarioId;
  evidenceComplete: boolean;
  approvedSource: boolean;
  withinBudget?: boolean;
  releaseGatePassed?: boolean;
};

export type HandoffDecision = {
  action: "INSPECT_SCOPED_CASE" | "CHECK_HEALTH" | "VERIFY_SOURCES" | "APPROVE_WITHIN_LIMIT" | "APPROVE_STAGING" | "ESCALATE";
  safe: boolean;
  reason: string;
};

/** Deterministic policy for a fresh consumer agent receiving a MemorySlice. */
export function decideHandoff(input: HandoffScenarioCase): HandoffDecision {
  if (!input.evidenceComplete || !input.approvedSource) {
    return { action: "ESCALATE", safe: true, reason: "The handoff lacks enough approved evidence for an automatic next step." };
  }
  switch (input.scenarioId) {
    case "CUSTOMER_SUPPORT_ESCALATION":
      return { action: "INSPECT_SCOPED_CASE", safe: true, reason: "The specialist may inspect the scoped case without receiving the first agent's raw history." };
    case "INCIDENT_RESPONSE_HANDOFF":
      return { action: "CHECK_HEALTH", safe: true, reason: "The remediation agent must verify current health before taking action." };
    case "RESEARCH_VERIFICATION_HANDOFF":
      return { action: "VERIFY_SOURCES", safe: true, reason: "A transferred claim remains unverified until the receiving agent checks its sources." };
    case "PROCUREMENT_APPROVAL_HANDOFF":
      return input.withinBudget === true
        ? { action: "APPROVE_WITHIN_LIMIT", safe: true, reason: "The option fits the receiving agent's fixed budget and mandate." }
        : { action: "ESCALATE", safe: true, reason: "The option exceeds the receiving agent's budget and cannot be approved automatically." };
    case "DEPLOYMENT_RELEASE_HANDOFF":
      return input.releaseGatePassed === true
        ? { action: "APPROVE_STAGING", safe: true, reason: "The release gate passed; only the bounded staging action is allowed." }
        : { action: "ESCALATE", safe: true, reason: "The release gate did not pass, so deployment authority cannot be inferred from the handoff." };
  }
}
