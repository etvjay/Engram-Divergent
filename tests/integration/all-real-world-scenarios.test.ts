import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EngramClient } from "../../packages/agent-surface/src/sdk.js";
import { SibylBehavioralMemoryStore } from "../../packages/sibyl/src/behavioral-store.js";
import { decideProviderScenario, type ProviderScenarioCase } from "../../packages/scenarios/provider-continuity/src/index.js";
import { decideToolRecovery, type ToolRecoveryCase } from "../../packages/scenarios/tool-recovery/src/index.js";
import { decideHandoff, type HandoffScenarioCase } from "../../packages/scenarios/agent-handoff/src/index.js";

const describeSibyl = process.env.ENGRAM_SIBYL_TEST_REQUIRED === "1" ? describe : describe.skip;
let dir = "";
let previousDb: string | undefined;
let previousTenant: string | undefined;

type Case = { id: string; domain: string; context: Record<string, unknown>; decide: () => { action: string; safe: boolean } };

const providerBase: ProviderScenarioCase = { failureMode: "TIMEOUT_OR_OUTAGE", providerId: "atlas", fallbackProviderId: "beacon", urgent: true, verificationPresent: true, currentCostUsd: 12, allowedCostUsd: 20 };
const toolBase: ToolRecoveryCase = { failureMode: "RATE_LIMIT", retryCount: 2, maxRetries: 2, operationStatus: "UNKNOWN", completedSteps: 0, totalSteps: 1, currentSchemaVersion: "v1" };
const handoffBase: HandoffScenarioCase = { scenarioId: "CUSTOMER_SUPPORT_ESCALATION", evidenceComplete: true, approvedSource: true };

const cases: Case[] = [
  { id: "P1_PROVIDER_TIMEOUT", domain: "provider_continuity", context: { scenarioId: "P1", taskType: "provider_timeout" }, decide: () => decideProviderScenario({ ...providerBase, failureMode: "TIMEOUT_OR_OUTAGE" }) },
  { id: "P2_PROVIDER_SLA", domain: "provider_continuity", context: { scenarioId: "P2", taskType: "provider_sla" }, decide: () => decideProviderScenario({ ...providerBase, failureMode: "REPEATED_SLA_MISS" }) },
  { id: "P3_PROVIDER_TERMS", domain: "provider_continuity", context: { scenarioId: "P3", taskType: "provider_terms" }, decide: () => decideProviderScenario({ ...providerBase, failureMode: "TERMS_CHANGED" }) },
  { id: "P4_PROVIDER_MILESTONE", domain: "provider_continuity", context: { scenarioId: "P4", taskType: "provider_milestone" }, decide: () => decideProviderScenario({ ...providerBase, failureMode: "MISSING_MILESTONE" }) },
  { id: "P5_PROVIDER_CONTRADICTION", domain: "provider_continuity", context: { scenarioId: "P5", taskType: "provider_contradiction" }, decide: () => decideProviderScenario({ ...providerBase, failureMode: "CONTRADICTORY_STATUS" }) },
  { id: "P6_PROVIDER_SUBSTITUTION", domain: "provider_continuity", context: { scenarioId: "P6", taskType: "provider_substitution" }, decide: () => decideProviderScenario({ ...providerBase, failureMode: "SAFE_SUBSTITUTION" }) },
  { id: "T1_TOOL_RATE_LIMIT", domain: "tool_recovery", context: { scenarioId: "T1", taskType: "rate_limit" }, decide: () => decideToolRecovery({ ...toolBase, failureMode: "RATE_LIMIT" }) },
  { id: "T2_TOOL_TIMEOUT_DUPLICATE", domain: "tool_recovery", context: { scenarioId: "T2", taskType: "timeout_duplicate" }, decide: () => decideToolRecovery({ ...toolBase, failureMode: "TIMEOUT_UNKNOWN" }) },
  { id: "T3_TOOL_PARTIAL", domain: "tool_recovery", context: { scenarioId: "T3", taskType: "partial_completion" }, decide: () => decideToolRecovery({ ...toolBase, failureMode: "PARTIAL_COMPLETION", completedSteps: 3, totalSteps: 5 }) },
  { id: "T4_TOOL_SCHEMA", domain: "tool_recovery", context: { scenarioId: "T4", taskType: "schema_drift" }, decide: () => decideToolRecovery({ ...toolBase, failureMode: "SCHEMA_DRIFT", requiredSchemaVersion: "v2" }) },
  { id: "T5_TOOL_AMBIGUOUS", domain: "tool_recovery", context: { scenarioId: "T5", taskType: "ambiguous_completion" }, decide: () => decideToolRecovery({ ...toolBase, failureMode: "AMBIGUOUS_COMPLETION" }) },
  { id: "H1_SUPPORT", domain: "agent_handoff", context: { scenarioId: "H1", taskType: "support_escalation" }, decide: () => decideHandoff({ ...handoffBase, scenarioId: "CUSTOMER_SUPPORT_ESCALATION" }) },
  { id: "H2_INCIDENT", domain: "agent_handoff", context: { scenarioId: "H2", taskType: "incident_response" }, decide: () => decideHandoff({ ...handoffBase, scenarioId: "INCIDENT_RESPONSE_HANDOFF" }) },
  { id: "H3_RESEARCH", domain: "agent_handoff", context: { scenarioId: "H3", taskType: "research_verification" }, decide: () => decideHandoff({ ...handoffBase, scenarioId: "RESEARCH_VERIFICATION_HANDOFF" }) },
  { id: "H4_PROCUREMENT", domain: "agent_handoff", context: { scenarioId: "H4", taskType: "procurement_approval" }, decide: () => decideHandoff({ ...handoffBase, scenarioId: "PROCUREMENT_APPROVAL_HANDOFF", withinBudget: true }) },
  { id: "H5_RELEASE", domain: "agent_handoff", context: { scenarioId: "H5", taskType: "deployment_release" }, decide: () => decideHandoff({ ...handoffBase, scenarioId: "DEPLOYMENT_RELEASE_HANDOFF", releaseGatePassed: true }) },
];

