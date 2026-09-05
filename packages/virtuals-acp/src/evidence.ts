import { z } from "zod";
import type { EvidenceState } from "../../core/src/protocol.js";

const AcpHistorySchema = z.object({
  jobId: z.union([z.string(), z.number()]).transform(String),
  chainId: z.coerce.number().int().positive(),
  protocol: z.string().optional(),
  legacy: z.boolean().optional(),
  status: z.string().min(1),
  entryCount: z.coerce.number().int().nonnegative().optional(),
  entries: z.array(z.unknown()).default([]),
}).passthrough();

export type AcpJobHistory = z.infer<typeof AcpHistorySchema>;

export type AcpProviderExecutionEvidence = {
  sourceSystem: "VIRTUALS_ACP";
  jobId: string;
  chainId: number;
  protocol: string;
  status: string;
  providerId: string;
  taskType: string;
  urgency: "URGENT" | "ROUTINE";
  expectedLatencySeconds?: number;
  observedLatencySeconds?: number;
  failureType?: "SLA_BREACH" | "JOB_REJECTED" | "JOB_EXPIRED" | "UNKNOWN_FAILURE";
  evidenceState: EvidenceState;
  historyEntryCount: number;
  rawHistory: AcpJobHistory;
};

export type AcpEvidenceContext = {
  providerId: string;
  taskType: string;
  urgency: "URGENT" | "ROUTINE";
  expectedLatencySeconds?: number;
  startedAt?: Date;
  completedAt?: Date;
};

export function parseAcpJobHistory(input: unknown): AcpJobHistory {
  return AcpHistorySchema.parse(input);
}

export function acpHistoryToExecutionEvidence(
  input: unknown,
  context: AcpEvidenceContext,
): AcpProviderExecutionEvidence {
  const history = parseAcpJobHistory(input);
  const status = history.status.toLowerCase();
  const observedLatencySeconds = context.startedAt && context.completedAt
    ? Math.max(0, (context.completedAt.getTime() - context.startedAt.getTime()) / 1000)
    : undefined;

  let failureType: AcpProviderExecutionEvidence["failureType"];
  if (status === "rejected") failureType = "JOB_REJECTED";
  else if (status === "expired") failureType = "JOB_EXPIRED";
  else if (!["completed", "submitted", "funded", "budget_set", "open"].includes(status)) {
    failureType = "UNKNOWN_FAILURE";
  }

  // Latency is a secondary classification. It may classify an otherwise
  // successful/in-flight job as an SLA breach, but must not erase a stronger
  // terminal cause such as ACP rejection or expiry.
  if (
    failureType === undefined
    && context.expectedLatencySeconds !== undefined
    && observedLatencySeconds !== undefined
    && observedLatencySeconds > context.expectedLatencySeconds
  ) {
    failureType = "SLA_BREACH";
  }

  return {
    sourceSystem: "VIRTUALS_ACP",
    jobId: history.jobId,
    chainId: history.chainId,
    protocol: history.protocol ?? (history.legacy ? "legacy" : "v2"),
    status: history.status,
    providerId: context.providerId,
    taskType: context.taskType,
    urgency: context.urgency,
    expectedLatencySeconds: context.expectedLatencySeconds,
    observedLatencySeconds,
    failureType,
    evidenceState: "OBSERVED",
    historyEntryCount: history.entryCount ?? history.entries.length,
    rawHistory: history,
  };
}

export function acpEvidenceToEngramObservation(evidence: AcpProviderExecutionEvidence): {
  type: "VIRTUALS_ACP_JOB_OBSERVED";
  payload: Record<string, unknown>;
  evidenceState: EvidenceState;
  provenance: Array<Record<string, unknown>>;
} {
  return {
    type: "VIRTUALS_ACP_JOB_OBSERVED",
    payload: {
      sourceSystem: evidence.sourceSystem,
      providerId: evidence.providerId,
      taskType: evidence.taskType,
      urgency: evidence.urgency,
      jobId: evidence.jobId,
      chainId: evidence.chainId,
      protocol: evidence.protocol,
      status: evidence.status,
      expectedLatencySeconds: evidence.expectedLatencySeconds,
      observedLatencySeconds: evidence.observedLatencySeconds,
      failureType: evidence.failureType,
      historyEntryCount: evidence.historyEntryCount,
    },
    evidenceState: evidence.evidenceState,
    provenance: [{
      source: "Virtuals ACP",
      command: `acp job history --job-id ${evidence.jobId} --chain-id ${evidence.chainId} --json`,
      jobId: evidence.jobId,
      chainId: evidence.chainId,
      protocol: evidence.protocol,
    }],
  };
}
