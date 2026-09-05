import type { OperationalMemory, Outcome } from "./domain.js";
import { randomUUID } from "node:crypto";

export type FailureRecoveryObservation = {
  failedResource?: string;
  failureType?: string;
  recoveryStrategy?: string;
  recoverySucceeded?: boolean;
};

export type AdmissionInput = {
  agentId: string;
  executionId: string;
  workflowType: string;
  environmentVersion?: string;
  toolVersion?: string;
  policyVersion?: string;
  outcome: Outcome;
  observation: FailureRecoveryObservation;
};

/**
 * Memory admission operates only on core operational semantics. Demo/runtime
 * adapters translate their own result shapes into FailureRecoveryObservation.
 */
export function admitOperationalMemory(input: AdmissionInput): OperationalMemory | null {
  const { outcome, observation } = input;
  const notable = ["COMPENSATED", "FAILURE", "PARTIAL", "ABORTED", "UNKNOWN"].includes(outcome.status);

  if (!notable) return null;
  if (!observation.failedResource || !observation.failureType) return null;

  return {
    id: randomUUID(),
    agentId: input.agentId,
    memoryType: "OPERATIONAL_LESSON",
    summary: `${observation.failedResource} failed with ${observation.failureType}; avoid the same dependency under comparable conditions or revalidate it before committing preceding actions.`,
    structuredContext: {
      workflowType: input.workflowType,
      sourceExecutionId: input.executionId,
      failureType: observation.failureType,
      failedResource: observation.failedResource,
      failedVenue: observation.failedResource,
      outcome: outcome.status,
      recoveryStrategy: observation.recoveryStrategy,
      recoverySucceeded: observation.recoverySucceeded ?? false,
    },
    confidence: outcome.status === "COMPENSATED" && observation.recoverySucceeded ? 0.91 : 0.82,
    evidenceState: outcome.evidenceState,
    environmentVersion: input.environmentVersion,
    toolVersion: input.toolVersion,
    policyVersion: input.policyVersion,
  };
}
