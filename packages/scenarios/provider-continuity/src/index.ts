import type { OperationalMemory } from "../../../memory-core/src/domain.js";

export type ProviderId = "atlas" | "beacon";
export type ProviderUrgency = "URGENT" | "ROUTINE";

export type ProviderContinuityContext = {
  workflowType: "agent_provider_selection";
  taskType: "data_fetch";
  urgency: ProviderUrgency;
  budgetUsd: number;
  maxLatencySeconds: number;
  environmentVersion: string;
};

export type ProviderOffer = {
  providerId: ProviderId;
  priceUsd: number;
  expectedLatencySeconds: number;
};

export type ProviderTerms = {
  prepayBps: number;
  requireMilestoneVerification: boolean;
  maxSpendUsd: number;
};

export type ProviderDecision = {
  providerId: ProviderId;
  terms: ProviderTerms;
  memoryRefs: string[];
  reason: string;
  counterfactual?: {
    providerId: ProviderId;
    terms: ProviderTerms;
  };
};

export type ProviderExecutionResult = {
  status: "SUCCESS" | "FAILURE";
  providerId: ProviderId;
  latencySeconds: number;
  failureType?: "SLA_BREACH";
};

export type RecalledProviderMemory = {
  memory: OperationalMemory;
  finalScore: number;
};

const BASELINE_PREPAY_BPS = 5_000;
const GUARDED_PREPAY_BPS = 1_000;

function terms(maxSpendUsd: number, guarded = false): ProviderTerms {
  return {
    prepayBps: guarded ? GUARDED_PREPAY_BPS : BASELINE_PREPAY_BPS,
    requireMilestoneVerification: guarded,
    maxSpendUsd,
  };
}

function eligibleOffers(context: ProviderContinuityContext, offers: ProviderOffer[]): ProviderOffer[] {
  return offers
    .filter((offer) => offer.priceUsd <= context.budgetUsd)
    .filter((offer) => offer.expectedLatencySeconds <= context.maxLatencySeconds)
    .sort((a, b) => a.priceUsd - b.priceUsd || a.expectedLatencySeconds - b.expectedLatencySeconds);
}

function applicableRelationshipMemory(
  context: ProviderContinuityContext,
  memories: RecalledProviderMemory[],
): RecalledProviderMemory | undefined {
  return memories.find(({ memory, finalScore }) => {
    const c = memory.structuredContext;
    const sourceIds = Array.isArray(c.sourceExecutionIds) ? c.sourceExecutionIds : [];
    return finalScore >= 0.65
      && memory.confidence >= 0.8
      && c.workflowType === context.workflowType
      && c.memoryPrimitive === "EXPERIENTIAL_RELATIONSHIP"
      && c.taskType === context.taskType
      && c.providerId === "atlas"
      && c.relationshipPosture === "CONTEXT_GUARDED"
      && c.failureType === "SLA_BREACH"
      && Number(c.breachCount ?? 0) >= 2
      && sourceIds.length >= 2;
  });
}

export function decideProviderEngagement(input: {
  context: ProviderContinuityContext;
  offers: ProviderOffer[];
  memories: RecalledProviderMemory[];
}): ProviderDecision {
  const eligible = eligibleOffers(input.context, input.offers);
  if (!eligible.length) throw new Error("NO_ELIGIBLE_PROVIDER_OFFER");

  const baseline = eligible[0]!;
  const baselineTerms = terms(baseline.priceUsd);
  const relationship = applicableRelationshipMemory(input.context, input.memories);

  if (!relationship) {
    return {
      providerId: baseline.providerId,
      terms: baselineTerms,
      memoryRefs: [],
      reason: "No applicable experiential relationship memory changes the cheapest eligible provider offer.",
    };
  }

  const guardedProviderId = relationship.memory.structuredContext.providerId as ProviderId;

  if (input.context.urgency === "URGENT" && guardedProviderId === baseline.providerId) {
    const alternative = eligible.find((offer) => offer.providerId !== guardedProviderId);
    if (alternative) {
      return {
        providerId: alternative.providerId,
        terms: terms(alternative.priceUsd),
        memoryRefs: [relationship.memory.id],
        reason: "Repeated agent-specific SLA breaches make Atlas ineligible for this urgent task; select the next eligible provider.",
        counterfactual: { providerId: baseline.providerId, terms: baselineTerms },
      };
    }
  }

  if (baseline.providerId === guardedProviderId) {
    return {
      providerId: baseline.providerId,
      terms: terms(baseline.priceUsd, true),
      memoryRefs: [relationship.memory.id],
      reason: "Atlas remains economical for a routine task, but prior relationship experience reduces prepayment authority and requires milestone verification.",
      counterfactual: { providerId: baseline.providerId, terms: baselineTerms },
    };
  }

  return {
    providerId: baseline.providerId,
    terms: baselineTerms,
    memoryRefs: [],
    reason: "The remembered provider is not on the selected path, so it does not affect this engagement.",
  };
}

export function executeProviderEngagement(
  decision: ProviderDecision,
  context: ProviderContinuityContext,
): ProviderExecutionResult {
  if (decision.providerId === "atlas" && context.urgency === "URGENT") {
    return {
      status: "FAILURE",
      providerId: decision.providerId,
      latencySeconds: context.maxLatencySeconds + 25,
      failureType: "SLA_BREACH",
    };
  }

  return {
    status: "SUCCESS",
    providerId: decision.providerId,
    latencySeconds: decision.providerId === "beacon" ? 18 : 24,
  };
}
