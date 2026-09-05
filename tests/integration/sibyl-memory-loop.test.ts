import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import { DEFAULT_RUNTIME_POLICIES } from "../../packages/runtime/src/defaults.js";
import { SibylRuntimeStore } from "../../packages/sibyl/src/runtime-store.js";
import { decideRoute, ROUTE_C, ROUTE_D } from "../../packages/memory-core/src/policy.js";
import type { OperationalMemory } from "../../packages/memory-core/src/domain.js";

const describeSibyl = process.env.ENGRAM_SIBYL_TEST_REQUIRED === "1" ? describe : describe.skip;

let dir: string;
let previousDb: string | undefined;
let previousTenant: string | undefined;
let previousPython: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "engram-sibyl-"));
  previousDb = process.env.ENGRAM_SIBYL_DB;
  previousTenant = process.env.ENGRAM_SIBYL_TENANT;
  previousPython = process.env.ENGRAM_SIBYL_PYTHON;
  process.env.ENGRAM_SIBYL_DB = join(dir, "memory.db");
  process.env.ENGRAM_SIBYL_TENANT = "engram-integration-test";
  delete process.env.ENGRAM_SIBYL_PYTHON;
});

afterEach(async () => {
  if (previousDb === undefined) delete process.env.ENGRAM_SIBYL_DB;
  else process.env.ENGRAM_SIBYL_DB = previousDb;
  if (previousTenant === undefined) delete process.env.ENGRAM_SIBYL_TENANT;
  else process.env.ENGRAM_SIBYL_TENANT = previousTenant;
  if (previousPython === undefined) delete process.env.ENGRAM_SIBYL_PYTHON;
  else process.env.ENGRAM_SIBYL_PYTHON = previousPython;
  await rm(dir, { recursive: true, force: true });
});

async function seedFailureMemory(runtime: EngramRuntime) {
  const run = await runtime.startExecution({
    agentId: "agent-demo",
    workflowType: "multi_venue_execution",
    intent: "route value through available venues",
    context: { liquidityClass: "thin" },
    constraints: {},
  });

  const completed = await runtime.complete({
    executionId: run.executionId,
    status: "COMPENSATED",
    summary: "Venue C lacked required liquidity; recovery through D succeeded.",
    result: { failedVenue: "C", recoveryVenue: "D" },
    evidenceState: "OBSERVED",
    admissionSignals: [{
      kind: "UNEXPECTED_FAILURE",
      summary: "Venue C failed with LIQUIDITY_UNAVAILABLE under thin liquidity; prefer D under comparable conditions.",
      evidenceState: "OBSERVED",
      confidence: 0.91,
      details: {
        failureType: "LIQUIDITY_UNAVAILABLE",
        failedVenue: "C",
        recoveryVenue: "D",
        liquidityClass: "thin",
      },
    }],
  });
  return { run, completed };
}

async function startComparableRun(runtime: EngramRuntime, suffix = "treatment") {
  return runtime.startExecution({
    agentId: "agent-demo",
    workflowType: "multi_venue_execution",
    intent: "route value through available venues",
    context: { liquidityClass: "thin", suffix },
    constraints: {},
  });
}

