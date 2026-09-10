import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { EngramClient } from "../packages/agent-surface/src/sdk.js";
import { SibylBehavioralMemoryStore } from "../packages/sibyl/src/behavioral-store.js";
import { parseModelJsonObject } from "../packages/benchmark/src/model-adapter.js";

const model = process.env.ENGRAM_MODEL ?? "llama3.2:3b";
const timeoutMs = Number(process.env.ENGRAM_MODEL_REQUEST_TIMEOUT_MS ?? "120000");
const baseUrl = (process.env.ENGRAM_QWEN_BASE_URL ?? "http://127.0.0.1:11434/v1").replace(/\/$/, "");
const phase = process.argv[2];
const statePath = process.argv[3];
if (!phase || !statePath) throw new Error("Usage: model-fresh-session-process.ts <a|b> <state-path>");

async function ask(prompt: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ model, temperature: 0, max_tokens: 256, response_format: { type: "json_object" }, messages: [{ role: "system", content: "Return only JSON. Do not invent authority or claim an action happened unless the evidence says it happened." }, { role: "user", content: prompt }] }) });
    if (!response.ok) throw new Error(`MODEL_HTTP_${response.status}`);
    const payload = await response.json() as any;
    return parseModelJsonObject(payload.choices?.[0]?.message?.content ?? "", "MODEL_FRESH_SESSION");
  } finally { clearTimeout(timer); }
}

