import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import { DEFAULT_RUNTIME_POLICIES } from "../../packages/runtime/src/defaults.js";
import { SibylRuntimeStore } from "../../packages/sibyl/src/runtime-store.js";
import {
  decideProviderEngagement,
  executeProviderEngagement,
  type ProviderContinuityContext,
  type ProviderOffer,
} from "../../packages/scenarios/provider-continuity/src/index.js";

const describeSibyl = process.env.ENGRAM_SIBYL_TEST_REQUIRED === "1" ? describe : describe.skip;

let dir: string;
let previousDb: string | undefined;
let previousTenant: string | undefined;

const offers: ProviderOffer[] = [
  { providerId: "atlas", priceUsd: 8, expectedLatencySeconds: 20 },
  { providerId: "beacon", priceUsd: 11, expectedLatencySeconds: 18 },
];

const urgent: ProviderContinuityContext = {
  workflowType: "agent_provider_selection",
  taskType: "data_fetch",
  urgency: "URGENT",
  budgetUsd: 20,
  maxLatencySeconds: 30,
  environmentVersion: "provider-market-v1",
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "engram-sibyl-provider-"));
  previousDb = process.env.ENGRAM_SIBYL_DB;
  previousTenant = process.env.ENGRAM_SIBYL_TENANT;
  process.env.ENGRAM_SIBYL_DB = join(dir, "memory.db");
  process.env.ENGRAM_SIBYL_TENANT = "engram-provider-test";
});

afterEach(async () => {
  if (previousDb === undefined) delete process.env.ENGRAM_SIBYL_DB;
  else process.env.ENGRAM_SIBYL_DB = previousDb;
  if (previousTenant === undefined) delete process.env.ENGRAM_SIBYL_TENANT;
  else process.env.ENGRAM_SIBYL_TENANT = previousTenant;
  await rm(dir, { recursive: true, force: true });
});

async function recordAtlasBreach(runtime: EngramRuntime, attempt: number) {
  const run = await runtime.startExecution({
    agentId: "requester-agent",
    workflowType: "agent_provider_selection",
    intent: "obtain urgent data from an eligible provider",
    context: { taskType: "data_fetch", urgency: "URGENT", providerId: "atlas", attempt },
    constraints: { maxLatencySeconds: 30 },
    environmentVersion: "provider-market-v1",
  });
  await runtime.observe({
    executionId: run.executionId,
    type: "PROVIDER_SLA_BREACH",
    payload: { providerId: "atlas", taskType: "data_fetch", latencySeconds: 55 + attempt },
    evidenceState: "OBSERVED",
    provenance: [{ source: "provider-execution", attempt }],
  });
  await runtime.complete({
    executionId: run.executionId,
    status: "PARTIAL",
    summary: `Atlas breached the urgent data-fetch SLA on attempt ${attempt}.`,
    result: { providerId: "atlas", failureType: "SLA_BREACH", urgency: "URGENT" },
    evidenceState: "OBSERVED",
  });
  return run.executionId;
}