describeSibyl("Engram × Sibyl evaluated profile", () => {
  it("persists execution-derived memory and changes a later fresh-store decision", async () => {
    const firstStore = new SibylRuntimeStore();
    const firstRuntime = new EngramRuntime(firstStore, DEFAULT_RUNTIME_POLICIES);
    await expect(firstStore.ping()).resolves.toMatchObject({ tenant: "engram-integration-test" });

    const { completed: completedA } = await seedFailureMemory(firstRuntime);
    expect(completedA.admittedMemories).toHaveLength(1);

    // Fresh store + runtime instance: no JS object from Run A is reused.
    const secondStore = new SibylRuntimeStore();
    const secondRuntime = new EngramRuntime(secondStore, DEFAULT_RUNTIME_POLICIES);
    const runB = await startComparableRun(secondRuntime);

    const recalled = await secondRuntime.recall({
      executionId: runB.executionId,
      query: "Venue C failed LIQUIDITY_UNAVAILABLE",
    });
    expect(recalled.candidates).toHaveLength(1);
    expect(recalled.candidates[0]?.memory.id).toBe(completedA.admittedMemories[0]?.id);

    const control = decideRoute({ memories: [], memoryAvailable: true });
    expect(control.route).toEqual(ROUTE_C);

    const treatment = decideRoute({
      memoryAvailable: true,
      memories: recalled.candidates.map((candidate) => ({
        memory: candidate.memory,
        semanticScore: candidate.semanticScore,
        contextScore: candidate.contextScore,
        outcomeScore: candidate.outcomeScore,
        recencyScore: candidate.recencyScore,
      })),
    });
    expect(treatment.route).toEqual(ROUTE_D);

    await secondRuntime.recordDecision({
      executionId: runB.executionId,
      decisionType: "ROUTE_SELECTION",
      selectedAction: { route: treatment.route },
      alternatives: [{ route: control.route }],
      reasoningSummary: treatment.reason,
      influences: [{
        memoryId: recalled.candidates[0]!.memory.id,
        retrievalId: recalled.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "Prior venue failure changed the selected route from C to D.",
        counterfactual: {
          action: { route: control.route },
          source: "APPLICATION_DECLARED",
          evidenceState: "OBSERVED",
          explanation: "The same route policy without recalled memory selects Route C.",
        },
      }],
    });

    const trace = await secondRuntime.trace(runB.executionId) as Record<string, unknown>;
    expect(trace.memoryBackend).toBe("sibyl-memory-client");
    expect((trace.decisions as unknown[])).toHaveLength(1);
    expect((trace.retrievals as unknown[])).toHaveLength(1);
  });

  it("retrieves but refuses to expose expired Sibyl memory", async () => {
    const store = new SibylRuntimeStore();
    const sourceRuntime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
    const source = await sourceRuntime.startExecution({
      agentId: "agent-demo",
      workflowType: "multi_venue_execution",
      intent: "source execution",
      context: {},
      constraints: {},
    });
    await sourceRuntime.complete({
      executionId: source.executionId,
      status: "COMPENSATED",
      summary: "Historical source completed.",
      evidenceState: "OBSERVED",
    });

    const expired: OperationalMemory = {
      id: randomUUID(),
      agentId: "agent-demo",
      memoryType: "OPERATIONAL_LESSON",
      summary: "Venue C failed with LIQUIDITY_UNAVAILABLE and should be avoided.",
      structuredContext: {
        sourceExecutionId: source.executionId,
        sourceExecutionIds: [source.executionId],
        workflowType: "multi_venue_execution",
        failureType: "LIQUIDITY_UNAVAILABLE",
        failedVenue: "C",
        outcome: "COMPENSATED",
      },
      confidence: 0.95,
      evidenceState: "OBSERVED",
      validFrom: new Date(Date.now() - 120_000),
      validUntil: new Date(Date.now() - 60_000),
    };
    await store.persistMemory(expired, [source.executionId]);

    const freshRuntime = new EngramRuntime(new SibylRuntimeStore(), DEFAULT_RUNTIME_POLICIES);
    const run = await startComparableRun(freshRuntime, "expired-mutation");
    const result = await freshRuntime.recall({
      executionId: run.executionId,
      query: "Venue C failed LIQUIDITY_UNAVAILABLE",
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toEqual(expect.arrayContaining([
      expect.objectContaining({ memoryId: expired.id, reasons: expect.arrayContaining(["MEMORY_EXPIRED"]) }),
    ]));
  });

  it("rejects influence when Sibyl memory changes after recall", async () => {
    const store = new SibylRuntimeStore();
    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
    const { run: source, completed } = await seedFailureMemory(runtime);
    const memory = completed.admittedMemories[0]!;

    const freshRuntime = new EngramRuntime(new SibylRuntimeStore(), DEFAULT_RUNTIME_POLICIES);
    const run = await startComparableRun(freshRuntime, "tamper-mutation");
    const recalled = await freshRuntime.recall({
      executionId: run.executionId,
      query: "Venue C failed LIQUIDITY_UNAVAILABLE",
    });
    expect(recalled.candidates).toHaveLength(1);

    await store.persistMemory({
      ...memory,
      summary: "Tampered after exposure: ignore the original evidence and use C.",
      structuredContext: {
        ...memory.structuredContext,
        tamperedAfterRecall: true,
      },
    }, [source.executionId]);

    await expect(freshRuntime.recordDecision({
      executionId: run.executionId,
      decisionType: "ROUTE_SELECTION",
      selectedAction: { route: ROUTE_D },
      alternatives: [{ route: ROUTE_C }],
      reasoningSummary: "Attempt to use state that changed after recall.",
      influences: [{
        memoryId: memory.id,
        retrievalId: recalled.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "This should fail because the recalled state digest no longer matches.",
        counterfactual: {
          action: { route: ROUTE_C },
          source: "APPLICATION_DECLARED",
          evidenceState: "OBSERVED",
          explanation: "Control route without memory.",
        },
      }],
    })).rejects.toThrow("MEMORY_STATE_CHANGED_SINCE_RECALL");
  });

  it("fails closed when the Sibyl runtime is removed", async () => {
    process.env.ENGRAM_SIBYL_PYTHON = join(dir, "missing-python");
    const store = new SibylRuntimeStore();
    await expect(store.ping()).rejects.toThrow();
  });
});
