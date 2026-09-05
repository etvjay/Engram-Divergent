import { DEFAULT_RUNTIME_POLICIES } from "../../../packages/runtime/src/defaults.js";
import type { RuntimePolicyBundle } from "../../../packages/runtime/src/types.js";

/**
 * The demonstration workload is intentionally simulated. It therefore uses a
 * dedicated policy that may admit SIMULATED evidence. Production defaults
 * remain stricter and require OBSERVED-or-better evidence for admission.
 */
export const DEMO_RUNTIME_POLICIES: RuntimePolicyBundle = {
  ...DEFAULT_RUNTIME_POLICIES,
  admission: {
    ...DEFAULT_RUNTIME_POLICIES.admission,
    policyVersion: "engram-demo-admission-v1",
    minimumEvidence: "SIMULATED",
  },
  influence: {
    ...DEFAULT_RUNTIME_POLICIES.influence,
    policyVersion: "engram-demo-influence-v1",
    allowedEvidenceStates: ["VERIFIED", "OBSERVED", "SIMULATED"],
  },
};