describeSibyl("Sibyl-backed experiential provider continuity", () => {
  it("accumulates two prior executions into relationship memory that changes a fresh-session provider decision", async () => {
    const sourceRuntime = new EngramRuntime(new SibylRuntimeStore(), DEFAULT_RUNTIME_POLICIES);
    const first = await recordAtlasBreach(sourceRuntime, 1);
    const second = await recordAtlasBreach(sourceRuntime, 2);

    const admitting = await sourceRuntime.startExecution({
      agentId: "requester-agent",
      workflowType: "agent_provider_selection",
      intent: "consolidate repeated provider execution experience",
      context: { taskType: "data_fetch", providerId: "atlas", purpose: "relationship-state-update" },
      constraints: {},
      environmentVersion: "provider-market-v1",
    });

    const admitted = await sourceRuntime.complete({
      executionId: admitting.executionId,
      status: "PARTIAL",
      summary: "Two independent Atlas executions breached the urgent data-fetch SLA.",
      result: { providerId: "atlas", repeatedPattern: true },
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "REPEATED_PATTERN",
        summary: "Across two requester-owned executions, Atlas repeatedly breached urgent data-fetch SLAs. Guard urgent delegation and reduce prepayment authority on routine work.",
        evidenceState: "OBSERVED",
        confidence: 0.92,
        sourceExecutionIds: [first, second, admitting.executionId],
        details: {
          memoryPrimitive: "EXPERIENTIAL_RELATIONSHIP",
          taskType: "data_fetch",
          providerId: "atlas",
          relationshipPosture: "CONTEXT_GUARDED",
          failureType: "SLA_BREACH",
          breachCount: 2,
        },
      }],
    });
    expect(admitted.admittedMemories).toHaveLength(1);
    const memory = admitted.admittedMemories[0]!;

    const freshRuntime = new EngramRuntime(new SibylRuntimeStore(), DEFAULT_RUNTIME_POLICIES);
    const next = await freshRuntime.startExecution({
      agentId: "requester-agent",
      workflowType: "agent_provider_selection",
      intent: "obtain urgent data from an eligible provider",
      context: { taskType: "data_fetch", urgency: "URGENT" },
      constraints: { budgetUsd: 20, maxLatencySeconds: 30 },
      environmentVersion: "provider-market-v1",
    });

    const recalled = await freshRuntime.recall({
      executionId: next.executionId,
      query: "Atlas repeated urgent data fetch SLA breaches relationship",
    });
    expect(recalled.candidates.map((candidate) => candidate.memory.id)).toContain(memory.id);

    const baseline = decideProviderEngagement({ context: urgent, offers, memories: [] });
    expect(baseline.providerId).toBe("atlas");
    expect(executeProviderEngagement(baseline, urgent).status).toBe("FAILURE");

    const treatment = decideProviderEngagement({
      context: urgent,
      offers,
      memories: recalled.candidates.map((candidate) => ({ memory: candidate.memory, finalScore: candidate.score })),
    });
    expect(treatment.providerId).toBe("beacon");
    expect(treatment.memoryRefs).toContain(memory.id);
    expect(executeProviderEngagement(treatment, urgent).status).toBe("SUCCESS");

    await freshRuntime.recordDecision({
      executionId: next.executionId,
      decisionType: "PROVIDER_ENGAGEMENT",
      selectedAction: { providerId: treatment.providerId, terms: treatment.terms },
      alternatives: [{ providerId: baseline.providerId, terms: baseline.terms }],
      reasoningSummary: treatment.reason,
      influences: [{
        memoryId: memory.id,
        retrievalId: recalled.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "Accumulated provider experience changed urgent delegation from Atlas to Beacon.",
        counterfactual: {
          action: { providerId: baseline.providerId, terms: baseline.terms },
          source: "APPLICATION_DECLARED",
          evidenceState: "OBSERVED",
          explanation: "Without experiential relationship memory, the cheapest eligible provider is Atlas.",
        },
      }],
    });

    const trace = await freshRuntime.trace(next.executionId) as Record<string, unknown>;
    expect(trace.memoryBackend).toBe("sibyl-memory-client");
    expect(JSON.stringify(trace)).toContain("PROVIDER_ENGAGEMENT");
    expect(JSON.stringify(trace)).toContain("CHANGED_ACTION");
  }, 15_000);

  it("uses the same relationship memory to constrain terms rather than blacklist Atlas for routine work", async () => {
    const sourceRuntime = new EngramRuntime(new SibylRuntimeStore(), DEFAULT_RUNTIME_POLICIES);
    const first = await recordAtlasBreach(sourceRuntime, 1);
    const second = await recordAtlasBreach(sourceRuntime, 2);
    const admitting = await sourceRuntime.startExecution({
      agentId: "requester-agent",
      workflowType: "agent_provider_selection",
      intent: "consolidate repeated provider execution experience",
      context: { taskType: "data_fetch", providerId: "atlas" },
      constraints: {},
      environmentVersion: "provider-market-v1",
    });
    const admitted = await sourceRuntime.complete({
      executionId: admitting.executionId,
      status: "PARTIAL",
      summary: "Repeated Atlas SLA pattern established.",
      evidenceState: "OBSERVED",
      admissionSignals: [{
        kind: "REPEATED_PATTERN",
        summary: "Atlas repeatedly breached urgent data-fetch SLAs.",
        evidenceState: "OBSERVED",
        confidence: 0.92,
        sourceExecutionIds: [first, second, admitting.executionId],
        details: {
          memoryPrimitive: "EXPERIENTIAL_RELATIONSHIP",
          taskType: "data_fetch",
          providerId: "atlas",
          relationshipPosture: "CONTEXT_GUARDED",
          failureType: "SLA_BREACH",
          breachCount: 2,
        },
      }],
    });
    const memory = admitted.admittedMemories[0]!;

    const freshRuntime = new EngramRuntime(new SibylRuntimeStore(), DEFAULT_RUNTIME_POLICIES);
    const next = await freshRuntime.startExecution({
      agentId: "requester-agent",
      workflowType: "agent_provider_selection",
      intent: "obtain routine data",
      context: { taskType: "data_fetch", urgency: "ROUTINE" },
      constraints: { budgetUsd: 20, maxLatencySeconds: 30 },
      environmentVersion: "provider-market-v1",
    });
    const recalled = await freshRuntime.recall({
      executionId: next.executionId,
      query: "Atlas repeated data fetch SLA breaches relationship",
    });
    const routine: ProviderContinuityContext = { ...urgent, urgency: "ROUTINE" };
    const decision = decideProviderEngagement({
      context: routine,
      offers,
      memories: recalled.candidates.map((candidate) => ({ memory: candidate.memory, finalScore: candidate.score })),
    });

    expect(decision.providerId).toBe("atlas");
    expect(decision.memoryRefs).toContain(memory.id);
    expect(decision.terms).toMatchObject({ prepayBps: 1_000, requireMilestoneVerification: true });
  }, 15_000);
});
