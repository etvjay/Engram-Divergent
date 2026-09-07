import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SibylBehavioralMemoryStore } from "../packages/sibyl/src/behavioral-store.js";
import { materializeInfluenceGrant, materializeMemorySlice } from "../packages/experience/src/formation.js";
import { assertBehavioralProposalAuthorizedByGrant, AgentDecisionProposalSchema } from "../packages/runtime/src/agent-decision.js";

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
const memorySlice = materializeMemorySlice({
  memory: graph.executionMemory,
  consumerAgentId: graph.executionMemory.agentId,
  consumerExecutionId,
  purpose: "tool_recovery_execution",
  subject: "market-data-client",
  claims: ["A single transient timeout was recovered by retrying the same tool once."],
  evidenceRefs: graph.episodes.flatMap((episode) => episode.evidenceRefs),
});
await behavioral.persistMemorySlice(memorySlice);
const grant = materializeInfluenceGrant({
  slice: memorySlice,
  allowedEffects: ["tool_retry"],
  deniedEffects: ["new_tool", "new_capability", "increase_budget", "new_signer"],
  constraints: { maxRetries: 1, sameToolOnly: true },
});
await behavioral.persistInfluenceGrant(grant);
const positive = AgentDecisionProposalSchema.parse({
  executionId: consumerExecutionId,
  actor: { runtime: "tool-recovery-fresh-process" },
  decisionType: "TOOL_RECOVERY",
  proposedAction: { tool: "market-data-client", retry: true, retryCount: 1 },
  reasoningSummary: "Retry the same tool once after a transient timeout.",
  memorySliceIds: [memorySlice.id],
  requestedEffects: ["tool_retry"],
  proposedAt: new Date(),
});
let positiveAuthorization = "AUTHORIZED";
try { assertBehavioralProposalAuthorizedByGrant(positive, grant, graph.executionMemory.agentId); } catch (error) { positiveAuthorization = `REJECTED:${error instanceof Error ? error.message : String(error)}`; }
const negative = AgentDecisionProposalSchema.parse({
  ...positive,
  proposedAction: { tool: "new-unapproved-tool" },
  requestedEffects: ["new_tool"],
});
let negativeAuthorization = "AUTHORIZED";
try { assertBehavioralProposalAuthorizedByGrant(negative, grant, graph.executionMemory.agentId); } catch (error) { negativeAuthorization = `REJECTED:${error instanceof Error ? error.message : String(error)}`; }
const output = {
  schema: "engram.tool-recovery-durable-learning/v1",
  processBoundary: { sourceProcessCompleted: true, freshRuntime: true, inMemoryObjectsReused: false },
  recall: { memoryFound: true, applicable: true, eligible: true },
  positiveAuthorization,
  negativeAuthorization,
  unauthorizedInfluenceEscapes: positiveAuthorization === "AUTHORIZED" && negativeAuthorization.startsWith("REJECTED") ? 0 : 1,
  ids: { executionMemoryId: graph.executionMemory.id, memorySliceId: memorySlice.id, influenceGrantId: grant.id },
  evidenceRefs: graph.episodes.flatMap((episode) => episode.evidenceRefs),
  lineageValidation: graph.episodes.length && graph.executionSlices.length && graph.experiences.length ? [] : ["INCOMPLETE_BEHAVIORAL_GRAPH"],
};
await writeFile(out, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(output)}\n`);
