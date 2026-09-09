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
const agentId = process.argv.includes("--agent-id") ? arg("--agent-id") : "engram-tool-recovery-fixture-agent";
const raw = JSON.parse(await readFile(fixture, "utf8")) as any;
const digest = createHash("sha256").update(await readFile(fixture)).digest("hex");
const runtimeStore = new SibylRuntimeStore();
const runtime = new EngramRuntime(runtimeStore, DEFAULT_RUNTIME_POLICIES);
const behavioral = new SibylBehavioralMemoryStore();
const started = await runtime.startExecution({
  agentId,
  workflowType: "tool_recovery",
  intent: "recover a transient tool failure without expanding capabilities",
  context: { taskType: raw.taskType, toolId: raw.toolId, workloadClass: raw.workloadClass, urgency: raw.urgency, requestVolume: raw.requestVolume },
  constraints: { maxRetries: 2, noNewTools: true },
  environmentVersion: "tool-recovery-fixture-v1",
  toolVersion: raw.toolVersion,
});
const execution = await runtimeStore.getExecution(started.executionId);
if (!execution) throw new Error("EXECUTION_START_NOT_RECONSTRUCTABLE");
const completedAt = new Date();
await runtime.observe({
  executionId: started.executionId,
  type: "TOOL_RECOVERY_FAILED",
  evidenceState: "OBSERVED",
  observedAt: completedAt,
  payload: { toolId: raw.toolId, taskType: raw.taskType, workloadClass: raw.workloadClass, urgency: raw.urgency, requestVolume: raw.requestVolume, events: raw.events, terminalOutcome: raw.terminalOutcome },
  provenance: [{ source: sourceRef, digest }],
});
const completion = await runtime.complete({
  executionId: started.executionId,
  status: "FAILURE",
  summary: "Tool A exhausted its configured retry policy after rate limits and timeout.",
  result: { toolId: raw.toolId, terminalOutcome: raw.terminalOutcome, fallbackUsed: false },
  failureType: "RETRY_EXHAUSTED",
  evidenceState: "OBSERVED",
  completedAt,
  admissionSignals: [{
    kind: "NOVEL_CONDITION",
    summary: "Scope this failure to comparable high-volume retrieval and change retry/fallback strategy.",
    evidenceState: "OBSERVED",
    confidence: 0.9,
    details: { taskType: raw.taskType, toolId: raw.toolId, workloadClass: raw.workloadClass, urgency: raw.urgency, requestVolume: raw.requestVolume, maxRetries: 2 },
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
  subject: raw.toolId,
  fields: { toolId: raw.toolId, taskType: raw.taskType, workloadClass: raw.workloadClass, urgency: raw.urgency, requestVolume: raw.requestVolume, retryAttempts: raw.events.filter((event: any) => event.type === "retry_attempted").length, terminalFailure: raw.terminalOutcome.failureType },
  evidenceRefs: [sourceRef],
});
const experience = formExperience({
  episode,
  slice,
  subject: raw.toolId,
  observation: `Tool ${raw.toolId} returned rate-limit responses and exhausted the configured retry policy before terminal failure.`,
  interpretation: "For comparable high-volume retrieval work, Tool A should not be retried under the same policy without an alternate fallback strategy.",
  applicability: { workflowType: "tool_recovery", taskType: raw.taskType, toolId: raw.toolId, workloadClass: raw.workloadClass, urgency: raw.urgency, requestVolume: raw.requestVolume },
  confidence: 0.9,
});
const candidate = formCandidateMemory({
  experience,
  memoryType: "TOOL_RECOVERY_EXPERIENCE",
  summary: experience.interpretation,
  proposedInfluence: ["tool_selection", "retry_policy", "fallback_policy"],
});
const admission = admitCandidateMemory({ candidate, reason: "Observed terminal tool failure with evidence-backed scope for a changed retry and fallback strategy." });
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
  agentId,
  completion: { executionId: started.executionId, status: "FAILURE", failureType: "RETRY_EXHAUSTED" },
  admission: { status: admission.status, reason: admission.reason, evidenceState: admission.evidenceState },
  experience: { observation: experience.observation, interpretation: experience.interpretation, applicability: experience.applicability },
  executionMemoryId: executionMemory.id,
  lineageIds: { executionId: started.executionId, episodeId: episode.id, executionSliceId: slice.id, experienceId: experience.id, candidateMemoryId: admittedCandidate.id },
  evidenceRefs: [sourceRef],
};
await writeFile(out, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(output)}\n`);
