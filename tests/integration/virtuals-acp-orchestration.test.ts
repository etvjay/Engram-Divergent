import { describe, expect, it } from "vitest";
import {
  authorizeAcpExecution,
  createAcpJob,
  fundAcpJob,
  ingestAcpOutcome,
  observeAcpJob,
  prepareAcpExecution,
  verifyFrozenAcpContract,
  type AcpExecutionPlan,
} from "../../packages/virtuals-acp/src/orchestration.js";

const plan: AcpExecutionPlan = {
  arm: "A0",
  taskId: "crypto-market-data-btc-v1",
  taskVersion: 1,
  input: { symbol: "BTC" },
  candidateKey: "hermes-data-provider:crypto-market-data",
  agentId: "019fe6b5-8dd1-7abe-bf53-9411ca6cae28",
  offeringId: "019fe6bb-2166-7d64-bb59-f500142b438a",
  chainId: 8453,
  maximumSpendUsdc: 0.03,
  expectedLatencySeconds: 300,
  catalogSnapshot: { manifest: "evidence/virtuals/catalog/20260907T062655Z/manifest.json", digest: "5479652180e4b879d68d724ee89451b0d7c2aa250557fbd78ff640a381099e76" },
  signerPolicy: "ACP_ONLY",
};

const frozenCatalog = plan.catalogSnapshot;

describe("Virtuals ACP live-readiness orchestration", () => {
  it("prepares A0 and stops before economic side effects", () => {
    const prepared = prepareAcpExecution({ plan, frozenCatalog });
    expect(prepared.state).toBe("A0_PREPARED");
    expect(prepared.authorizationRequired).toBe(true);
    expect(prepared.sideEffectOccurred).toBe(false);
    expect(() => createAcpJob(prepared, { jobId: "must-not-create" })).toThrow("ACP_INVALID_STATE:A0_PREPARED:expected=A0_AUTHORIZED");
  });

  it("requires explicit authorization before mocked lifecycle transitions", () => {
    const prepared = prepareAcpExecution({ plan, frozenCatalog });
    expect(() => authorizeAcpExecution(prepared, { approved: false, scope: "A0_JOB_CREATION" })).toThrow("ACP_ECONOMIC_AUTHORIZATION_REQUIRED");
    const authorized = authorizeAcpExecution(prepared, { approved: true, scope: "A0_JOB_CREATION" });
    const created = createAcpJob(authorized, { jobId: "fixture-job" });
    const funded = fundAcpJob(created, "fixture-receipt");
    const terminal = observeAcpJob(funded, true);
    expect(ingestAcpOutcome(terminal).state).toBe("A0_INGESTED");
  });

  it("rejects unknown, mismatched, over-budget, and out-of-SLA candidates", () => {
    const candidates = [{ candidateKey: plan.candidateKey, agentId: plan.agentId, offeringId: plan.offeringId, priceUsdc: 0.01, slaMinutes: 5 }];
    expect(() => verifyFrozenAcpContract({ frozenCandidates: candidates, contractCandidates: [{ ...candidates[0]!, candidateKey: "unknown" }], maximumSpendUsdc: 0.03, maximumLatencySeconds: 300 })).toThrow("ACP_UNKNOWN_CANDIDATE");
    expect(() => verifyFrozenAcpContract({ frozenCandidates: candidates, contractCandidates: [{ ...candidates[0]!, offeringId: "wrong-offering" }], maximumSpendUsdc: 0.03, maximumLatencySeconds: 300 })).toThrow("ACP_OFFERING_MISMATCH");
    expect(() => verifyFrozenAcpContract({ frozenCandidates: candidates, contractCandidates: [{ ...candidates[0]!, priceUsdc: 0.04 }], maximumSpendUsdc: 0.03, maximumLatencySeconds: 300 })).toThrow("ACP_PRICE_ABOVE_MAX_SPEND");
    expect(() => verifyFrozenAcpContract({ frozenCandidates: [{ ...candidates[0]!, slaMinutes: 10 }], contractCandidates: [{ ...candidates[0]!, slaMinutes: 10 }], maximumSpendUsdc: 0.03, maximumLatencySeconds: 300 })).toThrow("ACP_SLA_OUTSIDE_CONTRACT");
  });

  it("rejects a changed frozen catalog and non-A0 live preparation", () => {
    expect(() => prepareAcpExecution({ plan, frozenCatalog: { ...frozenCatalog, digest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } })).toThrow("ACP_CATALOG_SNAPSHOT_MISMATCH");
    expect(() => prepareAcpExecution({ plan: { ...plan, arm: "A2" }, frozenCatalog })).toThrow("ACP_PREPARE_LIVE_READINESS_ONLY_A0");
  });
});
