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
  /**
   * May contain runner-side slice labels (SLICE-1, …) or real UUIDs; the runner
   * normalizes labels to real ids and re-validates the full proposal before
   * any authority check.
   */
  memorySliceIds?: string[];
  requestedEffects?: string[];
}): AgentDecisionProposal {
  const parsed = AgentDecisionProposalSchema.parse({
    executionId: input.request.executionId,
    actor: {
      runtime: "engram-benchmark",
      model: input.model,
    },
    decisionType: input.request.decisionType,
    proposedAction: input.proposedAction,
    reasoningSummary: input.reasoningSummary,
    memorySliceIds: [],
    requestedEffects: input.requestedEffects ?? [],
    proposedAt: new Date(),
  });
  // Preserve raw (possibly label-form) slice references past uuid validation;
  // the runner maps them back to real ids before authorization.
  return { ...parsed, memorySliceIds: input.memorySliceIds ?? [] };
}

/** Human/model-readable rendering of the memory condition for a given arm. */
export function renderMemoryContextForModel(memory: RenderedMemoryContext): string {
  const lines: string[] = [];
  if (memory.rawHistoryText) {
    lines.push("RAW PRIOR HISTORY (unstructured, no authority attached):");
    lines.push(memory.rawHistoryText);
  }
  if (memory.slices.length > 0) {
    lines.push("STRUCTURED MEMORY SLICES (refer to slices ONLY by their SLICE-n label):");
    memory.slices.forEach((slice, index) => {
      lines.push(
        JSON.stringify({
          label: `SLICE-${index + 1}`,
          subject: slice.subject,
          claims: slice.claims,
          applicability: slice.applicability,
          confidence: slice.confidence,
          expiresAt: slice.expiresAt ?? null,
        }),
      );
    });
  }
  if (memory.grants.length > 0) {
    lines.push("INFLUENCE GRANTS (you may request ONLY effects listed as allowed):");
    memory.grants.forEach((grant, index) => {
      const sliceIndex = memory.slices.findIndex((slice) => slice.id === grant.memorySliceId);
      lines.push(
        JSON.stringify({
          label: `GRANT-${index + 1}`,
          slice: sliceIndex >= 0 ? `SLICE-${sliceIndex + 1}` : null,
          allowedEffects: grant.allowedEffects,
          deniedEffects: grant.deniedEffects,
          constraints: grant.constraints,
          expiresAt: grant.expiresAt ?? null,
        }),
      );
    });
  }
  if (lines.length === 0) lines.push("NO MEMORY CONTEXT PROVIDED FOR THIS RUN.");
  return lines.join("\n");
}

/**
 * Small models decorate, pretty-print, or fence their JSON. Extract the outermost
 * JSON object and parse that; fail closed if none parses.
 */
export function parseModelJsonObject(content: string, adapterName: string): Record<string, unknown> {
  const trimmed = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    const direct = JSON.parse(trimmed);
    if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct as Record<string, unknown>;
  } catch {
    // fall through to extraction
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const extracted = JSON.parse(trimmed.slice(start, end + 1));
      if (extracted && typeof extracted === "object" && !Array.isArray(extracted)) {
        return extracted as Record<string, unknown>;
      }
    } catch {
      // reported below
    }
  }
  throw new Error(`${adapterName}_INVALID_RESPONSE: content was not JSON (${trimmed.length} chars): ${trimmed.slice(0, 200)}`);
}
