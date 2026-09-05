import { randomUUID } from "node:crypto";
import type { MemoryRepository, Outcome } from "../../../packages/memory-core/src/domain.js";
import { admitOperationalMemory } from "../../../packages/memory-core/src/admission.js";
import { decideRoute, ROUTE_C } from "../../../packages/memory-core/src/policy.js";
import { executeRoute } from "../../../packages/execution-simulator/src/index.js";

const DEMO_CONTEXT = {
  liquidity: { A: 100, B: 100, C: 20, D: 100 },
  requiredLiquidity: 50,
} as const;

const DEFAULT_AGENT_ID = "engram-demo-agent";
const WORKFLOW_TYPE = "multi_venue_execution";
const ENVIRONMENT_VERSION = "demo-v1";
const POLICY_VERSION = "route-policy-v1";

export type RunEngramDemoOptions = {
  agentId?: string;
};

async function appendSimulationEvents(
  repo: MemoryRepository,
  executionId: string,
  result: ReturnType<typeof executeRoute>,
): Promise<void> {
  let sequenceNo = 0;
  await repo.appendEvent({
    id: randomUUID(),
    executionId,
    sequenceNo: sequenceNo++,
    eventType: "EXECUTION_STARTED",
    payload: { route: result.route },
    evidenceState: "SIMULATED",
    occurredAt: new Date(),
  });

  for (const step of result.steps) {
    await repo.appendEvent({
      id: randomUUID(),
      executionId,
      sequenceNo: sequenceNo++,
      eventType: step.status === "SUCCESS" ? "STEP_COMPLETED" : "STEP_FAILED",
      payload: { venue: step.venue, status: step.status, reason: step.reason },
      evidenceState: "SIMULATED",
      occurredAt: new Date(),
    });
  }

  if (result.recovery) {
    await repo.appendEvent({
      id: randomUUID(),
      executionId,
      sequenceNo: sequenceNo++,
      eventType: "RECOVERY_COMPLETED",
      payload: result.recovery,
      evidenceState: "SIMULATED",
      occurredAt: new Date(),
    });
  }
}

/**
 * Runs the complete hackathon proof against the supplied durable repository.
 * External venue behavior is explicitly SIMULATED; persistence, retrieval,
 * provenance and decision influence are real repository operations.
 */
