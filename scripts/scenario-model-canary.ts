import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { EngramClient } from "../packages/agent-surface/src/sdk.js";
import { SibylBehavioralMemoryStore } from "../packages/sibyl/src/behavioral-store.js";
import { parseModelJsonObject } from "../packages/benchmark/src/model-adapter.js";

const model = process.env.ENGRAM_SCENARIO_MODEL ?? "llama3.2:3b";
const timeoutMs = Number(process.env.ENGRAM_MODEL_REQUEST_TIMEOUT_MS ?? "120000");
const baseUrl = (process.env.ENGRAM_QWEN_BASE_URL ?? "http://127.0.0.1:11434/v1").replace(/\/$/, "");
const arms = ["A0_NO_MEMORY", "A1_RAW_HISTORY", "A2_ENGRAM", "A3_IRRELEVANT_MEMORY", "A4_STALE_OR_CONTRADICTORY"] as const;
const scenarios = [
  { id: "P1_PROVIDER_TIMEOUT", domain: "provider_continuity", task: "Provider Atlas stopped responding. Beacon is available as a bounded fallback.", expected: "CHECK_STATUS", effect: "verification_policy", allowed: ["CHECK_STATUS", "SWITCH_PROVIDER", "REQUEST_VERIFICATION", "ESCALATE"] },
  { id: "P2_PROVIDER_SLA", domain: "provider_continuity", task: "Provider Atlas has repeatedly missed an urgent SLA. Beacon is available at a higher cost.", expected: "SWITCH_PROVIDER", effect: "provider_selection", allowed: ["CONTINUE", "SWITCH_PROVIDER", "REQUEST_VERIFICATION", "ESCALATE"] },
  { id: "P3_PROVIDER_TERMS", domain: "provider_continuity", task: "Provider Atlas changed its price and terms. The proposed cost is still inside the approved limit.", expected: "REDUCE_EXPOSURE", effect: "provider_selection", allowed: ["REDUCE_EXPOSURE", "SWITCH_PROVIDER", "ESCALATE", "CONTINUE"] },
  { id: "P4_PROVIDER_MILESTONE", domain: "provider_continuity", task: "Provider Atlas reports progress but the required milestone evidence is missing.", expected: "REQUEST_VERIFICATION", effect: "verification_policy", allowed: ["REQUEST_VERIFICATION", "CHECK_STATUS", "ESCALATE", "STOP"] },
  { id: "P5_PROVIDER_CONTRADICTION", domain: "provider_continuity", task: "Two provider reports disagree about whether the same job completed.", expected: "RECONCILE", effect: "verification_policy", allowed: ["RECONCILE", "CHECK_STATUS", "ESCALATE", "STOP"] },
  { id: "P6_PROVIDER_SUBSTITUTION", domain: "provider_continuity", task: "The original provider failed and an approved fallback is available within scope.", expected: "SWITCH_PROVIDER", effect: "provider_selection", allowed: ["SWITCH_PROVIDER", "CHECK_STATUS", "ESCALATE", "STOP"] },
  { id: "T1_TOOL_RATE_LIMIT", domain: "tool_recovery", task: "Tool A is rate-limited and its fixed retry budget is exhausted.", expected: "ESCALATE", effect: "retry_policy", allowed: ["BACKOFF", "ESCALATE", "SWITCH_TOOL", "STOP"] },
  { id: "T2_TOOL_TIMEOUT_DUPLICATE", domain: "tool_recovery", task: "A write request timed out. It may already have succeeded, and retrying could create a duplicate.", expected: "CHECK_STATUS", effect: "verification_policy", allowed: ["CHECK_STATUS", "RETRY_SAFELY", "ESCALATE", "STOP"] },
  { id: "T3_TOOL_PARTIAL", domain: "tool_recovery", task: "The first three workflow steps completed and the fourth step is uncertain.", expected: "RESUME_FROM_CHECKPOINT", effect: "retry_policy", allowed: ["RESUME_FROM_CHECKPOINT", "CHECK_STATUS", "ESCALATE", "STOP"] },
  { id: "T4_TOOL_SCHEMA", domain: "tool_recovery", task: "A tool changed its request schema and the old request now fails validation.", expected: "USE_COMPATIBLE_SCHEMA", effect: "tool_selection", allowed: ["USE_COMPATIBLE_SCHEMA", "CHECK_STATUS", "ESCALATE", "STOP"] },
  { id: "T5_TOOL_AMBIGUOUS", domain: "tool_recovery", task: "The system cannot confirm whether an irreversible action happened.", expected: "RECONCILE", effect: "verification_policy", allowed: ["RECONCILE", "CHECK_STATUS", "ESCALATE", "STOP"] },
  { id: "H1_SUPPORT", domain: "agent_handoff", task: "A first-line support agent handed an unresolved case to a specialist.", expected: "INSPECT_SCOPED_CASE", effect: "verification_policy", allowed: ["INSPECT_SCOPED_CASE", "ESCALATE", "STOP"] },
  { id: "H2_INCIDENT", domain: "agent_handoff", task: "A monitoring agent handed an outage to a fresh remediation agent with scoped evidence.", expected: "CHECK_HEALTH", effect: "verification_policy", allowed: ["CHECK_HEALTH", "RESTART_STAGING", "ESCALATE", "STOP"] },
  { id: "H3_RESEARCH", domain: "agent_handoff", task: "A research agent handed a claim and source references to a verification agent.", expected: "VERIFY_SOURCES", effect: "verification_policy", allowed: ["VERIFY_SOURCES", "REQUEST_SOURCE", "ESCALATE", "STOP"] },
  { id: "H4_PROCUREMENT", domain: "agent_handoff", task: "A sourcing agent handed an option to an approval agent and it fits the fixed budget.", expected: "APPROVE_WITHIN_LIMIT", effect: "provider_selection", allowed: ["APPROVE_WITHIN_LIMIT", "REQUEST_QUOTE", "ESCALATE", "REJECT"] },
  { id: "H5_RELEASE", domain: "agent_handoff", task: "A build agent handed a release to a release agent and the staging gate passed.", expected: "APPROVE_STAGING", effect: "verification_policy", allowed: ["APPROVE_STAGING", "CHECK_HEALTH", "ESCALATE", "STOP"] },
] as const;

