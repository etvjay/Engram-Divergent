import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  CounterfactualSchema,
  MemoryInfluenceSchema,
  MemoryRecallSchema,
} from "../../packages/core/src/protocol.js";
import { validateDecisionInfluences } from "../../packages/core/src/validate.js";
import { ExecutionEpisodeSchema, EXECUTION_EPISODE_SCHEMA_VERSION } from "../../packages/episode/src/schema.js";
import {
  AdmissionPolicySchema,
  ExpiryPolicySchema,
  InfluencePolicySchema,
  MEMORY_POLICY_CONTRACT_VERSION,
  RetrievalPolicySchema,
} from "../../packages/policy/src/contracts.js";

function uuid() {
  return randomUUID();
}

describe("Engram protocol conformance", () => {
  it("allows recall without claiming influence", () => {
    const retrievalId = uuid();
    const memoryId = uuid();
    const executionId = uuid();
    const recall = MemoryRecallSchema.parse({
      id: retrievalId,
      executionId,
      query: "prior deployment failures in this environment",
      policyVersion: "retrieval-v1",
      recalledAt: new Date(),
      candidates: [{ retrievalId, memoryId, rank: 1, score: 0.91 }],
    });

    expect(recall.candidates).toHaveLength(1);
    expect(validateDecisionInfluences({ executionId, influences: [] }, [recall])).toEqual([]);
  });

  it("rejects influence when the memory was never recalled", () => {
    const executionId = uuid();
    const influence = MemoryInfluenceSchema.parse({
      memoryId: uuid(),
      influenceType: "SUPPORTED_ACTION",
      summary: "The prior outcome supported the selected action.",
    });

    const violations = validateDecisionInfluences({ executionId, influences: [influence] }, []);
    expect(violations.map((violation) => violation.code)).toContain("INFLUENCE_WITHOUT_RECALL");
  });

  it("rejects a retrieval id that did not return the influential memory", () => {
    const executionId = uuid();
    const memoryId = uuid();
    const recallId = uuid();
    const wrongRecallId = uuid();
    const recall = MemoryRecallSchema.parse({
      id: recallId,
      executionId,
      query: "similar failures",
      policyVersion: "retrieval-v1",
      recalledAt: new Date(),
      candidates: [{ retrievalId: recallId, memoryId, rank: 1 }],
    });
    const influence = MemoryInfluenceSchema.parse({
      memoryId,
      retrievalId: wrongRecallId,
      influenceType: "CONSIDERED",
      summary: "The memory was considered but not selected.",
    });

    const violations = validateDecisionInfluences({ executionId, influences: [influence] }, [recall]);
    expect(violations.map((violation) => violation.code)).toContain("RETRIEVAL_MISMATCH");
  });

  it("requires a sourced counterfactual for CHANGED_ACTION", () => {
    const executionId = uuid();
    const memoryId = uuid();
    const recallId = uuid();
    const recall = MemoryRecallSchema.parse({
      id: recallId,
      executionId,
      query: "comparable prior failures",
      policyVersion: "retrieval-v1",
      recalledAt: new Date(),
      candidates: [{ retrievalId: recallId, memoryId, rank: 1 }],
    });
    const influence = MemoryInfluenceSchema.parse({
      memoryId,
      retrievalId: recallId,
      influenceType: "CHANGED_ACTION",
      summary: "The prior failure changed the selected route.",
    });

    const violations = validateDecisionInfluences({ executionId, influences: [influence] }, [recall]);
    expect(violations.map((violation) => violation.code)).toContain("CHANGED_ACTION_WITHOUT_COUNTERFACTUAL");
  });

  it("requires an explicit counterfactual source", () => {
    expect(() => CounterfactualSchema.parse({
      action: { route: "C" },
      evidenceState: "OBSERVED",
      explanation: "baseline action",
    })).toThrow();
  });

  it("accepts an influence only when its semantics are explicit", () => {
    const influence = MemoryInfluenceSchema.parse({
      memoryId: uuid(),
      retrievalId: uuid(),
      influenceType: "CHANGED_ACTION",
      summary: "Prior failure caused the agent to avoid the baseline action.",
      counterfactual: {
        action: { route: "C" },
        source: "CONTROL_RUN",
        evidenceState: "OBSERVED",
        explanation: "Control run selected Route C without memory.",
      },
    });

    expect(influence.influenceType).toBe("CHANGED_ACTION");
  });

  it("validates the portable execution episode envelope", () => {
    const episode = ExecutionEpisodeSchema.parse({
      schemaVersion: EXECUTION_EPISODE_SCHEMA_VERSION,
      protocolVersion: "engram.protocol/v1",
      id: uuid(),
      agent: { id: "deployment-agent", version: "1.0.0" },
      workflowType: "deployment",
      intent: "Deploy service safely",
      context: { service: "api" },
      constraints: { environment: "production" },
      environment: { environmentVersion: "prod-2026-08" },
      startedAt: new Date(),
      decisions: [],
      observations: [],
      provenance: [],
    });

    expect(episode.schemaVersion).toBe("engram.execution-episode/v1");
  });

  it("validates all four memory policy classes", () => {
    expect(AdmissionPolicySchema.parse({
      contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
      policyVersion: "admission-v1",
      admitOn: ["UNEXPECTED_FAILURE"],
      minimumEvidence: "OBSERVED",
    }).policyVersion).toBe("admission-v1");

    expect(RetrievalPolicySchema.parse({
      contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
      policyVersion: "retrieval-v1",
      maxCandidates: 8,
      minimumScore: 0.6,
      requireEnvironmentMatch: true,
      allowExpired: false,
    }).maxCandidates).toBe(8);

    expect(InfluencePolicySchema.parse({
      contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
      policyVersion: "influence-v1",
      allowedEvidenceStates: ["VERIFIED", "OBSERVED"],
      minimumConfidence: 0.85,
      requireCounterfactualForChangedAction: true,
    }).minimumConfidence).toBe(0.85);

    expect(ExpiryPolicySchema.parse({
      contractVersion: MEMORY_POLICY_CONTRACT_VERSION,
      policyVersion: "expiry-v1",
      invalidateOnEnvironmentChange: true,
      invalidateOnToolMajorVersionChange: true,
    }).invalidateOnEnvironmentChange).toBe(true);
  });
});
