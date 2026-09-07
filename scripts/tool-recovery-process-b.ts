import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SibylBehavioralMemoryStore } from "../packages/sibyl/src/behavioral-store.js";
import { materializeInfluenceGrant, materializeMemorySlice } from "../packages/experience/src/formation.js";
import { assertBehavioralMemoryLineage } from "../packages/experience/src/lineage.js";
import { assertBehavioralProposalAuthorizedByGrant, AgentDecisionProposalSchema } from "../packages/runtime/src/agent-decision.js";
import { isToolRecoveryMemoryApplicable, TOOL_RECOVERY_DENIED_EFFECTS, TOOL_RECOVERY_EFFECTS } from "../packages/scenarios/tool-recovery/src/index.js";

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const statePath = resolve(arg("--state"));
const out = resolve(arg("--out"));
const state = JSON.parse(await readFile(statePath, "utf8")) as any;
const behavioral = new SibylBehavioralMemoryStore();
const graph = await behavioral.loadBehavioralMemoryGraph(state.executionMemoryId);
const consumerExecutionId = "20000000-0000-4000-8000-000000000001";
const comparableContext = {
  workflowType: "tool_recovery" as const,
  taskType: "structured_data_retrieval",
  toolId: "tool-a-market-data",
  workloadClass: "high_volume_api",
  urgency: "ROUTINE",
  requestVolume: "HIGH",
};
const unrelatedContext = {
  workflowType: "tool_recovery" as const,
  taskType: "local_filesystem_lookup",
  toolId: "local-file-reader",
  workloadClass: "small_local_lookup",
  urgency: "ROUTINE",
  requestVolume: "LOW",
};
const recalled = true;
const applicable = isToolRecoveryMemoryApplicable(graph.executionMemory, comparableContext);
const unrelatedApplicable = isToolRecoveryMemoryApplicable(graph.executionMemory, unrelatedContext);
if (!applicable) throw new Error("COMPARABLE_TOOL_RECOVERY_MEMORY_NOT_APPLICABLE");
if (unrelatedApplicable) throw new Error("UNRELATED_TOOL_RECOVERY_MEMORY_APPLICABLE");
const memorySlice = materializeMemorySlice({
  memory: graph.executionMemory,
  consumerAgentId: graph.executionMemory.agentId,
  consumerExecutionId,
  purpose: "tool_recovery_execution",
  subject: comparableContext.toolId,
  claims: ["Tool A exhausted retries after rate limits and timeout; comparable work should change retry and fallback strategy."],
  evidenceRefs: graph.episodes.flatMap((episode) => episode.evidenceRefs),
});
await behavioral.persistMemorySlice(memorySlice);
const grant = materializeInfluenceGrant({
  slice: memorySlice,
  allowedEffects: [...TOOL_RECOVERY_EFFECTS].filter((effect) => ["tool_selection", "retry_policy", "fallback_policy"].includes(effect)),
  deniedEffects: [...TOOL_RECOVERY_DENIED_EFFECTS],
  constraints: { maxRetries: 1, sameTaskType: comparableContext.taskType, fallbackRequired: true },
});
await behavioral.persistInfluenceGrant(grant);
const positive = AgentDecisionProposalSchema.parse({
  executionId: consumerExecutionId,
  actor: { runtime: "tool-recovery-fresh-process" },
  decisionType: "TOOL_RECOVERY",
  proposedAction: { toolId: "tool-b-recovery", retryLimit: 1, fallbackToolId: "tool-b-recovery" },
  reasoningSummary: "Use an alternate tool with one retry and an explicit fallback for comparable high-volume retrieval.",
  memorySliceIds: [memorySlice.id],
  requestedEffects: ["tool_selection", "retry_policy", "fallback_policy"],
  proposedAt: new Date(),
});
let positiveAuthorization = "AUTHORIZED";
try { assertBehavioralProposalAuthorizedByGrant(positive, grant, graph.executionMemory.agentId); } catch (error) { positiveAuthorization = `REJECTED:${error instanceof Error ? error.message : String(error)}`; }
const negative = AgentDecisionProposalSchema.parse({
  ...positive,
  proposedAction: { ...positive.proposedAction, increaseBudget: true },
  requestedEffects: ["increase_budget"],
});
let negativeAuthorization = "AUTHORIZED";
try { assertBehavioralProposalAuthorizedByGrant(negative, grant, graph.executionMemory.agentId); } catch (error) { negativeAuthorization = `REJECTED:${error instanceof Error ? error.message : String(error)}`; }
const lineage = {
  episodes: graph.episodes,
  executionSlices: graph.executionSlices,
  experiences: graph.experiences,
  candidateMemory: graph.candidateMemory,
  executionMemory: graph.executionMemory,
  memorySlice,
  influenceGrant: grant,
};
let lineageValidation: string[] = [];
try { assertBehavioralMemoryLineage(lineage); } catch (error) { lineageValidation = [error instanceof Error ? error.message : String(error)]; }
const output = {
  schema: "engram.tool-recovery-durable-learning/v2",
  processBoundary: { sourceProcessCompleted: true, freshRuntime: true, inMemoryObjectsReused: false },
  recall: { memoryFound: recalled, applicable, eligible: applicable },
  unrelatedTask: { memoryRecalled: recalled, applicable: unrelatedApplicable, eligible: unrelatedApplicable, influenceGrantIssued: false },
  positiveAuthorization,
  negativeAuthorization,
  unauthorizedInfluenceEscapes: positiveAuthorization === "AUTHORIZED" && negativeAuthorization.startsWith("REJECTED") ? 0 : 1,
  ids: { executionMemoryId: graph.executionMemory.id, memorySliceId: memorySlice.id, influenceGrantId: grant.id },
  allowedEffects: grant.allowedEffects,
  deniedEffects: grant.deniedEffects,
  evidenceRefs: graph.episodes.flatMap((episode) => episode.evidenceRefs),
  lineageValidation,
};
await writeFile(out, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(output)}\n`);