const scenarioResults: Array<{ scenarioId: string; domain: string; status: "PASS"; action: string; evidenceState: "SIMULATED"; surfaces: ["SDK"]; }> = [];

describeSibyl("all documented real-world scenarios through the SDK lifecycle", () => {
  afterAll(async () => {
    const outputDir = resolve("evidence/evals/real-world-scenarios/latest");
    await mkdir(outputDir, { recursive: true });
    const testedGitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd() }).toString().trim();
    await writeFile(join(outputDir, "results.json"), `${JSON.stringify({ schema: "engram.real-world-scenario-matrix/v1", evidenceState: "LOCAL_PASS", testedGitSha, scenarioCount: scenarioResults.length, results: scenarioResults }, null, 2)}\n`);
  });

  beforeEach(async () => {
    dir = await mkdtemp(join("/tmp", "engram-real-world-matrix-"));
    previousDb = process.env.ENGRAM_SIBYL_DB;
    previousTenant = process.env.ENGRAM_SIBYL_TENANT;
    process.env.ENGRAM_SIBYL_DB = join(dir, "memory.db");
    process.env.ENGRAM_SIBYL_TENANT = "engram-real-world-matrix";
  });
  afterEach(async () => {
    if (previousDb === undefined) delete process.env.ENGRAM_SIBYL_DB; else process.env.ENGRAM_SIBYL_DB = previousDb;
    if (previousTenant === undefined) delete process.env.ENGRAM_SIBYL_TENANT; else process.env.ENGRAM_SIBYL_TENANT = previousTenant;
    await rm(dir, { recursive: true, force: true });
  });

  it.each(cases)("$id records, recalls, authorizes, and evaluates", async (scenario) => {
    const client = new EngramClient({ store: new SibylBehavioralMemoryStore() });
    const executionId = randomUUID();
    const completedAt = new Date().toISOString();
    const decision = scenario.decide();
    const recorded = await client.recordCompleteExecution({
      execution: { id: executionId, agentId: "scenario-agent", workflowType: scenario.domain, intent: `run ${scenario.id}`, context: scenario.context, constraints: { bounded: true }, status: "SUCCESS", startedAt: completedAt, completedAt },
      events: [{ id: randomUUID(), executionId, sequenceNo: 0, eventType: "scenario.observed", payload: scenario.context, evidenceState: "SIMULATED", occurredAt: completedAt }],
      outcome: { id: randomUUID(), executionId, status: "SUCCESS", summary: `Scenario ${scenario.id} observed`, result: { action: decision.action }, evidenceState: "SIMULATED" },
      evidenceRefs: [`local:scenario:${scenario.id}`], subject: scenario.id, fields: scenario.context, observation: `Scenario ${scenario.id} was observed`, interpretation: `Use bounded ${decision.action} recovery`, applicability: scenario.context, confidence: 0.9,
    });
    expect(recorded.status).toBe("ADMITTED");
    if (recorded.status !== "ADMITTED") throw new Error(`memory admission failed for ${scenario.id}`);
    const consumerExecutionId = randomUUID();
    const recalled = await client.recallApplicableMemory({ executionMemoryId: recorded.ids.executionMemoryId, consumerAgentId: "scenario-consumer", consumerExecutionId, context: scenario.context, purpose: "scenario_recovery", subject: scenario.id });
    expect(recalled.status).toBe("ELIGIBLE");
    if (recalled.status !== "ELIGIBLE") throw new Error(`memory recall failed for ${scenario.id}`);
    const proposed = await client.requestInfluence({ consumerAgentId: "scenario-consumer", influenceGrantId: recalled.influenceGrant.id, proposal: { executionId: consumerExecutionId, actor: { runtime: "scenario-matrix" }, decisionType: scenario.domain, proposedAction: { scenarioId: scenario.id, action: decision.action }, reasoningSummary: `Bounded ${decision.action} for ${scenario.id}`, memorySliceIds: [recalled.memorySlice.id], requestedEffects: [scenario.domain === "provider_continuity" ? "provider_selection" : scenario.domain === "tool_recovery" ? "retry_policy" : "verification_policy"], proposedAt: completedAt } });
    expect(proposed.status).toBe("AUTHORIZED");
    const evaluation = await client.submitOutcomeEvaluation({ evaluation: { id: randomUUID(), executionMemoryId: recorded.ids.executionMemoryId, memorySliceId: recalled.memorySlice.id, influenceGrantId: recalled.influenceGrant.id, influencedExecutionId: consumerExecutionId, influencedDecisionId: randomUUID(), effect: "BENEFICIAL", effectScore: 0.8, actionChanged: true, treatmentAction: { scenarioId: scenario.id, action: decision.action }, treatmentOutcome: "SUCCESS", updateDirective: "STRENGTHEN", rationale: `Scenario ${scenario.id} completed through bounded influence`, evidenceState: "SIMULATED", evaluatedAt: new Date().toISOString() } });
    expect(evaluation.status).toBe("UPDATED");
    scenarioResults.push({ scenarioId: scenario.id, domain: scenario.domain, status: "PASS", action: decision.action, evidenceState: "SIMULATED", surfaces: ["SDK"] });
  });
});
