import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createRestServer, listenRestServer } from "../../packages/agent-surface/src/http.js";
import { SibylBehavioralMemoryStore } from "../../packages/sibyl/src/behavioral-store.js";
import { decideProviderScenario, type ProviderScenarioCase } from "../../packages/scenarios/provider-continuity/src/index.js";
import { decideToolRecovery, type ToolRecoveryCase } from "../../packages/scenarios/tool-recovery/src/index.js";
import { decideHandoff, type HandoffScenarioCase } from "../../packages/scenarios/agent-handoff/src/index.js";

const describeSibyl = process.env.ENGRAM_SIBYL_TEST_REQUIRED === "1" ? describe : describe.skip;
let dir = "";
let server: ReturnType<typeof createRestServer> | undefined;
let previousDb: string | undefined;
let previousTenant: string | undefined;

const providerBase: ProviderScenarioCase = { failureMode: "TIMEOUT_OR_OUTAGE", providerId: "atlas", fallbackProviderId: "beacon", urgent: true, verificationPresent: true, currentCostUsd: 12, allowedCostUsd: 20 };
const toolBase: ToolRecoveryCase = { failureMode: "RATE_LIMIT", retryCount: 2, maxRetries: 2, operationStatus: "UNKNOWN", completedSteps: 0, totalSteps: 1, currentSchemaVersion: "v1" };
const handoffBase: HandoffScenarioCase = { scenarioId: "CUSTOMER_SUPPORT_ESCALATION", evidenceComplete: true, approvedSource: true };
const cases = [
  ["P1_PROVIDER_TIMEOUT", "provider_continuity", { scenarioId: "P1", taskType: "provider_timeout" }, () => decideProviderScenario({ ...providerBase, failureMode: "TIMEOUT_OR_OUTAGE" })],
  ["P2_PROVIDER_SLA", "provider_continuity", { scenarioId: "P2", taskType: "provider_sla" }, () => decideProviderScenario({ ...providerBase, failureMode: "REPEATED_SLA_MISS" })],
  ["P3_PROVIDER_TERMS", "provider_continuity", { scenarioId: "P3", taskType: "provider_terms" }, () => decideProviderScenario({ ...providerBase, failureMode: "TERMS_CHANGED" })],
  ["P4_PROVIDER_MILESTONE", "provider_continuity", { scenarioId: "P4", taskType: "provider_milestone" }, () => decideProviderScenario({ ...providerBase, failureMode: "MISSING_MILESTONE" })],
  ["P5_PROVIDER_CONTRADICTION", "provider_continuity", { scenarioId: "P5", taskType: "provider_contradiction" }, () => decideProviderScenario({ ...providerBase, failureMode: "CONTRADICTORY_STATUS" })],
  ["P6_PROVIDER_SUBSTITUTION", "provider_continuity", { scenarioId: "P6", taskType: "provider_substitution" }, () => decideProviderScenario({ ...providerBase, failureMode: "SAFE_SUBSTITUTION" })],
  ["T1_TOOL_RATE_LIMIT", "tool_recovery", { scenarioId: "T1", taskType: "rate_limit" }, () => decideToolRecovery({ ...toolBase, failureMode: "RATE_LIMIT" })],
  ["T2_TOOL_TIMEOUT_DUPLICATE", "tool_recovery", { scenarioId: "T2", taskType: "timeout_duplicate" }, () => decideToolRecovery({ ...toolBase, failureMode: "TIMEOUT_UNKNOWN" })],
  ["T3_TOOL_PARTIAL", "tool_recovery", { scenarioId: "T3", taskType: "partial_completion" }, () => decideToolRecovery({ ...toolBase, failureMode: "PARTIAL_COMPLETION", completedSteps: 3, totalSteps: 5 })],
  ["T4_TOOL_SCHEMA", "tool_recovery", { scenarioId: "T4", taskType: "schema_drift" }, () => decideToolRecovery({ ...toolBase, failureMode: "SCHEMA_DRIFT", requiredSchemaVersion: "v2" })],
  ["T5_TOOL_AMBIGUOUS", "tool_recovery", { scenarioId: "T5", taskType: "ambiguous_completion" }, () => decideToolRecovery({ ...toolBase, failureMode: "AMBIGUOUS_COMPLETION" })],
  ["H1_SUPPORT", "agent_handoff", { scenarioId: "H1", taskType: "support_escalation" }, () => decideHandoff({ ...handoffBase, scenarioId: "CUSTOMER_SUPPORT_ESCALATION" })],
  ["H2_INCIDENT", "agent_handoff", { scenarioId: "H2", taskType: "incident_response" }, () => decideHandoff({ ...handoffBase, scenarioId: "INCIDENT_RESPONSE_HANDOFF" })],
  ["H3_RESEARCH", "agent_handoff", { scenarioId: "H3", taskType: "research_verification" }, () => decideHandoff({ ...handoffBase, scenarioId: "RESEARCH_VERIFICATION_HANDOFF" })],
  ["H4_PROCUREMENT", "agent_handoff", { scenarioId: "H4", taskType: "procurement_approval" }, () => decideHandoff({ ...handoffBase, scenarioId: "PROCUREMENT_APPROVAL_HANDOFF", withinBudget: true })],
  ["H5_RELEASE", "agent_handoff", { scenarioId: "H5", taskType: "deployment_release" }, () => decideHandoff({ ...handoffBase, scenarioId: "DEPLOYMENT_RELEASE_HANDOFF", releaseGatePassed: true })],
] as const;