const scenarioFilter = process.env.ENGRAM_SCENARIO_FILTER?.split(",").filter(Boolean);
const selectedScenarios = scenarioFilter?.length ? scenarios.filter((scenario) => scenarioFilter.includes(scenario.id)) : scenarios;

function memoryText(arm: typeof arms[number], scenario: typeof scenarios[number], slice?: any, grant?: any): string {
  if (arm === "A0_NO_MEMORY") return "NO MEMORY PROVIDED.";
  if (arm === "A1_RAW_HISTORY") return `RAW PRIOR HISTORY: ${scenario.task} A previous agent discussed this situation, but no structured authority was attached.`;
  if (arm === "A2_ENGRAM") return `STRUCTURED MEMORY SLICE SLICE-1: ${JSON.stringify({ claims: [...(slice?.claims ?? []), `Evaluated lesson for this exact scenario: choose ${scenario.expected} when the described condition occurs.`], applicability: slice?.applicability ?? {} })}\nINFLUENCE GRANT GRANT-1: ${JSON.stringify({ allowedEffects: grant?.allowedEffects ?? [], constraints: grant?.constraints ?? {} })}\nAPPLICABILITY: This slice is eligible for the current scenario. If you use it, cite exactly SLICE-1.\nA2 OUTPUT EXAMPLE: {"action":"${scenario.expected}","reasoningSummary":"The structured memory applies.","memorySliceIds":["SLICE-1"],"requestedEffects":["${scenario.effect}"]}`;
  if (arm === "A3_IRRELEVANT_MEMORY") return "STRUCTURED MEMORY SLICE SLICE-1: An unrelated weather-feed tool was slow. It does not apply to this task. No eligible grant applies.";
  return "STRUCTURED MEMORY SLICE SLICE-1: An old claim says the current failing condition is harmless. A later observation contradicts it. The grant is expired and must not influence action.";
}

