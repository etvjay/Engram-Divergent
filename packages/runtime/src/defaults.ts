import { MEMORY_POLICY_CONTRACT_VERSION } from "../../policy/src/contracts.js";
import type { RuntimePolicyBundle } from "./types.js";

export const DEFAULT_RUNTIME_POLICIES: RuntimePolicyBundle = {
  admission: {
    contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
    policyVersion: "engram-admission-v1",
    admitOn: [
      "UNEXPECTED_FAILURE",
      "SUCCESSFUL_RECOVERY",
      "POLICY_VIOLATION",
      "HUMAN_CORRECTION",
      "SAFETY_INTERVENTION",
      "SIGNIFICANT_COST",
      "NOVEL_CONDITION",
      "REPEATED_PATTERN",
    ],
    minimumEvidence: "OBSERVED",
  },
  retrieval: {
    contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
    policyVersion: "engram-retrieval-v1",
    maxCandidates: 8,
    minimumScore: 0.6,
    requireEnvironmentMatch: false,
    allowExpired: false,
  },
  influence: {
    contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
    policyVersion: "engram-influence-v1",
    allowedEvidenceStates: ["VERIFIED", "OBSERVED", "SIMULATED"],
    minimumConfidence: 0.65,
    requireCounterfactualForChangedAction: true,
  },
  expiry: {
    contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
    policyVersion: "engram-expiry-v1",
    invalidateOnEnvironmentChange: true,
    invalidateOnToolMajorVersionChange: true,
  },
};