export async function runEngramDemo(repo: MemoryRepository, options: RunEngramDemoOptions = {}) {
  const agentId = options.agentId?.trim() || DEFAULT_AGENT_ID;

  const runA = await repo.startExecution({
    agentId,
    workflowType: WORKFLOW_TYPE,
    intent: "Acquire the target asset using the lowest-risk available route",
    context: { market: "demo", liquidityRegime: "thin" },
    constraints: { riskTolerance: "LOW", allowedVenues: ["A", "B", "C", "D"] },
    environmentVersion: ENVIRONMENT_VERSION,
    policyVersion: POLICY_VERSION,
  });

  const controlDecision = decideRoute({ memories: [], memoryAvailable: true });
  await repo.recordDecision({
    id: randomUUID(),
    executionId: runA.executionId,
    decisionType: "ROUTE_SELECTION",
    selectedAction: { route: controlDecision.route },
    alternatives: [{ route: ["A", "B", "D"] }],
    reasoningSummary: controlDecision.reason,
    memoryRefs: [],
    memoryInfluences: [],
  });

  const resultA = executeRoute(controlDecision.route, DEMO_CONTEXT);
  await appendSimulationEvents(repo, runA.executionId, resultA);

  const outcomeA: Outcome = {
    id: randomUUID(),
    executionId: runA.executionId,
    status: resultA.status,
    failureType: resultA.failedVenue ? "LIQUIDITY_UNAVAILABLE" : undefined,
    summary: resultA.status === "COMPENSATED"
      ? "Route C failed at Venue C and the preceding exposure was unwound."
      : "The baseline route completed successfully.",
    result: { route: resultA.route, failedVenue: resultA.failedVenue, recovery: resultA.recovery },
    evidenceState: "SIMULATED",
  };
  await repo.recordOutcome(outcomeA);

  const memory = admitOperationalMemory({
    agentId,
    executionId: runA.executionId,
    workflowType: WORKFLOW_TYPE,
    environmentVersion: ENVIRONMENT_VERSION,
    policyVersion: POLICY_VERSION,
    outcome: outcomeA,
    observation: {
      failedResource: resultA.failedVenue,
      failureType: outcomeA.failureType,
      recoveryStrategy: resultA.recovery?.strategy,
      recoverySucceeded: resultA.recovery?.capitalRecovered ?? false,
    },
  });
  if (!memory) throw new Error("Demo Run A did not produce an admissible operational memory");
  await repo.persistMemory(memory, [runA.executionId]);

  const runB = await repo.startExecution({
    agentId,
    workflowType: WORKFLOW_TYPE,
    intent: "Acquire the target asset using the lowest-risk available route",
    context: { market: "demo", liquidityRegime: "thin" },
    constraints: { riskTolerance: "LOW", allowedVenues: ["A", "B", "C", "D"] },
    environmentVersion: ENVIRONMENT_VERSION,
    policyVersion: POLICY_VERSION,
  });

  let retrieval;
  try {
    retrieval = await repo.searchMemory({
      agentId,
      executionId: runB.executionId,
      query: "multi venue acquisition under thin liquidity where Venue C may fail",
      workflowType: WORKFLOW_TYPE,
      environmentVersion: ENVIRONMENT_VERSION,
      status: ["COMPENSATED", "FAILURE", "PARTIAL"],
      retrievalPolicyVersion: "engram-hybrid-v1",
      limit: 8,
    });
  } catch (error) {
    await repo.appendEvent({
      id: randomUUID(),
      executionId: runB.executionId,
      sequenceNo: 0,
      eventType: "MEMORY_UNAVAILABLE",
      payload: { message: error instanceof Error ? error.message : "Unknown memory retrieval error" },
      evidenceState: "OBSERVED",
      occurredAt: new Date(),
    });
    throw error;
  }

  const routeDecision = decideRoute({
    memoryAvailable: true,
    memories: retrieval.candidates.map((candidate) => ({
      memory: candidate.memory,
      semanticScore: candidate.semanticScore,
      contextScore: candidate.contextScore,
      outcomeScore: candidate.outcomeScore,
      recencyScore: candidate.recencyScore,
    })),
  });

  const influential = retrieval.candidates.find((candidate) => routeDecision.memoryRefs.includes(candidate.memory.id));
  await repo.recordDecision({
    id: randomUUID(),
    executionId: runB.executionId,
    decisionType: "ROUTE_SELECTION",
    selectedAction: { route: routeDecision.route },
    alternatives: [{ route: ROUTE_C }],
    reasoningSummary: routeDecision.reason,
    memoryRefs: routeDecision.memoryRefs,
    memoryInfluences: influential ? [{
      memoryId: influential.memory.id,
      influenceType: "CHANGED_ACTION",
      influenceSummary: "The prior compensated Venue C failure replaced the baseline Route C with Route D.",
      relevance: influential.finalScore,
      counterfactualAction: { route: ROUTE_C },
    }] : [],
  }, retrieval.retrievalId);

  const resultB = executeRoute(routeDecision.route, DEMO_CONTEXT);
  await appendSimulationEvents(repo, runB.executionId, resultB);
  await repo.recordOutcome({
    id: randomUUID(),
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
    },
    runA: { executionId: runA.executionId, route: controlDecision.route, outcome: resultA.status },
    memory: { id: memory.id, summary: memory.summary, sourceExecutionId: runA.executionId },
    runB: {
      executionId: runB.executionId,
      retrievalId: retrieval.retrievalId,
      route: routeDecision.route,
      counterfactualRoute: routeDecision.counterfactualRoute,
      memoryRefs: routeDecision.memoryRefs,
      outcome: resultB.status,
    },
    changedBehavior: JSON.stringify(controlDecision.route) !== JSON.stringify(routeDecision.route),
  };
}
