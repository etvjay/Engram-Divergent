import {
  baseProposal,
  type ModelAdapter,
  type ModelDecisionRequest,
} from "../model-adapter.js";

/**
 * Rule-based adapter for dependency-free local runs. It acts ONLY on eligible,
 * grant-authorized structured memory — deliberately ignoring raw history — so
 * the causal contrast A2 vs A0/A1 is a property of authorized memory alone.
 * Every emitted effect is copied from a grant's allowedEffects; the runner
 * re-validates through assertAgentProposalAuthorizedByGrant regardless.
 */
export function createDeterministicAdapter(): ModelAdapter {
  const model = "deterministic-rules-v1";
  const base = {
    model,
    modelConfigDigest: "deterministic-rules-config-v1",
  };

  function pickBaseCandidate(request: ModelDecisionRequest) {
    // The naive agent is cost-minimizing and cannot see hidden SLA risk:
    // ground truth is evaluator-side; memory is the only information channel.
    const eligible = [...request.candidates].sort((a, b) => a.costUsd - b.costUsd);
    const cheapest = eligible[0];
    if (!cheapest) throw new Error("BENCHMARK_NO_CANDIDATES");
    return cheapest;
  }

  function findAuthorizedSubstitution(request: ModelDecisionRequest) {
    for (const grantId of request.memory.eligibleGrantIds) {
      const grant = request.memory.grants.find((candidate) => candidate.id === grantId);
      if (!grant) continue;
      const awayFrom = grant.constraints.substituteAwayFromProviderId;
      const toward = grant.constraints.substituteProviderId;
      if (typeof awayFrom !== "string" || typeof toward !== "string") continue;
      const fromCandidate = request.candidates.find((candidate) => candidate.providerId === awayFrom);
      const toCandidate = request.candidates.find((candidate) => candidate.providerId === toward);
      if (!fromCandidate || !toCandidate) continue; // non-applicable grant (A3 discipline)
      const slice = request.memory.slices.find((candidate) => candidate.id === grant.memorySliceId);
      if (!slice) continue;
      return { grant, slice, toCandidate };
    }
    return null;
  }

  return {
    ...base,
    async propose(request: ModelDecisionRequest) {
      const baseCandidate = pickBaseCandidate(request);
      const substitution = findAuthorizedSubstitution(request);
      if (!substitution) {
        return baseProposal({
          request,
          model,
          proposedAction: { provider: baseCandidate.providerId },
          reasoningSummary: `No eligible authorized memory applies; selected cheapest compliant candidate ${baseCandidate.providerId}.`,
        });
      }
      const { grant, slice, toCandidate } = substitution;
      const maxPrepayFraction =
        typeof grant.constraints.maxPrepayFraction === "number" ? grant.constraints.maxPrepayFraction : 0.1;
      const requireMilestoneVerification = grant.constraints.requireMilestoneVerification === true;
      return baseProposal({
        request,
        model,
        proposedAction: {
          provider: toCandidate.providerId,
          substituteAwayFromProviderId: grant.constraints.substituteAwayFromProviderId,
          prepayFraction: maxPrepayFraction,
          milestoneVerification: requireMilestoneVerification,
        },
        reasoningSummary: `Eligible execution memory (slice ${slice.id}) flags ${String(
          grant.constraints.substituteAwayFromProviderId,
        )}; grant ${grant.id} authorizes substitution to ${toCandidate.providerId} with reduced prepayment.`,
        memorySliceIds: [slice.id],
        requestedEffects: grant.allowedEffects.filter((effect) =>
          ["PROVIDER_SUBSTITUTION", "PREPAYMENT_REDUCTION", "MILESTONE_VERIFICATION"].includes(effect),
        ),
      });
    },
  };
}
