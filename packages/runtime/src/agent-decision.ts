import { z } from "zod";
import type { InfluenceGrant } from "../../memory-core/src/influence-grant.js";
import { assertInfluenceAllowed } from "../../experience/src/lineage.js";

export const AgentDecisionProposalSchema = z.object({
  executionId: z.string().uuid(),
  actor: z.object({
    runtime: z.string().min(1),
    model: z.string().min(1).optional(),
    instanceId: z.string().min(1).optional(),
  }),
  decisionType: z.string().min(1),
  proposedAction: z.record(z.string(), z.unknown()),
  reasoningSummary: z.string().min(1),
  memorySliceIds: z.array(z.string().uuid()).default([]),
  requestedEffects: z.array(z.string().min(1)).default([]),
  proposedAt: z.coerce.date(),
});

export type AgentDecisionProposal = z.infer<typeof AgentDecisionProposalSchema>;

/**
 * External models propose actions; Engram validates memory-derived authority.
 * This deliberately does not inspect model internals or depend on a provider SDK.
 */
export function assertAgentProposalAuthorizedByGrant(
  proposal: AgentDecisionProposal,
  grant: InfluenceGrant,
): void {
  if (proposal.executionId !== grant.consumerExecutionId) {
    throw new Error("AGENT_PROPOSAL_EXECUTION_GRANT_MISMATCH");
  }
  if (!proposal.memorySliceIds.includes(grant.memorySliceId)) {
    throw new Error("AGENT_PROPOSAL_MEMORY_SLICE_NOT_DECLARED");
  }
  for (const effect of proposal.requestedEffects) {
    assertInfluenceAllowed(grant, effect);
  }
}
