import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ExecutionEventSchema, OutcomeSchema } from "../packages/memory-core/src/domain.js";
import { EngramRuntime } from "../packages/runtime/src/runtime.js";
import { DEFAULT_RUNTIME_POLICIES } from "../packages/runtime/src/defaults.js";
import { SibylRuntimeStore } from "../packages/sibyl/src/runtime-store.js";
import { SibylBehavioralMemoryStore } from "../packages/sibyl/src/behavioral-store.js";
import { fetchAcpJobHistory } from "../packages/virtuals-acp/src/cli.js";
import { acpEvidenceToEngramObservation, acpHistoryToExecutionEvidence } from "../packages/virtuals-acp/src/evidence.js";
import {
  admitCandidateMemory,
  formExecutionEpisode,
  formExecutionMemory,
  formExecutionSlice,
  formExperience,
  formCandidateMemory,
} from "../packages/experience/src/formation.js";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const fixturePath = resolve(arg("--fixture"));
const sourceRef = arg("--source-ref");
const outPath = resolve(arg("--out"));
const rawHistory = JSON.parse(await readFile(fixturePath, "utf8")) as unknown;
const sourceBytes = await readFile(fixturePath);
const sourceDigest = createHash("sha256").update(sourceBytes).digest("hex");
const runtime = new EngramRuntime(new SibylRuntimeStore(), DEFAULT_RUNTIME_POLICIES);
const behavioral = new SibylBehavioralMemoryStore();
const started = await runtime.startExecution({
  agentId: "engram-acp-fixture-agent",
  workflowType: "provider_selection",
  intent: "retrieve market data from an eligible ACP provider",
  context: { taskType: "market_data", urgency: "ROUTINE", providerId: "fixture-provider" },
  constraints: { maxLatencySeconds: 60, maxBudgetUsd: 0.03 },
  environmentVersion: "virtuals-acp-fixture-v2",
  toolVersion: "acp-fixture-client-v1",
});
const startedRecord = await new SibylRuntimeStore().getExecution(started.executionId);
if (!startedRecord) throw new Error("EXECUTION_START_NOT_RECONSTRUCTABLE");
const startedAt = startedRecord.startedAt;
const now = new Date();
const evidence = acpHistoryToExecutionEvidence(rawHistory, {
  providerId: "fixture-provider",
  taskType: "market_data",
  urgency: "ROUTINE",
  expectedLatencySeconds: 60,
  startedAt,
  completedAt: now,
});
await runtime.observe({ executionId: started.executionId, ...acpEvidenceToEngramObservation(evidence), observedAt: now });
const completion = await runtime.complete({
  executionId: started.executionId,
  status: "SUCCESS",
  summary: "ACP fixture completed with an observed terminal completion.",
  result: { providerId: evidence.providerId, jobId: evidence.jobId, deliverable: "fixture-completed" },
  evidenceState: "OBSERVED",
  completedAt: now,
  admissionSignals: [{
    kind: "NOVEL_CONDITION",
    summary: "Retain this observed ACP provider execution as bounded market-data experience.",
    evidenceState: "OBSERVED",
    confidence: 0.9,
    details: { sourceSystem: "VIRTUALS_ACP", providerId: evidence.providerId, taskType: evidence.taskType, urgency: evidence.urgency },
  }],
});
const execution = await new SibylRuntimeStore().getExecution(started.executionId);
if (!execution) throw new Error("EXECUTION_NOT_RECONSTRUCTABLE");
const trace = await new SibylRuntimeStore().getTrace(started.executionId) as { events: unknown[]; outcome: unknown };
const events = (trace.events ?? []).map((event) => ExecutionEventSchema.parse(event));
const outcome = trace.outcome ? OutcomeSchema.parse(trace.outcome) : undefined;
const episode = formExecutionEpisode({ execution, events, outcome, evidenceRefs: [sourceRef], evidenceState: evidence.evidenceState, formedAt: now });
const slice = formExecutionSlice({
  episode,
  purpose: "provider_performance_learning",
  subject: evidence.providerId,
  fields: { providerId: evidence.providerId, taskType: evidence.taskType, urgency: evidence.urgency, status: evidence.status, observedLatencySeconds: evidence.observedLatencySeconds, historyEntryCount: evidence.historyEntryCount },
  evidenceRefs: [sourceRef],
});
const experience = formExperience({
  episode,
  slice,
  subject: evidence.providerId,
  observation: `ACP provider ${evidence.providerId} completed a ${evidence.taskType} execution with terminal status ${evidence.status}.`,
  interpretation: "This provider has one observed successful execution for comparable routine market-data work.",
  applicability: { taskType: evidence.taskType, urgency: evidence.urgency, providerId: evidence.providerId },
  confidence: 0.9,
});
const candidate = formCandidateMemory({ experience, memoryType: "ACP_PROVIDER_EXPERIENCE", summary: experience.interpretation, proposedInfluence: ["provider_selection"] });
const admission = admitCandidateMemory({ candidate, reason: "Observed terminal ACP completion with evidence-backed task and provider applicability." });
if (admission.status !== "ADMITTED") throw new Error(`CANDIDATE_NOT_ADMITTED:${admission.reason}`);
const admittedCandidate = admission.candidate;
const executionMemory = formExecutionMemory({ candidate: admittedCandidate, admittedAt: now });
await behavioral.persistEpisode(episode);
await behavioral.persistExecutionSlice(slice);
await behavioral.persistExperience(experience);
await behavioral.persistCandidateMemory(admittedCandidate);
await behavioral.persistExecutionMemory(executionMemory);
const output = {
  sourceEvidencePath: sourceRef,
  sourceEvidenceSha256: sourceDigest,
  normalization: { evidenceState: evidence.evidenceState, jobId: evidence.jobId, providerId: evidence.providerId, status: evidence.status, protocol: evidence.protocol },
  completion: { executionId: started.executionId, status: completion.executionId === started.executionId ? "SUCCESS" : "MISMATCH" },
  admission: { status: admission.status, reason: admission.reason, evidenceState: admission.evidenceState },
  executionMemoryId: executionMemory.id,
  lineageIds: { executionId: started.executionId, episodeId: episode.id, executionSliceId: slice.id, experienceId: experience.id, candidateMemoryId: admittedCandidate.id },
  evidenceRefs: [sourceRef],
};
await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(output)}\n`);
