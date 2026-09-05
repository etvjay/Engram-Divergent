import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OperationalMemory } from "../../packages/memory-core/src/domain.js";
import {
  decideProviderEngagement,
  executeProviderEngagement,
  type ProviderContinuityContext,
  type ProviderOffer,
} from "../../packages/scenarios/provider-continuity/src/index.js";

const offers: ProviderOffer[] = [
  { providerId: "atlas", priceUsd: 8, expectedLatencySeconds: 20 },
  { providerId: "beacon", priceUsd: 11, expectedLatencySeconds: 18 },
];

const urgent: ProviderContinuityContext = {
  workflowType: "agent_provider_selection",
  taskType: "data_fetch",
  urgency: "URGENT",
  budgetUsd: 20,
  maxLatencySeconds: 30,
  environmentVersion: "provider-market-v1",
};

function relationshipMemory(overrides: Partial<OperationalMemory> = {}): OperationalMemory {
  const sources = [randomUUID(), randomUUID()];
  return {
    id: randomUUID(),
    agentId: "requester-agent",
    memoryType: "REPEATED_PATTERN",
    summary: "Across two requester-owned executions, Atlas repeatedly breached urgent data-fetch SLAs. Guard urgent delegation and reduce prepayment authority on routine work.",
    structuredContext: {
      workflowType: "agent_provider_selection",
      memoryPrimitive: "EXPERIENTIAL_RELATIONSHIP",
      taskType: "data_fetch",
      providerId: "atlas",
      relationshipPosture: "CONTEXT_GUARDED",
      failureType: "SLA_BREACH",
      breachCount: 2,
      sourceExecutionId: sources[1],
      sourceExecutionIds: sources,
      outcome: "PARTIAL",
    },
    confidence: 0.92,
    evidenceState: "OBSERVED",
    validFrom: new Date(),
    ...overrides,
  };
}

describe("experiential provider continuity", () => {
  it("changes provider for an urgent task after repeated relationship-specific SLA breaches", () => {
    const baseline = decideProviderEngagement({ context: urgent, offers, memories: [] });
    expect(baseline.providerId).toBe("atlas");
    expect(executeProviderEngagement(baseline, urgent)).toMatchObject({ status: "FAILURE", failureType: "SLA_BREACH" });

    const memory = relationshipMemory();
    const treatment = decideProviderEngagement({
      context: urgent,
      offers,
      memories: [{ memory, finalScore: 0.98 }],
    });
    expect(treatment.providerId).toBe("beacon");
    expect(treatment.memoryRefs).toEqual([memory.id]);
    expect(treatment.counterfactual?.providerId).toBe("atlas");
    expect(executeProviderEngagement(treatment, urgent).status).toBe("SUCCESS");
  });

  it("does not globally blacklist the provider; routine work changes terms instead", () => {
    const memory = relationshipMemory();
    const routine: ProviderContinuityContext = { ...urgent, urgency: "ROUTINE" };
    const decision = decideProviderEngagement({
      context: routine,
      offers,
      memories: [{ memory, finalScore: 0.98 }],
    });

    expect(decision.providerId).toBe("atlas");
    expect(decision.terms.prepayBps).toBe(1_000);
    expect(decision.terms.requireMilestoneVerification).toBe(true);
    expect(decision.counterfactual?.terms.prepayBps).toBe(5_000);
  });

  it("requires multi-execution provenance rather than treating one bad interaction as relationship state", () => {
    const memory = relationshipMemory({
      structuredContext: {
        workflowType: "agent_provider_selection",
        memoryPrimitive: "EXPERIENTIAL_RELATIONSHIP",
        taskType: "data_fetch",
        providerId: "atlas",
        relationshipPosture: "CONTEXT_GUARDED",
        failureType: "SLA_BREACH",
        breachCount: 1,
        sourceExecutionId: randomUUID(),
        sourceExecutionIds: [randomUUID()],
        outcome: "PARTIAL",
      },
    });
    const decision = decideProviderEngagement({
      context: urgent,
      offers,
      memories: [{ memory, finalScore: 0.99 }],
    });
    expect(decision.providerId).toBe("atlas");
    expect(decision.memoryRefs).toEqual([]);
  });

  it("does not transfer experience from a different task type solely because retrieval score is high", () => {
    const memory = relationshipMemory({
      structuredContext: {
        ...relationshipMemory().structuredContext,
        taskType: "code_review",
      },
    });
    const decision = decideProviderEngagement({
      context: urgent,
      offers,
      memories: [{ memory, finalScore: 0.99 }],
    });
    expect(decision.providerId).toBe("atlas");
    expect(decision.memoryRefs).toEqual([]);
  });
});
