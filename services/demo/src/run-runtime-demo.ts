import { randomUUID } from "node:crypto";
import { decideRoute, ROUTE_C } from "../../../packages/memory-core/src/policy.js";
import { executeRoute } from "../../../packages/execution-simulator/src/index.js";
import type { EngramRuntime } from "../../../packages/runtime/src/runtime.js";

const DEMO_CONTEXT = {
  liquidity: { A: 100, B: 100, C: 20, D: 100 },
  requiredLiquidity: 50,
} as const;

const WORKFLOW_TYPE = "multi_venue_execution";
const ENVIRONMENT_VERSION = "demo-v1";
const TOOL_VERSION = "execution-simulator-v1";
const AGENT_POLICY_VERSION = "route-policy-v1";

export type RuntimeDemoOptions = {
  agentId?: string;
  /**
   * Optional verification hook invoked after Run B recall has been persisted but
   * before the influenced decision is recorded. Supplying a fresh runtime proves
   * that recall-to-influence authority survives process/runtime reconstruction.
   */
  reconstructRuntimeAfterRecall?: (input: {
    agentId: string;
    executionId: string;
    retrievalId: string;
  }) => EngramRuntime | Promise<EngramRuntime>;
};

async function observeSimulation(runtime: EngramRuntime, executionId: string, result: ReturnType<typeof executeRoute>) {
  await runtime.observe({
    executionId,
    type: "EXECUTION_STARTED",
    payload: { route: result.route },
    evidenceState: "SIMULATED",
  });

  for (const step of result.steps) {
    await runtime.observe({
      executionId,
      type: step.status === "SUCCESS" ? "STEP_COMPLETED" : "STEP_FAILED",
      payload: { venue: step.venue, status: step.status, reason: step.reason },
      evidenceState: "SIMULATED",
    });
  }

  if (result.recovery) {
    await runtime.observe({
      executionId,
      type: "RECOVERY_COMPLETED",
      payload: result.recovery,
      evidenceState: "SIMULATED",
    });
  }
}

