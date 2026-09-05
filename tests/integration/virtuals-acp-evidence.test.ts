import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  acpEvidenceToEngramObservation,
  acpHistoryToExecutionEvidence,
  parseAcpJobHistory,
} from "../../packages/virtuals-acp/src/evidence.js";

async function fixture() {
  const raw = await readFile(resolve(process.cwd(), "tests/fixtures/virtuals-acp/completed-job-history.json"), "utf8");
  return JSON.parse(raw) as unknown;
}

describe("Virtuals ACP evidence adapter", () => {
  it("normalizes a current v2 history shape without inventing failure", async () => {
    const history = await fixture();
    const parsed = parseAcpJobHistory(history);
    expect(parsed).toMatchObject({
      jobId: "engram-acp-fixture-001",
      chainId: 84532,
      protocol: "v2",
      status: "completed",
      entryCount: 5,
    });

    const evidence = acpHistoryToExecutionEvidence(history, {
      providerId: "0xProviderFixture",
      taskType: "data_fetch",
      urgency: "ROUTINE",
      expectedLatencySeconds: 60,
      startedAt: new Date("2026-08-28T12:00:00.000Z"),
      completedAt: new Date("2026-08-28T12:00:40.000Z"),
    });

    expect(evidence).toMatchObject({
      sourceSystem: "VIRTUALS_ACP",
      chainId: 84532,
      protocol: "v2",
      status: "completed",
      providerId: "0xProviderFixture",
      observedLatencySeconds: 40,
      evidenceState: "OBSERVED",
      historyEntryCount: 5,
    });
    expect(evidence.failureType).toBeUndefined();

    const observation = acpEvidenceToEngramObservation(evidence);
    expect(observation).toMatchObject({
      type: "VIRTUALS_ACP_JOB_OBSERVED",
      evidenceState: "OBSERVED",
      payload: {
        jobId: "engram-acp-fixture-001",
        chainId: 84532,
        providerId: "0xProviderFixture",
      },
    });
    expect(observation.provenance[0]).toMatchObject({
      source: "Virtuals ACP",
      jobId: "engram-acp-fixture-001",
      chainId: 84532,
    });
  });

  it("classifies an SLA breach only from explicit expected and observed timing", async () => {
    const evidence = acpHistoryToExecutionEvidence(await fixture(), {
      providerId: "0xProviderFixture",
      taskType: "data_fetch",
      urgency: "URGENT",
      expectedLatencySeconds: 30,
      startedAt: new Date("2026-08-28T12:00:00.000Z"),
      completedAt: new Date("2026-08-28T12:00:55.000Z"),
    });
    expect(evidence.failureType).toBe("SLA_BREACH");
    expect(evidence.observedLatencySeconds).toBe(55);
  });

  it("preserves rejected and expired jobs as distinct failure classes", () => {
    const rejected = acpHistoryToExecutionEvidence({
      jobId: "job-rejected",
      chainId: 84532,
      protocol: "v2",
      status: "rejected",
      entries: [],
    }, {
      providerId: "0xProviderFixture",
      taskType: "data_fetch",
      urgency: "ROUTINE",
      expectedLatencySeconds: 30,
      startedAt: new Date("2026-08-28T12:00:00.000Z"),
      completedAt: new Date("2026-08-28T12:02:00.000Z"),
    });
    const expired = acpHistoryToExecutionEvidence({
      jobId: "job-expired",
      chainId: 84532,
      protocol: "v2",
      status: "expired",
      entries: [],
    }, {
      providerId: "0xProviderFixture",
      taskType: "data_fetch",
      urgency: "ROUTINE",
      expectedLatencySeconds: 30,
      startedAt: new Date("2026-08-28T12:00:00.000Z"),
      completedAt: new Date("2026-08-28T12:02:00.000Z"),
    });

    expect(rejected.failureType).toBe("JOB_REJECTED");
    expect(expired.failureType).toBe("JOB_EXPIRED");
  });

  it("fails closed on malformed ACP history", () => {
    expect(() => parseAcpJobHistory({ status: "completed", entries: [] })).toThrow();
    expect(() => parseAcpJobHistory({ jobId: "x", chainId: -1, status: "completed", entries: [] })).toThrow();
  });
});
