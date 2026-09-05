import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OperationalMemory } from "../../packages/memory-core/src/domain.js";
import {
  decideRecoveryStrategy,
  executeRecovery,
  type IncidentContext,
} from "../../packages/scenarios/incident-response/src/index.js";

const context: IncidentContext = {
  workflowType: "incident_response",
  service: "checkout",
  failureMode: "SATURATED_DEPENDENCY",
  fleetSize: "LARGE",
  environmentVersion: "prod-v5",
};

function priorRecoveryMemory(): OperationalMemory {
  return {
    id: randomUUID(),
    agentId: "incident-agent",
    memoryType: "OPERATIONAL_LESSON",
    summary: "Restarting the full checkout fleet while its database dependency was saturated caused a thundering herd and prolonged recovery; isolate traffic, drain, then restart in stages.",
    structuredContext: {
      workflowType: "incident_response",
      failureMode: "SATURATED_DEPENDENCY",
      recoveryStrategy: "RESTART_ALL",
      secondaryFailure: "THUNDERING_HERD",
      fleetSize: "LARGE",
      outcome: "PARTIAL",
    },
    confidence: 0.95,
    evidenceState: "OBSERVED",
    environmentVersion: "prod-v5",
  };
}

describe("incident-response execution-memory scenario", () => {
  it("changes repeated recovery from restart-all to isolate/drain/staged restart", () => {
    const controlDecision = decideRecoveryStrategy({ context, memories: [] });
    expect(controlDecision.strategy).toBe("RESTART_ALL");

    const controlResult = executeRecovery(controlDecision.strategy, context);
    expect(controlResult).toEqual({
      status: "PARTIAL",
      strategy: "RESTART_ALL",
      secondaryFailure: "THUNDERING_HERD",
      timeToRecoveryMinutes: 24,
      customerImpact: "PROLONGED",
    });

    const memory = priorRecoveryMemory();
    const treatmentDecision = decideRecoveryStrategy({
      context,
      memories: [{ memory, finalScore: 0.98 }],
    });

    expect(treatmentDecision.strategy).toBe("ISOLATE_DRAIN_STAGED_RESTART");
    expect(treatmentDecision.counterfactualStrategy).toBe("RESTART_ALL");
    expect(treatmentDecision.memoryRefs).toEqual([memory.id]);

    expect(executeRecovery(treatmentDecision.strategy, context)).toEqual({
      status: "SUCCESS",
      strategy: "ISOLATE_DRAIN_STAGED_RESTART",
      timeToRecoveryMinutes: 9,
      customerImpact: "CONTAINED",
    });
  });

  it("does not overgeneralize a large-fleet recovery lesson to a small fleet", () => {
    const memory = priorRecoveryMemory();
    const smallFleet: IncidentContext = { ...context, fleetSize: "SMALL" };

    const decision = decideRecoveryStrategy({
      context: smallFleet,
      memories: [{ memory, finalScore: 0.99 }],
    });

    expect(decision.strategy).toBe("RESTART_ALL");
    expect(decision.memoryRefs).toEqual([]);
  });

  it("does not let a different incident failure mode inherit the recovery constraint", () => {
    const memory = priorRecoveryMemory();
    const differentFailure: IncidentContext = { ...context, failureMode: "OTHER" };

    const decision = decideRecoveryStrategy({
      context: differentFailure,
      memories: [{ memory, finalScore: 0.99 }],
    });

    expect(decision.strategy).toBe("RESTART_ALL");
    expect(decision.memoryRefs).toEqual([]);
  });
});
