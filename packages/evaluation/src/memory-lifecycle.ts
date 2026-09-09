import { z } from "zod";
import { EvidenceStateSchema } from "../../memory-core/src/domain.js";
import { ExecutionMemorySchema, type ExecutionMemory } from "../../memory-core/src/execution-memory.js";
import { BehavioralMemoryEvaluationSchema, MemoryUpdateDirectiveSchema, type BehavioralMemoryEvaluation } from "./memory-evaluation.js";

export const MemoryUpdateRecordSchema = z.object({
  id: z.string().uuid(),
  priorMemoryId: z.string().uuid(),
  evaluationId: z.string().uuid(),
  influencedExecutionId: z.string().uuid(),
  newMemoryId: z.string().uuid(),
  directive: MemoryUpdateDirectiveSchema,
  evidenceState: EvidenceStateSchema,
  rationale: z.string().min(1),
  createdAt: z.coerce.date(),
});
export type MemoryUpdateRecord = z.infer<typeof MemoryUpdateRecordSchema>;

function nextConfidence(prior: number, directive: BehavioralMemoryEvaluation["updateDirective"]): number {
  if (directive === "STRENGTHEN") return Math.min(1, prior + 0.1);
  if (directive === "WEAKEN") return Math.max(0, prior - 0.15);
  if (directive === "INVALIDATE") return 0;
  return prior;
}

function nextState(prior: ExecutionMemory["state"], directive: BehavioralMemoryEvaluation["updateDirective"]): ExecutionMemory["state"] {
  switch (directive) {
    case "STRENGTHEN": return "SUPPORTED";
    case "WEAKEN":
    case "QUALIFY": return "QUALIFIED";
    case "INVALIDATE": return "INVALIDATED";
    case "SUPERSEDE": return "ADMITTED";
    case "NO_CHANGE": return prior;
  }
}

export function applyMemoryUpdate(input: {
  prior: ExecutionMemory;
  evaluation: BehavioralMemoryEvaluation;
  newMemoryId: string;
  updateRecordId?: string;
}): { priorMemory: ExecutionMemory; memory: ExecutionMemory; record: MemoryUpdateRecord } {
  const prior = ExecutionMemorySchema.parse(input.prior);
  const evaluation = BehavioralMemoryEvaluationSchema.parse(input.evaluation);
  if (evaluation.executionMemoryId !== prior.id) throw new Error("MEMORY_UPDATE_PRIOR_MISMATCH");
  if (evaluation.updateDirective === "NO_CHANGE" && evaluation.effect === "UNKNOWN") {
    // Unknown evidence is still an explicit immutable version, but cannot alter confidence or state.
  }
  const memory = ExecutionMemorySchema.parse({
    ...prior,
    id: input.newMemoryId,
    confidence: nextConfidence(prior.confidence, evaluation.updateDirective),
    state: nextState(prior.state, evaluation.updateDirective),
    admittedAt: prior.admittedAt,
    updatedAt: evaluation.evaluatedAt,
    supersedesMemoryIds: [...new Set([...prior.supersedesMemoryIds, prior.id])],
    invalidationReason: evaluation.updateDirective === "INVALIDATE" ? evaluation.rationale : undefined,
  });
  const record = MemoryUpdateRecordSchema.parse({
    id: input.updateRecordId ?? crypto.randomUUID(),
    priorMemoryId: prior.id,
    evaluationId: evaluation.id,
    influencedExecutionId: evaluation.influencedExecutionId,
    newMemoryId: memory.id,
    directive: evaluation.updateDirective,
    evidenceState: evaluation.evidenceState,
    rationale: evaluation.rationale,
    createdAt: evaluation.evaluatedAt,
  });
  return { priorMemory: prior, memory, record };
}

export function resolveCurrentMemory(memories: ExecutionMemory[]): ExecutionMemory | null {
  const parsed = memories.map((memory) => ExecutionMemorySchema.parse(memory));
  if (parsed.length === 0) return null;
  const superseded = new Set(parsed.flatMap((memory) => memory.supersedesMemoryIds));
  const current = parsed.filter((memory) => !superseded.has(memory.id));
  return [...(current.length ? current : parsed)].sort((a, b) => {
    const time = b.updatedAt.getTime() - a.updatedAt.getTime();
    return time || b.id.localeCompare(a.id);
  })[0] ?? null;
}

export function isCurrentMemoryEligible(input: {
  memory: ExecutionMemory;
  versions: ExecutionMemory[];
  context: Record<string, unknown>;
}): boolean {
  const current = resolveCurrentMemory(input.versions);
  if (!current || current.id !== input.memory.id || current.state === "INVALIDATED") return false;
  return Object.entries(current.applicability).every(([key, value]) => input.context[key] === value);
}
