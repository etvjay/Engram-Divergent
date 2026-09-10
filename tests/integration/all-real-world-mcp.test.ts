import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createMcpStdioServer } from "../../packages/agent-surface/src/mcp-stdio.js";
import { SibylBehavioralMemoryStore } from "../../packages/sibyl/src/behavioral-store.js";

const describeSibyl = process.env.ENGRAM_SIBYL_TEST_REQUIRED === "1" ? describe : describe.skip;
let dir = ""; let previousDb: string | undefined; let previousTenant: string | undefined;
const cases = [
  ["P1_PROVIDER_TIMEOUT", "provider_continuity", "provider_timeout"], ["P2_PROVIDER_SLA", "provider_continuity", "provider_sla"], ["P3_PROVIDER_TERMS", "provider_continuity", "provider_terms"], ["P4_PROVIDER_MILESTONE", "provider_continuity", "provider_milestone"], ["P5_PROVIDER_CONTRADICTION", "provider_continuity", "provider_contradiction"], ["P6_PROVIDER_SUBSTITUTION", "provider_continuity", "provider_substitution"],
  ["T1_TOOL_RATE_LIMIT", "tool_recovery", "rate_limit"], ["T2_TOOL_TIMEOUT_DUPLICATE", "tool_recovery", "timeout_duplicate"], ["T3_TOOL_PARTIAL", "tool_recovery", "partial_completion"], ["T4_TOOL_SCHEMA", "tool_recovery", "schema_drift"], ["T5_TOOL_AMBIGUOUS", "tool_recovery", "ambiguous_completion"],
  ["H1_SUPPORT", "agent_handoff", "support_escalation"], ["H2_INCIDENT", "agent_handoff", "incident_response"], ["H3_RESEARCH", "agent_handoff", "research_verification"], ["H4_PROCUREMENT", "agent_handoff", "procurement_approval"], ["H5_RELEASE", "agent_handoff", "deployment_release"],
] as const;
function transport(store: SibylBehavioralMemoryStore) { const responses: Array<Record<string, any>> = []; const output = { write(chunk: string) { responses.push(JSON.parse(chunk)); return true; } } as any; return { server: createMcpStdioServer({ store, output }), responses }; }
async function call(server: ReturnType<typeof createMcpStdioServer>, responses: Array<Record<string, any>>, id: number, name: string, args: Record<string, unknown>) { await server.handle(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })); return responses.at(-1)!; }

describeSibyl("all documented real-world scenarios through MCP stdio", () => {
  beforeEach(async () => { dir = await mkdtemp(join("/tmp", "engram-real-world-mcp-")); previousDb = process.env.ENGRAM_SIBYL_DB; previousTenant = process.env.ENGRAM_SIBYL_TENANT; process.env.ENGRAM_SIBYL_DB = join(dir, "memory.db"); process.env.ENGRAM_SIBYL_TENANT = "engram-real-world-mcp"; });
  afterEach(async () => { if (previousDb === undefined) delete process.env.ENGRAM_SIBYL_DB; else process.env.ENGRAM_SIBYL_DB = previousDb; if (previousTenant === undefined) delete process.env.ENGRAM_SIBYL_TENANT; else process.env.ENGRAM_SIBYL_TENANT = previousTenant; await rm(dir, { recursive: true, force: true }); });
  it.each(cases)("%s records, recalls, authorizes, and evaluates", async (id, domain, taskType) => {
    const { server, responses } = transport(new SibylBehavioralMemoryStore()); const executionId = randomUUID(); const completedAt = new Date().toISOString(); const context = { scenarioId: id, taskType };
    const recorded = await call(server, responses, 1, "record_complete_execution", { execution: { id: executionId, agentId: "mcp-scenario-agent", workflowType: domain, intent: `run ${id}`, context, constraints: { bounded: true }, status: "SUCCESS", startedAt: completedAt, completedAt }, events: [{ id: randomUUID(), executionId, sequenceNo: 0, eventType: "scenario.observed", payload: context, evidenceState: "SIMULATED", occurredAt: completedAt }], outcome: { id: randomUUID(), executionId, status: "SUCCESS", summary: `Scenario ${id} observed`, result: { value: "ok" }, evidenceState: "SIMULATED" }, evidenceRefs: [`local:mcp-scenario:${id}`], subject: id, fields: context, observation: `Scenario ${id} observed`, interpretation: "Bounded scenario recovery", applicability: context, confidence: 0.9 });
    expect(recorded.result.status).toBe("ADMITTED"); const memoryId = recorded.result.ids.executionMemoryId; const consumerExecutionId = randomUUID();
    const recalled = await call(server, responses, 2, "recall_applicable_memory", { executionMemoryId: memoryId, consumerAgentId: "mcp-scenario-consumer", consumerExecutionId, context, purpose: "scenario_recovery", subject: id });
    expect(recalled.result.status).toBe("ELIGIBLE"); const slice = recalled.result.memorySlice; const grant = recalled.result.influenceGrant;
    const effect = domain === "provider_continuity" ? "provider_selection" : domain === "tool_recovery" ? "retry_policy" : "verification_policy";
    const influenced = await call(server, responses, 3, "request_influence", { consumerAgentId: "mcp-scenario-consumer", influenceGrantId: grant.id, proposal: { executionId: consumerExecutionId, actor: { runtime: "mcp-scenario-matrix" }, decisionType: domain, proposedAction: { scenarioId: id, action: "BOUNDED_RECOVERY" }, reasoningSummary: `Bounded recovery for ${id}`, memorySliceIds: [slice.id], requestedEffects: [effect], proposedAt: completedAt } });
    expect(influenced.result.status).toBe("AUTHORIZED");
    const evaluated = await call(server, responses, 4, "submit_outcome_evaluation", { evaluation: { id: randomUUID(), executionMemoryId: memoryId, memorySliceId: slice.id, influenceGrantId: grant.id, influencedExecutionId: consumerExecutionId, influencedDecisionId: randomUUID(), effect: "BENEFICIAL", effectScore: 0.8, actionChanged: true, treatmentAction: { scenarioId: id, action: "BOUNDED_RECOVERY" }, treatmentOutcome: "SUCCESS", updateDirective: "STRENGTHEN", rationale: `Scenario ${id} completed`, evidenceState: "SIMULATED", evaluatedAt: new Date().toISOString() } });
    expect(evaluated.result.status).toBe("UPDATED");
  });
});
