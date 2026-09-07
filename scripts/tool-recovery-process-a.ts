import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ExecutionEventSchema, OutcomeSchema } from "../packages/memory-core/src/domain.js";
import { EngramRuntime } from "../packages/runtime/src/runtime.js";
import { DEFAULT_RUNTIME_POLICIES } from "../packages/runtime/src/defaults.js";
import { SibylRuntimeStore } from "../packages/sibyl/src/runtime-store.js";
import { SibylBehavioralMemoryStore } from "../packages/sibyl/src/behavioral-store.js";
import { admitCandidateMemory, formCandidateMemory, formExecutionEpisode, formExecutionMemory, formExecutionSlice, formExperience } from "../packages/experience/src/formation.js";

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const fixture = resolve(arg("--fixture"));
const sourceRef = arg("--source-ref");
const out = resolve(arg("--out"));
const raw = JSON.parse(await readFile(fixture, "utf8")) as any;
const digest = createHash("sha256").update(await readFile(fixture)).digest("hex");
const runtimeStore = new SibylRuntimeStore();
const runtime = new EngramRuntime(runtimeStore, DEFAULT_RUNTIME_POLICIES);
const behavioral = new SibylBehavioralMemoryStore();
const started = await runtime.startExecution({
  agentId: "engram-tool-recovery-fixture-agent",
  workflowType: "tool_recovery",
  intent: "recover a transient tool failure without expanding capabilities",
  context: { tool: raw.tool, operation: raw.operation, recoveryStrategy: raw.recovery.strategy },
  constraints: { maxRetries: 1, noNewTools: true },
  environmentVersion: "tool-recovery-fixture-v1",
  toolVersion: raw.version,
});
const execution = await runtimeStore.getExecution(started.executionId);
if (!execution) throw new Error("EXECUTION_START_NOT_RECONSTRUCTABLE");
const completedAt = new Date();
await runtime.observe({
  executionId: started.executionId,
  type: "TOOL_RECOVERY_ATTEMPTED",
  evidenceState: "OBSERVED",
  observedAt: completedAt,
  payload: { tool: raw.tool, operation: raw.operation, attempts: raw.attempts, recovery: raw.recovery },
  provenance: [{ source: sourceRef, digest }],
});
const completion = await runtime.complete({
  executionId: started.executionId,
  status: "SUCCESS",
  summary: "A transient tool timeout was recovered by one bounded retry using the same tool.",
  result: { recoveryStrategy: raw.recovery.strategy, result: raw.recovery.result, noNewTools: true },
  evidenceState: "OBSERVED",
  completedAt,
  admissionSignals: [{
    kind: "NOVEL_CONDITION",
    summary: "When this tool times out once, retry the same tool once before considering escalation.",
    evidenceState: "OBSERVED",
    confidence: 0.9,
    details: { tool: raw.tool, operation: raw.operation, recoveryStrategy: raw.recovery.strategy, maxRetries: 1, noNewTools: true },
  }],
});
const completed = await runtimeStore.getExecution(started.executionId);
if (!completed?.completedAt) throw new Error("EXECUTION_COMPLETION_NOT_RECONSTRUCTABLE");
const trace = await runtimeStore.getTrace(started.executionId) as { events: unknown[]; outcome: unknown };
const episode = formExecutionEpisode({
  execution: completed,
  events: (trace.events ?? []).map((event) => ExecutionEventSchema.parse(event)),
  outcome: trace.outcome ? OutcomeSchema.parse(trace.outcome) : undefined,
  evidenceRefs: [sourceRef],
  evidenceState: "OBSERVED",
  formedAt: completedAt,
});
const slice = formExecutionSlice({
  episode,
  purpose: "tool_recovery_learning",
  subject: raw.tool,
  fields: { tool: raw.tool, operation: raw.operation, recoveryStrategy: raw.recovery.strategy, attempts: raw.attempts.length },
  evidenceRefs: [sourceRef],
});
const experience = formExperience({
  episode,
  slice,
  subject: raw.tool,
  observation: `${raw.tool} recovered ${raw.operation} after one transient timeout using the same tool.`,
  interpretation: "For this tool and operation, one bounded retry can recover a transient timeout without adding a capability.",
  applicability: { workflowType: "tool_recovery", tool: raw.tool, operation: raw.operation },
  confidence: 0.9,
});
const candidate = formCandidateMemory({
  experience,
  memoryType: "TOOL_RECOVERY_EXPERIENCE",
  summary: experience.interpretation,
  proposedInfluence: ["tool_retry"],
});
const admission = admitCandidateMemory({ candidate, reason: "Observed successful bounded recovery with the same tool and no capability expansion." });
if (admission.status !== "ADMITTED") throw new Error(`CANDIDATE_NOT_ADMITTED:${admission.reason}`);
const admittedCandidate = admission.candidate;
const executionMemory = formExecutionMemory({ candidate: admittedCandidate, admittedAt: completedAt });
await behavioral.persistEpisode(episode);
await behavioral.persistExecutionSlice(slice);
await behavioral.persistExperience(experience);
await behavioral.persistCandidateMemory(admittedCandidate);
await behavioral.persistExecutionMemory(executionMemory);
const output = {
  schema: "engram.tool-recovery-durable-learning/v1",
  sourceEvidencePath: sourceRef,
  sourceEvidenceSha256: digest,
  completion: { executionId: started.executionId, status: "SUCCESS", recovery: raw.recovery.strategy },
  admission: { status: admission.status, reason: admission.reason, evidenceState: admission.evidenceState },
  executionMemoryId: executionMemory.id,
  lineageIds: { executionId: started.executionId, episodeId: episode.id, executionSliceId: slice.id, experienceId: experience.id, candidateMemoryId: admittedCandidate.id },
  evidenceRefs: [sourceRef],
};
await writeFile(out, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(output)}\n`);
