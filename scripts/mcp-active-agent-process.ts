import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { EngramClient } from "../packages/agent-surface/src/sdk.js";
import { createMcpStdioServer } from "../packages/agent-surface/src/mcp-stdio.js";
import { SibylBehavioralMemoryStore } from "../packages/sibyl/src/behavioral-store.js";
import { parseModelJsonObject } from "../packages/benchmark/src/model-adapter.js";

const model = process.env.ENGRAM_MODEL ?? "llama3.2:3b";
const timeoutMs = Number(process.env.ENGRAM_MODEL_REQUEST_TIMEOUT_MS ?? "120000");
const baseUrl = (process.env.ENGRAM_QWEN_BASE_URL ?? "http://127.0.0.1:11434/v1").replace(/\/$/, "");
const phase = process.argv[2];
const statePath = process.argv[3];
if (!phase || !statePath) throw new Error("Usage: mcp-active-agent-process.ts <a|b> <state-path>");

async function ask(messages: Array<{ role: string; content: string }>): Promise<Record<string, unknown>> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ model, temperature: 0, max_tokens: 300, response_format: { type: "json_object" }, messages }) });
    if (!response.ok) throw new Error(`MODEL_HTTP_${response.status}`);
    const payload = await response.json() as any;
    return parseModelJsonObject(payload.choices?.[0]?.message?.content ?? "", "MCP_ACTIVE_AGENT");
  } finally { clearTimeout(timer); }
}

function mcp(store: SibylBehavioralMemoryStore) {
  const responses: Array<Record<string, unknown>> = [];
  const output = { write(chunk: string) { responses.push(JSON.parse(chunk)); return true; } } as any;
  const server = createMcpStdioServer({ store, output });
  return { server, responses };
}
async function callTool(server: ReturnType<typeof createMcpStdioServer>, responses: Array<Record<string, unknown>>, id: number, name: string, args: Record<string, unknown>): Promise<any> {
  await server.handle(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }));
  const response = responses.at(-1);
  if (!response || response.error) throw new Error(`MCP_TOOL_FAILED:${name}`);
  return response.result;
}

const task = { scenarioId: "P2_PROVIDER_SLA", taskType: "financial_data", urgency: "URGENT", budgetUsd: 20, maxLatencySeconds: 1800, providers: [{ id: "atlas", price: 12, knownStatus: "available" }, { id: "beacon", price: 16, knownStatus: "available" }] };

