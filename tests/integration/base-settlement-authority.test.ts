import { describe, expect, it } from "vitest";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  deriveBaseSettlementIntent,
} from "../../packages/base-settlement/src/index.js";
import {
  decideProviderEngagement,
  type ProviderContinuityContext,
  type ProviderOffer,
  type RecalledProviderMemory,
} from "../../packages/scenarios/provider-continuity/src/index.js";
import type { OperationalMemory } from "../../packages/memory-core/src/domain.js";

const addresses = {
  atlas: "0x1111111111111111111111111111111111111111",
  beacon: "0x2222222222222222222222222222222222222222",
};

const offers: ProviderOffer[] = [
  { providerId: "atlas", priceUsd: 8, expectedLatencySeconds: 20 },
  { providerId: "beacon", priceUsd: 11, expectedLatencySeconds: 18 },
];

function relationshipMemory(): RecalledProviderMemory {
  return {
    finalScore: 0.99,
    memory: {
      id: "memory-atlas-guarded",
      agentId: "requester-agent",
      workflowType: "agent_provider_selection",
      memoryType: "REPEATED_PATTERN",
      summary: "Repeated Atlas SLA breaches.",
      structuredContext: {
        workflowType: "agent_provider_selection",
        memoryPrimitive: "EXPERIENTIAL_RELATIONSHIP",
        taskType: "data_fetch",
        providerId: "atlas",
        relationshipPosture: "CONTEXT_GUARDED",
        failureType: "SLA_BREACH",
        breachCount: 2,
        sourceExecutionIds: ["exec-1", "exec-2"],
      },
      sourceExecutionIds: ["exec-1", "exec-2"],
      confidence: 0.92,
      evidenceState: "OBSERVED",
      status: "ACTIVE",
      createdAt: new Date("2026-08-29T00:00:00.000Z"),
      updatedAt: new Date("2026-08-29T00:00:00.000Z"),
    } as OperationalMemory,
  };
}

function context(urgency: "URGENT" | "ROUTINE"): ProviderContinuityContext {
  return {
    workflowType: "agent_provider_selection",
    taskType: "data_fetch",
    urgency,
    budgetUsd: 20,
    maxLatencySeconds: 30,
    environmentVersion: "provider-market-v1",
  };
}

describe("Base settlement authority", () => {
  it("turns remembered urgent provider experience into a different Base recipient", () => {
    const baseline = decideProviderEngagement({ context: context("URGENT"), offers, memories: [] });
    const conditioned = decideProviderEngagement({
      context: context("URGENT"),
      offers,
      memories: [relationshipMemory()],
    });

    const baselineIntent = deriveBaseSettlementIntent({
      decision: baseline,
      addresses,
      provenance: { executionId: "exec-new" },
    });
    const conditionedIntent = deriveBaseSettlementIntent({
      decision: conditioned,
      addresses,
      provenance: { executionId: "exec-new", retrievalId: "retrieval-1" },
    });

    expect(baselineIntent).toMatchObject({
      chainId: BASE_SEPOLIA_CHAIN_ID,
      tokenAddress: BASE_SEPOLIA_USDC,
      providerId: "atlas",
      recipient: addresses.atlas,
    });
    expect(conditionedIntent).toMatchObject({
      providerId: "beacon",
      recipient: addresses.beacon,
      memoryRefs: ["memory-atlas-guarded"],
    });
    expect(conditionedIntent.recipient).not.toBe(baselineIntent.recipient);
    expect(conditionedIntent.counterfactual?.recipient).toBe(addresses.atlas);
  });

  it("turns remembered routine experience into a smaller authorized Base prepayment", () => {
    const baseline = decideProviderEngagement({ context: context("ROUTINE"), offers, memories: [] });
    const conditioned = decideProviderEngagement({
      context: context("ROUTINE"),
      offers,
      memories: [relationshipMemory()],
    });

    const baselineIntent = deriveBaseSettlementIntent({
      decision: baseline,
      addresses,
      provenance: { executionId: "exec-routine" },
    });
    const conditionedIntent = deriveBaseSettlementIntent({
      decision: conditioned,
      addresses,
      provenance: { executionId: "exec-routine", retrievalId: "retrieval-routine" },
    });

    expect(baselineIntent.providerId).toBe("atlas");
    expect(conditionedIntent.providerId).toBe("atlas");
    expect(baselineIntent.terms.authorizedPrepayUsd).toBe("4.000000");
    expect(conditionedIntent.terms.authorizedPrepayUsd).toBe("0.800000");
    expect(conditionedIntent.terms.authorizedPrepayAtomic).toBe(800_000n);
    expect(conditionedIntent.terms.requireMilestoneVerification).toBe(true);
    expect(conditionedIntent.counterfactual?.terms.authorizedPrepayUsd).toBe("4.000000");
  });

  it("fails closed on malformed provider addresses", () => {
    const decision = decideProviderEngagement({ context: context("URGENT"), offers, memories: [] });
    expect(() => deriveBaseSettlementIntent({
      decision,
      addresses: { ...addresses, atlas: "not-an-address" },
      provenance: { executionId: "exec-invalid" },
    })).toThrow("INVALID_PROVIDER_ADDRESS");
  });
});
