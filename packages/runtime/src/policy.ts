import type { EvidenceState } from "../../core/src/protocol.js";
import type { OperationalMemory } from "../../memory-core/src/domain.js";
import type { AdmissionSignal, RuntimeExecutionRecord, RuntimePolicyBundle } from "./types.js";

const EVIDENCE_RANK: Record<EvidenceState, number> = {
  UNKNOWN: 0,
  PROPOSED: 1,
  INFERRED: 2,
  SIMULATED: 3,
  OBSERVED: 4,
  VERIFIED: 5,
};

export function evidenceRank(state: EvidenceState): number {
  return EVIDENCE_RANK[state];
}

export function evaluateRecallCandidate(
  memory: OperationalMemory,
  execution: RuntimeExecutionRecord,
  policies: RuntimePolicyBundle,
  now = new Date(),
): string[] {
  const reasons: string[] = [];
  const retrieval = policies.retrieval;
  const expiry = policies.expiry;

  if (!retrieval.allowExpired && memory.validUntil && memory.validUntil <= now) {
    reasons.push("MEMORY_EXPIRED");
  }
  if (memory.validFrom && memory.validFrom > now) {
    reasons.push("MEMORY_NOT_YET_VALID");
  }

  if (retrieval.requireEnvironmentMatch && memory.environmentVersion && !execution.environmentVersion) {
    reasons.push("EXECUTION_ENVIRONMENT_UNSPECIFIED");
  }
  if (
    retrieval.requireEnvironmentMatch &&
    execution.environmentVersion &&
    memory.environmentVersion &&
    execution.environmentVersion !== memory.environmentVersion
  ) {
    reasons.push("ENVIRONMENT_MISMATCH");
  }

  if (expiry.invalidateOnEnvironmentChange && memory.environmentVersion && !execution.environmentVersion) {
    reasons.push("EXECUTION_ENVIRONMENT_UNSPECIFIED");
  }
  if (
    expiry.invalidateOnEnvironmentChange &&
    execution.environmentVersion &&
    memory.environmentVersion &&
    execution.environmentVersion !== memory.environmentVersion
  ) {
    reasons.push("INVALIDATED_ENVIRONMENT_CHANGE");
  }

  if (expiry.invalidateOnToolMajorVersionChange && memory.toolVersion && !execution.toolVersion) {
    reasons.push("EXECUTION_TOOL_VERSION_UNSPECIFIED");
  }
  if (
    expiry.invalidateOnToolMajorVersionChange &&
    execution.toolVersion &&
    memory.toolVersion &&
    major(execution.toolVersion) !== major(memory.toolVersion)
  ) {
    reasons.push("INVALIDATED_TOOL_MAJOR_VERSION_CHANGE");
  }
  if (expiry.maxAgeSeconds && memory.validFrom) {
    const ageSeconds = Math.max(0, (now.getTime() - memory.validFrom.getTime()) / 1000);
    if (ageSeconds > expiry.maxAgeSeconds) reasons.push("INVALIDATED_MAX_AGE");
  }

  return [...new Set(reasons)];
}

export function evaluateInfluenceMemory(
  memory: OperationalMemory,
  execution: RuntimeExecutionRecord,
  policies: RuntimePolicyBundle,
  now = new Date(),
): string[] {
  const reasons = evaluateRecallCandidate(memory, execution, policies, now);
  const influence = policies.influence;

  if (!influence.allowedEvidenceStates.includes(memory.evidenceState)) {
    reasons.push("EVIDENCE_STATE_NOT_ALLOWED");
  }
  if (memory.confidence < influence.minimumConfidence) {
    reasons.push("CONFIDENCE_BELOW_THRESHOLD");
  }
  return reasons;
}

export function evaluateAdmissionSignal(
  signal: AdmissionSignal,
  policies: RuntimePolicyBundle,
  admittingEvidenceState?: EvidenceState,
): string[] {
  const reasons: string[] = [];
  if (!policies.admission.admitOn.includes(signal.kind)) {
    reasons.push("ADMISSION_KIND_NOT_ALLOWED");
  }
  if (EVIDENCE_RANK[signal.evidenceState] < EVIDENCE_RANK[policies.admission.minimumEvidence]) {
    reasons.push("EVIDENCE_BELOW_ADMISSION_THRESHOLD");
  }
  if (
    admittingEvidenceState !== undefined &&
    EVIDENCE_RANK[signal.evidenceState] > EVIDENCE_RANK[admittingEvidenceState]
  ) {
    reasons.push("MEMORY_EVIDENCE_EXCEEDS_EXECUTION_EVIDENCE");
  }
  return reasons;
}

function major(version: string): string {
  const normalized = version.trim().replace(/^v/i, "");
  return normalized.split(/[.+-]/, 1)[0] || normalized;
}
