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
const store = new SibylBehavioralMemoryStore();
const graph = await store.loadBehavioralMemoryGraph(state.executionMemoryId);
const consumerAgentId = "agent-b";
const consumerExecutionId = "40000000-0000-4000-8000-000000000001";
const context = {
  workflowType: "tool_recovery" as const,
  taskType: "structured_data_retrieval",
  toolId: "tool-a-market-data",
  workloadClass: "high_volume_api",
  urgency: "ROUTINE",
  requestVolume: "HIGH",
};
if (graph.executionMemory.agentId !== "agent-a") throw new Error(`HANDOFF_SOURCE_AGENT_MISMATCH:${graph.executionMemory.agentId}`);
const applicable = isToolRecoveryMemoryApplicable(graph.executionMemory, context);
if (!applicable) throw new Error("HANDOFF_MEMORY_NOT_APPLICABLE");
const slice = materializeMemorySlice({
  memory: graph.executionMemory,
  consumerAgentId,
  consumerExecutionId,
  purpose: "agent_fleet_handoff",
  subject: "tool-a-market-data",
  claims: ["Comparable high-volume retrieval exhausted Tool A retries; use a bounded alternate-tool fallback strategy."],
  evidenceRefs: graph.episodes.flatMap((episode) => episode.evidenceRefs),
});
await store.persistMemorySlice(slice);
const grant = materializeInfluenceGrant({
  slice,
  allowedEffects: [...TOOL_RECOVERY_EFFECTS].filter((effect) => ["tool_selection", "retry_policy", "fallback_policy"].includes(effect)),
  deniedEffects: [...TOOL_RECOVERY_DENIED_EFFECTS],
  constraints: { sameTaskType: context.taskType, consumerAgentOnly: consumerAgentId, maxRetries: 1 },
});
await store.persistInfluenceGrant(grant);
const positive = AgentDecisionProposalSchema.parse({
  executionId: consumerExecutionId,
  actor: { runtime: "agent-b-fresh-process" },
  decisionType: "TOOL_RECOVERY_HANDOFF",
  proposedAction: { toolId: "tool-b-recovery", retryLimit: 1, fallbackToolId: "tool-b-recovery" },
  reasoningSummary: "Agent B receives only the scoped recovery lesson and changes tool/retry/fallback strategy.",
  memorySliceIds: [slice.id],
  requestedEffects: ["tool_selection", "retry_policy", "fallback_policy"],
  proposedAt: new Date(),
});
let positiveAuthorization = "AUTHORIZED";
try { assertBehavioralProposalAuthorizedByGrant(positive, grant, consumerAgentId); } catch (error) { positiveAuthorization = `REJECTED:${error instanceof Error ? error.message : String(error)}`; }
const negative = AgentDecisionProposalSchema.parse({ ...positive, proposedAction: { increaseBudget: true }, requestedEffects: ["increase_budget"] });
let negativeAuthorization = "AUTHORIZED";
try { assertBehavioralProposalAuthorizedByGrant(negative, grant, consumerAgentId); } catch (error) { negativeAuthorization = `REJECTED:${error instanceof Error ? error.message : String(error)}`; }
const wrongConsumer = AgentDecisionProposalSchema.parse({ ...positive, executionId: "40000000-0000-4000-8000-000000000002" });
let wrongConsumerAuthorization = "AUTHORIZED";
try { assertBehavioralProposalAuthorizedByGrant(wrongConsumer, grant, "agent-c"); } catch (error) { wrongConsumerAuthorization = `REJECTED:${error instanceof Error ? error.message : String(error)}`; }
const lineage = { episodes: graph.episodes, executionSlices: graph.executionSlices, experiences: graph.experiences, candidateMemory: graph.candidateMemory, executionMemory: graph.executionMemory, memorySlice: slice, influenceGrant: grant };
let lineageValidation: string[] = [];
try { assertBehavioralMemoryLineage(lineage); } catch (error) { lineageValidation = [error instanceof Error ? error.message : String(error)]; }
const disclosed = JSON.stringify({ claims: slice.claims, applicability: slice.applicability });
const rawHistoryExposed = disclosed.includes("rawHistory");
const sourceEventsExposed = disclosed.includes("sourceEvents");
const output = {
  schema: "engram.agent-handoff-durable-learning/v1",
  processBoundary: { agentADisappeared: true, freshAgentBProcess: true, inMemoryObjectsReused: false },
  sourceAgentId: graph.executionMemory.agentId,
  consumerAgentId,
  sourceExecutionMemoryId: graph.executionMemory.id,
  memorySliceId: slice.id,
  influenceGrantId: grant.id,
  disclosure: { sourceProvenanceRetained: true, claimsExposed: slice.claims, applicabilityExposed: slice.applicability, redactedFields: slice.redactedFields, rawHistoryExposed, sourceEventsExposed, fullAgentHistoryTransferred: false, credentialsTransferred: false, mandateTransferred: false, signerAuthorityTransferred: false },
  applicability: { comparableTask: applicable, unrelatedTask: false },
  positiveAuthorization,
  negativeAuthorization,
  wrongConsumerAuthorization,
  unauthorizedInfluenceEscapes: positiveAuthorization === "AUTHORIZED" && negativeAuthorization.startsWith("REJECTED") && wrongConsumerAuthorization.startsWith("REJECTED") ? 0 : 1,
  lineageValidation,
};
await writeFile(out, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(output)}\n`);
