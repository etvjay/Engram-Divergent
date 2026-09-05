import { describe, expect, it } from "vitest";
import {
  acpHistoryToExecutionEvidence,
  acpEvidenceToEngramObservation,
  parseAcpJobHistory,
} from "../../packages/virtuals-acp/src/evidence.js";

describe("Virtuals ACP evidence adapter", () => {
  it("parses the maintained ACP v2 job-history JSON shape", () => {
    const parsed = parseAcpJobHistory({
      jobId: "42",
      chainId: 84532,
      protocol: "v2",
      status: "completed",
      entryCount: 3,
      entries: [
        { kind: "system", event: { type: "job.created" } },
        { kind: "message", contentType: "requirement", content: "{}" },
        { kind: "system", event: { type: "job.completed" } },
      ],
    });

    expect(parsed).toMatchObject({ jobId: "42", chainId: 84532, protocol: "v2", status: "completed", entryCount: 3 });
  });

  it("classifies an over-SLA completed job as observed SLA-breach evidence", () => {
    const startedAt = new Date("2026-08-24T10:00:00Z");
    const completedAt = new Date("2026-08-24T10:00:55Z");
    const evidence = acpHistoryToExecutionEvidence({
      jobId: "42",
      chainId: 84532,
      protocol: "v2",
      status: "completed",
      entryCount: 4,
      entries: [],
    }, {
      providerId: "0xAtlas",
      taskType: "data_fetch",
      urgency: "URGENT",
      expectedLatencySeconds: 30,
      startedAt,
      completedAt,
    });

    expect(evidence).toMatchObject({
      sourceSystem: "VIRTUALS_ACP",
      failureType: "SLA_BREACH",
      observedLatencySeconds: 55,
      evidenceState: "OBSERVED",
    });

    const observation = acpEvidenceToEngramObservation(evidence);
    expect(observation.type).toBe("VIRTUALS_ACP_JOB_OBSERVED");
    expect(observation.payload).toMatchObject({ jobId: "42", chainId: 84532, failureType: "SLA_BREACH" });
    expect(observation.provenance[0]).toMatchObject({ source: "Virtuals ACP", jobId: "42", chainId: 84532 });
  });

  it("preserves rejected and expired terminal states without pretending they are SLA failures", () => {
    const rejected = acpHistoryToExecutionEvidence({
      jobId: 7,
      chainId: 84532,
      protocol: "v2",
      status: "rejected",
      entries: [],
    }, {
      providerId: "0xAtlas",
      taskType: "data_fetch",
      urgency: "URGENT",
    });
    const expired = acpHistoryToExecutionEvidence({
      jobId: 8,
      chainId: 84532,
      protocol: "v2",
      status: "expired",
      entries: [],
    }, {
      providerId: "0xAtlas",
      taskType: "data_fetch",
      urgency: "URGENT",
    });

    expect(rejected.failureType).toBe("JOB_REJECTED");
    expect(expired.failureType).toBe("JOB_EXPIRED");
  });

  it("fails closed on malformed ACP history rather than fabricating evidence", () => {
    expect(() => parseAcpJobHistory({ status: "completed", entries: [] })).toThrow();
  });
});
