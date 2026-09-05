import { SibylRuntimeStore } from "../packages/sibyl/src/runtime-store.js";
import { EngramRuntime } from "../packages/runtime/src/runtime.js";
import { DEFAULT_RUNTIME_POLICIES } from "../packages/runtime/src/defaults.js";
import { decideRoute } from "../packages/memory-core/src/policy.js";

const command = process.argv[2];

function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function seed(): Promise<void> {
  const store = new SibylRuntimeStore();
  const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
  const backend = await store.ping();

  const run = await runtime.startExecution({
    agentId: "agent-demo",
    workflowType: "multi_venue_execution",
    intent: "route value through available venues",
    context: { liquidityClass: "thin", demoPhase: "seed" },
    constraints: {},
  });

  const completed = await runtime.complete({
    executionId: run.executionId,
    status: "COMPENSATED",
    summary: "Venue C lacked required liquidity; recovery through D succeeded.",
    result: { baselineRoute: ["A", "B", "C"], failedVenue: "C", recoveryVenue: "D" },
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

  emit({
    phase: "seed",
    backend: "sibyl-memory-client",
    sibyl: backend,
    executionId: run.executionId,
    admittedMemoryIds: completed.admittedMemories.map((memory) => memory.id),
    instruction: "Terminate this process. Run `npm run demo:sibyl:recall` in a new process against the same ENGRAM_SIBYL_DB and tenant.",
  });
}

async function recall(): Promise<void> {
  const store = new SibylRuntimeStore();
  const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
  const backend = await store.ping();

  const run = await runtime.startExecution({
    agentId: "agent-demo",
    workflowType: "multi_venue_execution",
    intent: "route value through available venues",
    context: { liquidityClass: "thin", demoPhase: "fresh-recall" },
    constraints: {},
  });

  const recalled = await runtime.recall({
    executionId: run.executionId,
    query: "Venue C failed LIQUIDITY_UNAVAILABLE",
  });

  const control = decideRoute({ memories: [], memoryAvailable: true });
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

  if (recalled.candidates[0] && treatment.memoryRefs.length) {
    await runtime.recordDecision({
      executionId: run.executionId,
      decisionType: "ROUTE_SELECTION",
      selectedAction: { route: treatment.route },
      alternatives: [{ route: control.route }],
      reasoningSummary: treatment.reason,
      influences: [{
        memoryId: recalled.candidates[0].memory.id,
        retrievalId: recalled.recall.id,
        influenceType: "CHANGED_ACTION",
        summary: "A persisted prior execution changed route selection from C to D.",
        counterfactual: {
          action: { route: control.route },
          source: "APPLICATION_DECLARED",
          evidenceState: "OBSERVED",
          explanation: "The same route policy without recalled memory selects Route C.",
        },
      }],
    });
  }

  emit({
    phase: "fresh-recall",
    backend: "sibyl-memory-client",
    sibyl: backend,
    executionId: run.executionId,
    retrievalId: recalled.recall.id,
    recalledMemoryIds: recalled.candidates.map((candidate) => candidate.memory.id),
    controlRoute: control.route,
    memoryConditionedRoute: treatment.route,
    changedAction: JSON.stringify(control.route) !== JSON.stringify(treatment.route),
    trace: await runtime.trace(run.executionId),
  });
}

async function noMemoryControl(): Promise<void> {
  const decision = decideRoute({ memories: [], memoryAvailable: false });
  emit({
    phase: "no-memory-control",
    memoryAvailable: false,
    route: decision.route,
    memoryRefs: decision.memoryRefs,
    reason: decision.reason,
  });
}

async function deletionMutation(): Promise<void> {
  const previous = process.env.ENGRAM_SIBYL_PYTHON;
  process.env.ENGRAM_SIBYL_PYTHON = process.env.ENGRAM_SIBYL_MISSING_PYTHON ?? "/definitely-missing-sibyl-python";
  let deletionObserved = false;
  let observedError = "";
  try {
    const store = new SibylRuntimeStore();
    await store.ping();
  } catch (error) {
    deletionObserved = true;
    observedError = error instanceof Error ? error.message : String(error);
  } finally {
    if (previous === undefined) delete process.env.ENGRAM_SIBYL_PYTHON;
    else process.env.ENGRAM_SIBYL_PYTHON = previous;
  }

  if (!deletionObserved) {
    throw new Error("DELETION_MUTATION_FAILED: Sibyl unexpectedly remained available");
  }

  emit({
    phase: "sibyl-deletion-mutation",
    degraded: true,
    fallbackAvailable: false,
    error: observedError,
  });
}

switch (command) {
  case "seed":
    await seed();
    break;
  case "recall":
    await recall();
    break;
  case "control":
    await noMemoryControl();
    break;
  case "deletion":
    await deletionMutation();
    break;
  default:
    throw new Error("Usage: tsx scripts/sibyl-demo.ts <seed|recall|control|deletion>");
}
