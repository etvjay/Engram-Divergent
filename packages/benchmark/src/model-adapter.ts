import { z } from "zod";
import {
  AgentDecisionProposalSchema,
  type AgentDecisionProposal,
} from "../../runtime/src/agent-decision.js";
import type { InfluenceGrant } from "../../memory-core/src/influence-grant.js";
import type { MemorySlice } from "../../memory-core/src/memory-slice.js";
import type { BenchmarkArm } from "../../evaluation/src/benchmark.js";

export const BenchmarkCandidateSchema = z.object({
  providerId: z.string().min(1),
  costUsd: z.number().nonnegative(),
  expectedLatencySeconds: z.number().nonnegative(),
});
export type BenchmarkCandidate = z.infer<typeof BenchmarkCandidateSchema>;

/**
 * The only view of execution memory a model adapter may ever see.
 * Adapters receive rendered slices/grants; they never receive a Sibyl handle,
 * a store, or any path around InfluenceGrant validation.
 */
export interface RenderedMemoryContext {
  arm: BenchmarkArm;
  rawHistoryText?: string;
  slices: MemorySlice[];
  grants: InfluenceGrant[];
  /** Grant ids the runner pre-qualified as currently eligible (e.g. not expired). */
  eligibleGrantIds: string[];
}

export interface ModelDecisionRequest {
  executionId: string;
  scenarioId: string;
  decisionType: string;
  mandate: {
    urgency: string;
    verificationRequired: boolean;
    maxLatencySeconds: number;
    maxBudgetUsd: number;
  };
  candidates: BenchmarkCandidate[];
  memory: RenderedMemoryContext;
}

export interface ModelAdapter {
  readonly model: string;
  readonly modelConfigDigest: string;
  propose(request: ModelDecisionRequest): Promise<AgentDecisionProposal>;
}

export function baseProposal(input: {
  request: ModelDecisionRequest;
  model: string;
  proposedAction: Record<string, unknown>;
  reasoningSummary: string;
  memorySliceIds?: string[];
  requestedEffects?: string[];
}): AgentDecisionProposal {
  return AgentDecisionProposalSchema.parse({
    executionId: input.request.executionId,
    actor: {
      runtime: "engram-benchmark",
      model: input.model,
    },
    decisionType: input.request.decisionType,
    proposedAction: input.proposedAction,
    reasoningSummary: input.reasoningSummary,
    memorySliceIds: input.memorySliceIds ?? [],
    requestedEffects: input.requestedEffects ?? [],
    proposedAt: new Date(),
  });
}

/** Human/model-readable rendering of the memory condition for a given arm. */
export function renderMemoryContextForModel(memory: RenderedMemoryContext): string {
  const lines: string[] = [];
  if (memory.rawHistoryText) {
    lines.push("RAW PRIOR HISTORY (unstructured, no authority attached):");
    lines.push(memory.rawHistoryText);
  }
  if (memory.slices.length > 0) {
    lines.push("STRUCTURED MEMORY SLICES:");
    for (const slice of memory.slices) {
      lines.push(
        JSON.stringify({
          id: slice.id,
          subject: slice.subject,
          claims: slice.claims,
          applicability: slice.applicability,
          confidence: slice.confidence,
          expiresAt: slice.expiresAt ?? null,
        }),
      );
    }
  }
  if (memory.grants.length > 0) {
    lines.push("INFLUENCE GRANTS (you may request ONLY effects listed as allowed):");
    for (const grant of memory.grants) {
      lines.push(
        JSON.stringify({
          id: grant.id,
          memorySliceId: grant.memorySliceId,
          allowedEffects: grant.allowedEffects,
          deniedEffects: grant.deniedEffects,
          constraints: grant.constraints,
          expiresAt: grant.expiresAt ?? null,
        }),
      );
    }
  }
  if (lines.length === 0) lines.push("NO MEMORY CONTEXT PROVIDED FOR THIS RUN.");
  return lines.join("\n");
}