export async function runEngramRuntimeDemo(
  runtime: EngramRuntime,
  options: RuntimeDemoOptions = {},
) {
  const agentId = options.agentId ?? `engram-demo-agent-${randomUUID()}`;

  const runA = await runtime.startExecution({
    agentId,
    workflowType: WORKFLOW_TYPE,
    intent: "Acquire the target asset using the lowest-risk available route",
    context: { market: "demo", liquidityRegime: "thin" },
    constraints: { riskTolerance: "LOW", allowedVenues: ["A", "B", "C", "D"] },
    environmentVersion: ENVIRONMENT_VERSION,
    toolVersion: TOOL_VERSION,
    policyVersion: AGENT_POLICY_VERSION,
  });

  const baseline = decideRoute({ memories: [], memoryAvailable: true });
  await runtime.recordDecision({
    executionId: runA.executionId,
    decisionType: "ROUTE_SELECTION",
    selectedAction: { route: baseline.route },
    alternatives: [{ route: ["A", "B", "D"] }],
    reasoningSummary: baseline.reason,
  });

  const resultA = executeRoute(baseline.route, DEMO_CONTEXT);
  await observeSimulation(runtime, runA.executionId, resultA);

  const completedA = await runtime.complete({
    executionId: runA.executionId,
    status: resultA.status,
    failureType: resultA.failedVenue ? "LIQUIDITY_UNAVAILABLE" : undefined,
    summary: resultA.status === "COMPENSATED"
      ? "Route C failed at Venue C and the preceding exposure was unwound."
      : "The baseline route completed successfully.",
    result: { route: resultA.route, failedVenue: resultA.failedVenue, recovery: resultA.recovery },
    evidenceState: "SIMULATED",
    admissionSignals: resultA.failedVenue ? [{
      kind: "UNEXPECTED_FAILURE",
      summary: "Venue C lacked sufficient liquidity during a comparable thin-liquidity execution; avoid depending on C when alternatives exist.",
      evidenceState: "SIMULATED",
      confidence: 0.82,
      details: {
        failureType: "LIQUIDITY_UNAVAILABLE",
        failedVenue: resultA.failedVenue,
        failedResource: resultA.failedVenue,
        recoveryStrategy: resultA.recovery?.strategy,
        recoverySucceeded: resultA.recovery?.capitalRecovered ?? false,
      },
    }] : [],
  });

  const memory = completedA.admittedMemories[0];
  if (!memory) throw new Error("Demo Run A did not produce an admissible operational memory");

  const runB = await runtime.startExecution({
    agentId,
    workflowType: WORKFLOW_TYPE,
    intent: "Acquire the target asset using the lowest-risk available route",
    context: { market: "demo", liquidityRegime: "thin" },
    constraints: { riskTolerance: "LOW", allowedVenues: ["A", "B", "C", "D"] },
    environmentVersion: ENVIRONMENT_VERSION,
    toolVersion: TOOL_VERSION,
    policyVersion: AGENT_POLICY_VERSION,
  });

  const recall = await runtime.recall({
    executionId: runB.executionId,
    query: "multi venue acquisition under thin liquidity where Venue C may fail",
    status: ["COMPENSATED", "FAILURE", "PARTIAL"],
  });

  const routeDecision = decideRoute({
    memoryAvailable: true,
    memories: recall.candidates.map((candidate) => ({
      memory: candidate.memory,
      semanticScore: candidate.semanticScore,
      contextScore: candidate.contextScore,
      outcomeScore: candidate.outcomeScore,
      recencyScore: candidate.recencyScore,
    })),
  });

  let decisionRuntime = runtime;
  let runtimeReconstructedAfterRecall = false;
  if (options.reconstructRuntimeAfterRecall) {
    decisionRuntime = await options.reconstructRuntimeAfterRecall({
      agentId,
      executionId: runB.executionId,
      retrievalId: recall.recall.id,
    });
    runtimeReconstructedAfterRecall = true;
  }

  const influential = recall.candidates.find((candidate) => routeDecision.memoryRefs.includes(candidate.memory.id));
  await decisionRuntime.recordDecision({
    executionId: runB.executionId,
    decisionType: "ROUTE_SELECTION",
    selectedAction: { route: routeDecision.route },
    alternatives: [{ route: ROUTE_C }],
    reasoningSummary: routeDecision.reason,
    influences: influential ? [{
      memoryId: influential.memory.id,
      retrievalId: recall.recall.id,
      influenceType: "CHANGED_ACTION",
      summary: "The prior compensated Venue C failure replaced the baseline Route C with Route D.",
      relevance: influential.score,
      counterfactual: {
        action: { route: ROUTE_C },
        source: "CONTROL_RUN",
        evidenceState: "SIMULATED",
        explanation: "Run A records the same memory-free route policy selecting Route C under the controlled demo context.",
        comparisonExecutionId: runA.executionId,
      },
    }] : [],
  });

  const resultB = executeRoute(routeDecision.route, DEMO_CONTEXT);
  await observeSimulation(decisionRuntime, runB.executionId, resultB);
  await decisionRuntime.complete({
    executionId: runB.executionId,
    status: resultB.status,
    summary: resultB.status === "SUCCESS"
      ? "Route D completed after prior operational memory changed the route selection."
      : "The memory-influenced route did not complete successfully.",
    result: { route: resultB.route },
    evidenceState: "SIMULATED",
  });

  return {
    agentId,
    evidenceBoundary: {
      externalExecution: "SIMULATED",
      persistence: "REAL",
      retrieval: "REAL",
      decisionTrace: "REAL",
      runtimeReconstruction: runtimeReconstructedAfterRecall ? "REAL" : "NOT_REQUESTED",
    },
    runA: { executionId: runA.executionId, route: baseline.route, outcome: resultA.status },
    memory: { id: memory.id, summary: memory.summary, sourceExecutionId: runA.executionId },
    runB: {
      executionId: runB.executionId,
      retrievalId: recall.recall.id,
      route: routeDecision.route,
      counterfactualRoute: routeDecision.counterfactualRoute,
      memoryRefs: routeDecision.memoryRefs,
      outcome: resultB.status,
    },
    runtimeReconstructedAfterRecall,
    changedBehavior: JSON.stringify(baseline.route) !== JSON.stringify(routeDecision.route),
    trace: await decisionRuntime.trace(runB.executionId),
  };
}