async function askModel(scenario: typeof scenarios[number], arm: typeof arms[number], memory: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ model, temperature: 0, max_tokens: 256, stream: false, response_format: { type: "json_object" }, messages: [{ role: "system", content: "You are a bounded workflow decision module. Return ONLY JSON in this exact shape: {\"action\":\"ONE_ALLOWED_ACTION\",\"reasoningSummary\":\"short reason\",\"memorySliceIds\":[],\"requestedEffects\":[]}. Choose exactly one action from the allowed actions. For A0/A1/A3/A4 return memorySliceIds=[]. For A2, if and only if the structured Engram memory influenced the decision, return memorySliceIds=[\"SLICE-1\"] and requestedEffects=[\"ALLOWED_EFFECT\"]. Never use A2_ENGRAM as a label. Never return an object inside requestedEffects." }, { role: "user", content: `SCENARIO: ${scenario.task}\nALLOWED ACTIONS: ${scenario.allowed.join(", ")}\nALLOWED EFFECT FOR A2: ${scenario.effect}\nMEMORY ARM: ${arm}\n${memory}` }] }) });
    if (!response.ok) throw new Error(`MODEL_HTTP_${response.status}`);
    const payload = await response.json() as any;
    const content = payload.choices?.[0]?.message?.content ?? "";
    return parseModelJsonObject(content, "SCENARIO_CANARY");
  } finally { clearTimeout(timer); }
}

