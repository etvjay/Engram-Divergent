import { z } from "zod";
import {
  EvidenceStateSchema,
  ExecutionEventSchema,
  ExecutionStatusSchema,
  OutcomeSchema,
} from "../../memory-core/src/domain.js";

/**
 * A semantically coherent execution unit.
 *
 * An episode is not a memory. It records what happened during one execution
 * with enough structure to support later experience formation.
 */
export const ExecutionEpisodeSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  agentId: z.string().min(1),
  workflowType: z.string().min(1),
  intent: z.string().min(1),
  context: z.record(z.string(), z.unknown()).default({}),
  constraints: z.record(z.string(), z.unknown()).default({}),
  status: ExecutionStatusSchema.exclude(["RUNNING", "MEMORY_UNAVAILABLE"]),
  events: z.array(ExecutionEventSchema).default([]),
  decisionIds: z.array(z.string().uuid()).default([]),
  outcome: OutcomeSchema,
  evidenceRefs: z.array(z.string().min(1)).default([]),
  evidenceState: EvidenceStateSchema,
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date(),
  formedAt: z.coerce.date(),
}).superRefine((episode, ctx) => {
  if (episode.outcome.executionId !== episode.executionId) {
    ctx.addIssue({ code: "custom", message: "EPISODE_OUTCOME_EXECUTION_MISMATCH" });
  }
  for (const event of episode.events) {
    if (event.executionId !== episode.executionId) {
      ctx.addIssue({ code: "custom", message: `EPISODE_EVENT_EXECUTION_MISMATCH:${event.id}` });
    }
  }
  if (episode.completedAt.getTime() < episode.startedAt.getTime()) {
    ctx.addIssue({ code: "custom", message: "EPISODE_COMPLETED_BEFORE_STARTED" });
  }
});

export type ExecutionEpisode = z.infer<typeof ExecutionEpisodeSchema>;