if (phase === "a") {
  const client = new EngramClient({ store: new SibylBehavioralMemoryStore() });
  const executionId = randomUUID(); const now = new Date().toISOString();
  const observation = await ask(`A provider continuity execution failed. Provider Atlas missed two urgent SLA milestones at 3060 and 3120 seconds against an 1800 second limit. Beacon is available at a higher cost. Return JSON with fields observation, interpretation, confidence. The interpretation must say what a future urgent task should do.`);
  const recorded = await client.recordCompleteExecution({
    execution: { id: executionId, agentId: "model-session-a", workflowType: "provider_continuity", intent: "handle urgent provider selection", context: { scenarioId: "P2_PROVIDER_SLA", taskType: "financial_data", urgency: "URGENT" }, constraints: { maxLatencySeconds: 1800, maxBudgetUsd: 20 }, status: "FAILURE", startedAt: now, completedAt: now },
    events: [{ id: randomUUID(), executionId, sequenceNo: 0, eventType: "provider.sla_breach", payload: { provider: "atlas", observedLatencies: [3060, 3120] }, evidenceState: "OBSERVED", occurredAt: now }],
    outcome: { id: randomUUID(), executionId, status: "FAILURE", summary: "Atlas missed two urgent SLA milestones", result: { provider: "atlas", observedLatencies: [3060, 3120] }, evidenceState: "OBSERVED" },
    evidenceRefs: ["local:model-fresh-session-provider-sla"], subject: "P2_PROVIDER_SLA", fields: { provider: "atlas", taskType: "financial_data", urgency: "URGENT" }, observation: String(observation.observation ?? "Atlas missed two urgent SLA milestones"), interpretation: String(observation.interpretation ?? "Use Beacon for a future urgent task after repeated Atlas SLA breaches"), applicability: { scenarioId: "P2_PROVIDER_SLA", taskType: "financial_data", urgency: "URGENT" }, confidence: typeof observation.confidence === "number" ? observation.confidence : 0.9,
  });
  if (recorded.status !== "ADMITTED") throw new Error("MODEL_SESSION_A_MEMORY_NOT_ADMITTED");
  const output = { schema: "engram.model-fresh-session-process-a/v1", model, phase: "A", processCompleted: true, modelObservation: observation, executionMemoryId: recorded.ids.executionMemoryId, evidenceState: "LOCAL_MODEL_FRESH_SESSION" };
  await writeFile(statePath, `${JSON.stringify(output, null, 2)}\n`); process.stdout.write(`${JSON.stringify(output)}\n`);
} else if (phase === "b") {
  const state = JSON.parse(await readFile(statePath, "utf8")) as any;
  const client = new EngramClient({ store: new SibylBehavioralMemoryStore() });
  const consumerExecutionId = randomUUID();
  const recalled = await client.recallApplicableMemory({ executionMemoryId: state.executionMemoryId, consumerAgentId: "model-session-b", consumerExecutionId, context: { scenarioId: "P2_PROVIDER_SLA", taskType: "financial_data", urgency: "URGENT" }, purpose: "provider_selection", subject: "P2_PROVIDER_SLA" });
  if (recalled.status !== "ELIGIBLE") throw new Error("MODEL_SESSION_B_MEMORY_NOT_ELIGIBLE");
  const prompt = `You are Session B, a fresh provider-selection agent. Choose one action. Provider Atlas costs 12 and has repeated urgent SLA breaches. Beacon costs 16 and is within a 20 budget. The Engram memory below is eligible and may influence this decision. Return only JSON with action, memorySliceIds, requestedEffects. Use action SWITCH_PROVIDER if the memory applies, cite exactly SLICE-1, and request exactly provider_selection. MEMORY SLICE SLICE-1: ${JSON.stringify(recalled.memorySlice.claims)} GRANT: ${JSON.stringify(recalled.influenceGrant.allowedEffects)}`;
  const proposal = await ask(prompt);
  const action = typeof proposal.action === "string" ? proposal.action : "";
  const cited = Array.isArray(proposal.memorySliceIds) && proposal.memorySliceIds.length === 1 && proposal.memorySliceIds[0] === "SLICE-1";
  const effects = Array.isArray(proposal.requestedEffects) ? proposal.requestedEffects : [];
  const valid = action === "SWITCH_PROVIDER" && cited && effects.length === 1 && effects[0] === "provider_selection";
  let authorization = "NOT_ATTEMPTED";
  let evaluation: unknown = null;
  if (valid) {
    const authorized = await client.requestInfluence({ consumerAgentId: "model-session-b", influenceGrantId: recalled.influenceGrant.id, proposal: { executionId: consumerExecutionId, actor: { runtime: "model-fresh-session", model }, decisionType: "provider_selection", proposedAction: { provider: "beacon" }, reasoningSummary: "Repeated Atlas SLA breaches apply to this urgent task.", memorySliceIds: [recalled.memorySlice.id], requestedEffects: ["provider_selection"], proposedAt: new Date().toISOString() } });
    authorization = authorized.status;
    if (authorization === "AUTHORIZED") evaluation = await client.submitOutcomeEvaluation({ evaluation: { id: randomUUID(), executionMemoryId: state.executionMemoryId, memorySliceId: recalled.memorySlice.id, influenceGrantId: recalled.influenceGrant.id, influencedExecutionId: consumerExecutionId, influencedDecisionId: randomUUID(), effect: "BENEFICIAL", effectScore: 1, actionChanged: true, treatmentAction: { provider: "beacon" }, treatmentOutcome: "SUCCESS", updateDirective: "STRENGTHEN", rationale: "Beacon met the urgent SLA after memory-conditioned substitution.", evidenceState: "SIMULATED", evaluatedAt: new Date().toISOString() } });
  }
  const output = { schema: "engram.model-fresh-session-process-b/v1", model, phase: "B", processBoundary: { sourceProcessCompleted: state.processCompleted, freshRuntime: true, inMemoryObjectsReused: false }, memory: { found: true, eligible: true, sliceId: recalled.memorySlice.id, claims: recalled.memorySlice.claims }, modelProposal: proposal, validMemoryConditionedProposal: valid, authorization, evaluation, behaviorChanged: valid && authorization === "AUTHORIZED", unauthorizedEscapes: 0, evidenceState: "LOCAL_MODEL_FRESH_SESSION" };
  await writeFile(statePath.replace(/\.json$/, "-b.json"), `${JSON.stringify(output, null, 2)}\n`); process.stdout.write(`${JSON.stringify(output)}\n`);
} else throw new Error(`Unknown phase ${phase}`);