async function post(base: string, path: string, body: Record<string, unknown>, key: string) {
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) });
  return { status: response.status, json: await response.json() as Record<string, any> };
}

describeSibyl("all documented real-world scenarios through REST", () => {
  beforeEach(async () => {
    dir = await mkdtemp(join("/tmp", "engram-real-world-rest-"));
    previousDb = process.env.ENGRAM_SIBYL_DB; previousTenant = process.env.ENGRAM_SIBYL_TENANT;
    process.env.ENGRAM_SIBYL_DB = join(dir, "memory.db"); process.env.ENGRAM_SIBYL_TENANT = "engram-real-world-rest";
    server = createRestServer({ store: new SibylBehavioralMemoryStore() });
  });
  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    if (previousDb === undefined) delete process.env.ENGRAM_SIBYL_DB; else process.env.ENGRAM_SIBYL_DB = previousDb;
    if (previousTenant === undefined) delete process.env.ENGRAM_SIBYL_TENANT; else process.env.ENGRAM_SIBYL_TENANT = previousTenant;
    await rm(dir, { recursive: true, force: true });
  });

  it.each(cases)("%s records, recalls, authorizes, and evaluates", async (id, domain, context, decide) => {
    const address = await listenRestServer(server!);
    const base = `http://${address.host}:${address.port}`;
    const executionId = randomUUID(); const completedAt = new Date().toISOString(); const decision = decide();
    const recorded = await post(base, "/v1/executions/complete", { execution: { id: executionId, agentId: "rest-scenario-agent", workflowType: domain, intent: `run ${id}`, context, constraints: { bounded: true }, status: "SUCCESS", startedAt: completedAt, completedAt }, events: [{ id: randomUUID(), executionId, sequenceNo: 0, eventType: "scenario.observed", payload: context, evidenceState: "SIMULATED", occurredAt: completedAt }], outcome: { id: randomUUID(), executionId, status: "SUCCESS", summary: `Scenario ${id} observed`, result: { action: decision.action }, evidenceState: "SIMULATED" }, evidenceRefs: [`local:rest-scenario:${id}`], subject: id, fields: context, observation: `Scenario ${id} was observed`, interpretation: `Use bounded ${decision.action} recovery`, applicability: context, confidence: 0.9 }, `${id}-record`);
    expect(recorded.status).toBe(200); expect(recorded.json.data.status).toBe("ADMITTED");
    const memoryId = recorded.json.data.ids.executionMemoryId as string; const consumerExecutionId = randomUUID();
    const recalled = await post(base, "/v1/memories/recall", { executionMemoryId: memoryId, consumerAgentId: "rest-scenario-consumer", consumerExecutionId, context, purpose: "scenario_recovery", subject: id }, `${id}-recall`);
    expect(recalled.status).toBe(200); expect(recalled.json.data.status).toBe("ELIGIBLE");
    const slice = recalled.json.data.memorySlice; const grant = recalled.json.data.influenceGrant;
    const effect = domain === "provider_continuity" ? "provider_selection" : domain === "tool_recovery" ? "retry_policy" : "verification_policy";
    const influenced = await post(base, "/v1/influence/requests", { consumerAgentId: "rest-scenario-consumer", influenceGrantId: grant.id, proposal: { executionId: consumerExecutionId, actor: { runtime: "rest-scenario-matrix" }, decisionType: domain, proposedAction: { scenarioId: id, action: decision.action }, reasoningSummary: `Bounded ${decision.action} for ${id}`, memorySliceIds: [slice.id], requestedEffects: [effect], proposedAt: completedAt } }, `${id}-influence`);
    expect(influenced.status).toBe(200); expect(influenced.json.data.status).toBe("AUTHORIZED");
    const evaluation = await post(base, "/v1/outcome-evaluations", { evaluation: { id: randomUUID(), executionMemoryId: memoryId, memorySliceId: slice.id, influenceGrantId: grant.id, influencedExecutionId: consumerExecutionId, influencedDecisionId: randomUUID(), effect: "BENEFICIAL", effectScore: 0.8, actionChanged: true, treatmentAction: { scenarioId: id, action: decision.action }, treatmentOutcome: "SUCCESS", updateDirective: "STRENGTHEN", rationale: `Scenario ${id} completed through bounded influence`, evidenceState: "SIMULATED", evaluatedAt: new Date().toISOString() } }, `${id}-evaluation`);
    expect(evaluation.status).toBe(200); expect(evaluation.json.data.status).toBe("UPDATED");
  });
});