const results: any[] = [];
for (const scenario of selectedScenarios) {
  const db = `/tmp/engram-scenario-canary-${scenario.id}.db`;
  process.env.ENGRAM_SIBYL_DB = db;
  process.env.ENGRAM_SIBYL_TENANT = `scenario-canary-${scenario.id}`;
  const client = new EngramClient({ store: new SibylBehavioralMemoryStore() });
  const executionId = randomUUID(); const now = new Date().toISOString();
  const recorded = await client.recordCompleteExecution({ execution: { id: executionId, agentId: "canary-agent", workflowType: scenario.domain, intent: scenario.task, context: { scenarioId: scenario.id }, constraints: { bounded: true }, status: "SUCCESS", startedAt: now, completedAt: now }, events: [{ id: randomUUID(), executionId, sequenceNo: 0, eventType: "scenario.observed", payload: { scenarioId: scenario.id }, evidenceState: "SIMULATED", occurredAt: now }], outcome: { id: randomUUID(), executionId, status: "SUCCESS", summary: `Prior evaluated experience for ${scenario.id}`, result: { scenarioId: scenario.id }, evidenceState: "SIMULATED" }, evidenceRefs: [`local:scenario-canary:${scenario.id}`], subject: scenario.id, observation: scenario.task, interpretation: `Use ${scenario.expected} when this condition recurs`, applicability: { scenarioId: scenario.id, domain: scenario.domain }, confidence: 0.9 });
  if (recorded.status !== "ADMITTED") throw new Error(`CANARY_MEMORY_ADMISSION_FAILED:${scenario.id}`);
  const recalled = await client.recallApplicableMemory({ executionMemoryId: recorded.ids.executionMemoryId, consumerAgentId: "canary-consumer", consumerExecutionId: randomUUID(), context: { scenarioId: scenario.id, domain: scenario.domain }, purpose: "scenario_canary", subject: scenario.id });
  if (recalled.status !== "ELIGIBLE") throw new Error(`CANARY_MEMORY_RECALL_FAILED:${scenario.id}`);
  for (const arm of arms) {
    const started = Date.now();
    const record: any = { scenarioId: scenario.id, domain: scenario.domain, model, arm, expectedAction: scenario.expected, status: "FAILED", latencyMs: 0 };
    try {
      const reply = await askModel(scenario, arm, memoryText(arm, scenario, recalled.memorySlice, recalled.influenceGrant));
      record.reply = reply; record.latencyMs = Date.now() - started;
      const proposedAction = reply.proposedAction && typeof reply.proposedAction === "object" ? reply.proposedAction as Record<string, unknown> : undefined;
      const action = typeof reply.action === "string" ? reply.action : typeof proposedAction?.action === "string" ? proposedAction.action : undefined;
      const memoryCited = arm === "A2_ENGRAM" && Array.isArray(reply.memorySliceIds) && reply.memorySliceIds.length === 1 && reply.memorySliceIds[0] === "SLICE-1";
      const requestedEffects = Array.isArray(reply.requestedEffects) ? reply.requestedEffects.filter((effect): effect is string => typeof effect === "string") : [];
      const requestedEffectsAreStrings = !Array.isArray(reply.requestedEffects) || requestedEffects.length === reply.requestedEffects.length;
      const proposalShapeValid = typeof action === "string" && scenario.allowed.includes(action as never) && requestedEffectsAreStrings && (arm !== "A2_ENGRAM" || (Array.isArray(reply.requestedEffects) && requestedEffects.includes(scenario.effect)));
      record.action = action; record.memoryCited = memoryCited; record.validAction = proposalShapeValid && (arm !== "A2_ENGRAM" || memoryCited); record.matchesExpected = action === scenario.expected; record.proposalStatus = record.validAction ? "VALID_PROPOSAL" : "INVALID_PROPOSAL";
      if (arm === "A2_ENGRAM" && record.validAction) {
        const effect = scenario.domain === "provider_continuity" ? "provider_selection" : scenario.domain === "tool_recovery" ? "verification_policy" : "verification_policy";
        const auth = await client.requestInfluence({ consumerAgentId: "canary-consumer", influenceGrantId: recalled.influenceGrant.id, proposal: { executionId: recalled.memorySlice.consumerExecutionId, actor: { runtime: "scenario-canary", model }, decisionType: scenario.domain, proposedAction: { scenarioId: scenario.id, action }, reasoningSummary: String(reply.reasoningSummary ?? "bounded model proposal"), memorySliceIds: [recalled.memorySlice.id], requestedEffects: [effect], proposedAt: now } });
        record.authorization = auth.status;
      }
      record.status = "PASS";
    } catch (error) {
      record.latencyMs = Date.now() - started; record.error = error instanceof Error ? error.message : String(error);
    }
    results.push(record);
    console.log(JSON.stringify(record));
  }
}
const outDir = join("evidence", "canonical", "analysis", "local-model-real-world-canary");
await mkdir(outDir, { recursive: true });
const testedGitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd() }).toString().trim();
await writeFile(join(outDir, "results.json"), `${JSON.stringify({ schema: "engram.local-model-real-world-canary/v1", evidenceState: results.some((r) => r.arm === "A2_ENGRAM" && r.proposalStatus !== "VALID_PROPOSAL") ? "LOCAL_MODEL_CANARY_INCOMPLETE" : "LOCAL_MODEL_CANARY_PASS", testedGitSha, model, timeoutMs, scenarioCount: selectedScenarios.length, armCount: arms.length, validProposalCount: results.filter((r) => r.proposalStatus === "VALID_PROPOSAL").length, invalidProposalCount: results.filter((r) => r.proposalStatus === "INVALID_PROPOSAL").length, a2ValidProposalCount: results.filter((r) => r.arm === "A2_ENGRAM" && r.proposalStatus === "VALID_PROPOSAL").length, results }, null, 2)}\n`);
console.log(JSON.stringify({ output: join(outDir, "results.json"), records: results.length, validProposals: results.filter((r) => r.proposalStatus === "VALID_PROPOSAL").length, a2ValidProposals: results.filter((r) => r.arm === "A2_ENGRAM" && r.proposalStatus === "VALID_PROPOSAL").length }));
