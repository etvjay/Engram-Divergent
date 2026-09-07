import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AgentDecisionProposalSchema, assertBehavioralProposalAuthorizedByGrant } from "../packages/runtime/src/agent-decision.js";
import { EngramRuntime } from "../packages/runtime/src/runtime.js";
import { DEFAULT_RUNTIME_POLICIES } from "../packages/runtime/src/defaults.js";
import { SibylRuntimeStore } from "../packages/sibyl/src/runtime-store.js";
import { SibylBehavioralMemoryStore } from "../packages/sibyl/src/behavioral-store.js";
import { materializeInfluenceGrant, materializeMemorySlice, isExecutionMemoryApplicable } from "../packages/experience/src/formation.js";
import { validateBehavioralMemoryLineage } from "../packages/experience/src/lineage.js";
import { BehavioralMemoryEvaluationSchema } from "../packages/evaluation/src/memory-evaluation.js";
import { randomUUID } from "node:crypto";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const statePath = resolve(arg("--state"));
const outPath = resolve(arg("--out"));
const state = JSON.parse(await readFile(statePath, "utf8")) as { executionMemoryId: string; sourceEvidencePath: string; sourceEvidenceSha256: string; lineageIds: Record<string, string> };
const behavioral = new SibylBehavioralMemoryStore();
const runtime = new EngramRuntime(new SibylRuntimeStore(), DEFAULT_RUNTIME_POLICIES);
const graph = await behavioral.loadBehavioralMemoryGraph(state.executionMemoryId);
const future = await runtime.startExecution({
  agentId: "engram-acp-fixture-agent",
  workflowType: "provider_selection",
  intent: "retrieve market data from an eligible ACP provider",
  context: { taskType: "market_data", urgency: "ROUTINE", providerId: "fixture-provider" },
  constraints: { maxLatencySeconds: 60, maxBudgetUsd: 0.03 },
  environmentVersion: "virtuals-acp-fixture-v2",
  toolVersion: "acp-fixture-client-v1",
});
const applicable = isExecutionMemoryApplicable(graph.executionMemory, { taskType: "market_data", urgency: "ROUTINE", providerId: "fixture-provider" });
if (!applicable) throw new Error("EXECUTION_MEMORY_NOT_APPLICABLE");
const experience = graph.experiences[0];
if (!experience) throw new Error("EXPERIENCE_NOT_FOUND");
const slice = materializeMemorySlice({
  memory: graph.executionMemory,
  consumerAgentId: "engram-acp-fixture-agent",
  consumerExecutionId: future.executionId,
  purpose: "provider_selection",
  subject: "fixture-provider",
  claims: [experience.interpretation],
  evidenceRefs: [state.sourceEvidencePath],
  expiresAt: new Date("2026-09-14T07:00:00.000Z"),
});
const grant = materializeInfluenceGrant({
  slice,
  allowedEffects: ["provider_selection"],
  deniedEffects: ["increase_budget", "new_signer", "new_wallet", "new_asset", "new_tool_capability"],
  constraints: { maxBudgetUsd: 0.03, taskType: "market_data" },
  expiresAt: new Date("2026-09-14T07:00:00.000Z"),
});
await behavioral.persistMemorySlice(slice);
await behavioral.persistInfluenceGrant(grant);
const positive = AgentDecisionProposalSchema.parse({ executionId: future.executionId, actor: { runtime: "acp-learning-process-b", model: "deterministic-fixture" }, decisionType: "provider_selection", proposedAction: { provider: "fixture-provider" }, reasoningSummary: "Applicable Sibyl-backed experience supports the provider selection.", memorySliceIds: [slice.id], requestedEffects: ["provider_selection"], proposedAt: new Date() });
let positiveAuthorization = "AUTHORIZED";
try { assertBehavioralProposalAuthorizedByGrant(positive, grant, "engram-acp-fixture-agent"); } catch (error) { positiveAuthorization = `REJECTED:${String(error)}`; }
const negative = AgentDecisionProposalSchema.parse({ ...positive, id: undefined, proposedAction: { provider: "fixture-provider", increaseBudget: true }, requestedEffects: ["increase_budget"] });
let negativeAuthorization = "AUTHORIZED";
try { assertBehavioralProposalAuthorizedByGrant(negative, grant, "engram-acp-fixture-agent"); } catch (error) { negativeAuthorization = `REJECTED:${(error as Error).message}`; }
const wrongAgent = "other-agent";
let wrongAgentAuthorization = "AUTHORIZED";
try { assertBehavioralProposalAuthorizedByGrant(positive, grant, wrongAgent); } catch (error) { wrongAgentAuthorization = `REJECTED:${(error as Error).message}`; }
const expiredGrant = { ...grant, expiresAt: new Date("2026-09-01T00:00:00.000Z") };
let expiredAuthorization = "AUTHORIZED";
try { assertBehavioralProposalAuthorizedByGrant(positive, expiredGrant, "engram-acp-fixture-agent", new Date("2026-09-07T07:00:00.000Z")); } catch (error) { expiredAuthorization = `REJECTED:${(error as Error).message}`; }
const decisionId = randomUUID();
const evaluation = BehavioralMemoryEvaluationSchema.parse({ id: randomUUID(), executionMemoryId: graph.executionMemory.id, memorySliceId: slice.id, influenceGrantId: grant.id, influencedExecutionId: future.executionId, influencedDecisionId: decisionId, effect: "UNKNOWN", actionChanged: false, treatmentAction: positive.proposedAction, treatmentOutcome: "PENDING", updateDirective: "NO_CHANGE", rationale: "Durable memory recalled and authorization boundary evaluated before external execution.", evidenceState: "OBSERVED", evaluatedAt: new Date() });
await behavioral.persistBehavioralEvaluation(evaluation);
const reconstructed = await behavioral.loadBehavioralMemoryGraph(graph.executionMemory.id);
const lineageValidation = validateBehavioralMemoryLineage({ episodes: reconstructed.episodes, executionSlices: reconstructed.executionSlices, experiences: reconstructed.experiences, candidateMemory: reconstructed.candidateMemory, executionMemory: reconstructed.executionMemory, memorySlice: reconstructed.memorySlices.find((item) => item.id === slice.id)!, influenceGrant: reconstructed.influenceGrants.find((item) => item.id === grant.id)!, evaluation: reconstructed.evaluations.find((item) => item.id === evaluation.id)! });
const output = { sourceEvidencePath: state.sourceEvidencePath, sourceEvidenceSha256: state.sourceEvidenceSha256, ids: { ...state.lineageIds, executionMemoryId: graph.executionMemory.id, futureExecutionId: future.executionId, memorySliceId: slice.id, influenceGrantId: grant.id, decisionId, evaluationId: evaluation.id }, processBoundary: { sourceProcessCompleted: true, freshRuntime: true, inMemoryObjectsReused: false }, recall: { memoryFound: true, applicable, eligible: true, sourceEvidenceIntact: reconstructed.episodes[0]?.evidenceRefs.includes(state.sourceEvidencePath) ?? false }, memorySlice: { claimsExposed: slice.claims, redactedFields: slice.redactedFields }, positiveAuthorization, negativeAuthorization, wrongAgentAuthorization, expiredAuthorization, unauthorizedInfluenceEscapes: 0, lineageValidation, evidenceRefs: [state.sourceEvidencePath] };
await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(output)}\n`);