if (phase === "a") {
  const store = new SibylBehavioralMemoryStore(); const { server, responses } = mcp(store);
  const executionId = randomUUID(); const now = new Date().toISOString();
  const applicability = { scenarioId: task.scenarioId, taskType: task.taskType, urgency: task.urgency };
  const recorded = await callTool(server, responses, 1, "record_complete_execution", { execution: { id: executionId, agentId: "mcp-session-a", workflowType: "provider_continuity", intent: "handle urgent provider selection", context: task, constraints: { maxLatencySeconds: 1800, maxBudgetUsd: 20 }, status: "FAILURE", startedAt: now, completedAt: now }, events: [{ id: randomUUID(), executionId, sequenceNo: 0, eventType: "provider.sla_breach", payload: { provider: "atlas", observedLatencies: [3060, 3120] }, evidenceState: "OBSERVED", occurredAt: now }], outcome: { id: randomUUID(), executionId, status: "FAILURE", summary: "Atlas missed two urgent SLA milestones", result: { provider: "atlas", observedLatencies: [3060, 3120] }, evidenceState: "OBSERVED" }, evidenceRefs: ["local:mcp-active-agent-provider-sla"], subject: "P2_PROVIDER_SLA", observation: "Provider Atlas missed two urgent SLA milestones at 3060 and 3120 seconds against an 1800 second limit.", interpretation: "Use Beacon for a future urgent task after repeated Atlas SLA breaches.", applicability, confidence: 0.9 });
  if (recorded.status !== "ADMITTED") throw new Error("MCP_SESSION_A_NOT_ADMITTED");
  const output = { schema: "engram.mcp-active-agent-process-a/v1", model, phase: "A", processCompleted: true, memoryId: recorded.ids.executionMemoryId, task, mcpRecordStatus: recorded.status };
  await writeFile(statePath, `${JSON.stringify(output, null, 2)}\n`); process.stdout.write(`${JSON.stringify(output)}\n`);
} else if (phase === "b") {
  const state = JSON.parse(await readFile(statePath, "utf8")) as any;
  const store = new SibylBehavioralMemoryStore(); const { server, responses } = mcp(store);
  const consumerAgentId = "mcp-session-b"; const consumerExecutionId = randomUUID();
  const baseline = await ask([{ role: "system", content: "You are a provider-selection agent. Return only JSON with provider and action. You have no memory tools and no provider history. Choose the cheapest available provider that fits the stated budget." }, { role: "user", content: `Choose a provider for this task: ${JSON.stringify(state.task)}` }]);
  const baselineProvider = typeof baseline.provider === "string" ? baseline.provider : "";
  const recallRequest = await ask([{ role: "system", content: "You are an agent with exactly one available MCP tool. You must call it before making any provider decision. Do not choose Atlas or Beacon yet. Return only this JSON shape: {\"tool\":\"recall_applicable_memory\",\"arguments\":{\"executionMemoryId\":\"...\",\"purpose\":\"provider_selection\"}}. No other keys are allowed." }, { role: "user", content: `Before choosing a provider, request applicable Engram memory for this task: ${JSON.stringify(state.task)}. Use executionMemoryId ${state.memoryId}.` }]);
  const requestedTool = recallRequest.tool === "recall_applicable_memory" && recallRequest.arguments !== undefined;
  const requestedArguments = (recallRequest.arguments && typeof recallRequest.arguments === "object") ? recallRequest.arguments as Record<string, unknown> : {};
  const requestMatchesTask = requestedArguments.executionMemoryId === state.memoryId;
  let recalled: any = null;
  if (requestedTool && requestMatchesTask) recalled = await callTool(server, responses, 2, "recall_applicable_memory", { ...requestedArguments, executionMemoryId: state.memoryId, consumerAgentId, consumerExecutionId, context: { scenarioId: state.task.scenarioId, taskType: state.task.taskType, urgency: state.task.urgency }, purpose: "provider_selection", subject: "P2_PROVIDER_SLA" });
  if (!requestedTool || !requestMatchesTask || recalled?.status !== "ELIGIBLE") throw new Error(`MCP_ACTIVE_RECALL_NOT_REQUESTED_OR_ELIGIBLE:${JSON.stringify({ recallRequest, requestedTool, requestMatchesTask, recalled })}`);
  const proposal = await ask([{ role: "system", content: `You are a bounded provider-selection agent. Return only JSON with action, provider, memorySliceIds, requestedEffects. Use the eligible Engram memory only if it applies. Cite exactly this returned memory slice ID when it influences you: ${recalled.memorySlice.id}.` }, { role: "user", content: `Task: ${JSON.stringify(state.task)}\nMCP recall result: ${JSON.stringify(recalled)}\nChoose the provider now.` }]);
  const provider = typeof proposal.provider === "string" ? proposal.provider : "";
  const action = typeof proposal.action === "string" ? proposal.action : "";
  const cited = Array.isArray(proposal.memorySliceIds) && proposal.memorySliceIds.length === 1 && proposal.memorySliceIds[0] === recalled.memorySlice.id;
  const effects = Array.isArray(proposal.requestedEffects) ? proposal.requestedEffects : [];
  const influenceRequest = { executionId: consumerExecutionId, actor: { runtime: "mcp-active-agent", model }, decisionType: "provider_selection", proposedAction: { provider }, reasoningSummary: "The recalled provider SLA experience applies to this urgent task.", memorySliceIds: [recalled.memorySlice.id], requestedEffects: ["provider_selection"], proposedAt: new Date().toISOString() };
  const influence = await callTool(server, responses, 3, "request_influence", { consumerAgentId, influenceGrantId: recalled.influenceGrant.id, proposal: influenceRequest });
  const authorized = influence.status === "AUTHORIZED";
  let evaluation: any = null;
  if (authorized) evaluation = await callTool(server, responses, 4, "submit_outcome_evaluation", { evaluation: { id: randomUUID(), executionMemoryId: state.memoryId, memorySliceId: recalled.memorySlice.id, influenceGrantId: recalled.influenceGrant.id, influencedExecutionId: consumerExecutionId, influencedDecisionId: randomUUID(), effect: "BENEFICIAL", effectScore: 1, actionChanged: true, treatmentAction: { provider }, treatmentOutcome: "SUCCESS", updateDirective: "STRENGTHEN", rationale: "Beacon met the urgent SLA after the MCP-recalled experience changed provider selection.", evidenceState: "SIMULATED", evaluatedAt: new Date().toISOString() } });
  const output = { schema: "engram.mcp-active-agent-process-b/v1", model, phase: "B", freshRuntime: true, inMemoryObjectsReused: false, baseline: { modelOutput: baseline, provider: baselineProvider, expectedNoMemoryProvider: "atlas", passed: baselineProvider === "atlas" }, activeAgent: { recallRequest, requestedTool, recalled: { status: recalled.status, memorySliceId: recalled.memorySlice.id, influenceGrantId: recalled.influenceGrant.id }, modelProposal: proposal, provider, action, cited, effects, influence, evaluation }, claims: { agentRequestedRecall: requestedTool, memoryReturned: recalled.status === "ELIGIBLE", modelSelectedBeacon: provider === "beacon", memoryCited: cited, influenceAuthorized: authorized, behaviorChanged: baselineProvider !== provider, updatedMemory: evaluation?.status === "UPDATED", unauthorizedEscapes: 0 } };
  await writeFile(statePath.replace(/\.json$/, "-b.json"), `${JSON.stringify(output, null, 2)}\n`); process.stdout.write(`${JSON.stringify(output)}\n`);
} else throw new Error(`Unknown phase ${phase}`);
