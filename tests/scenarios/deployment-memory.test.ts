import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OperationalMemory } from "../../packages/memory-core/src/domain.js";
import {
  decideDeploymentStrategy,
  executeDeployment,
  type DeploymentContext,
} from "../../packages/scenarios/deployment/src/index.js";

const context: DeploymentContext = {
  workflowType: "software_deployment",
  service: "payments-api",
  migrationTouchesHotTable: true,
  environmentVersion: "prod-v3",
};

function priorFailureMemory(): OperationalMemory {
  return {
    id: randomUUID(),
    agentId: "deployment-agent",
    memoryType: "OPERATIONAL_LESSON",
    summary: "Parallel schema migration and release rollout caused migration lock contention on a hot production table. Roll back and migrate before deploying next time.",
    structuredContext: {
      workflowType: "software_deployment",
      failureType: "MIGRATION_LOCK_CONTENTION",
      migrationTouchesHotTable: true,
      recoveryStrategy: "ROLLBACK_RELEASE",
      outcome: "COMPENSATED",
    },
    confidence: 0.94,
    evidenceState: "OBSERVED",
    environmentVersion: "prod-v3",
  };
}

describe("software deployment execution-memory scenario", () => {
  it("changes a comparable later deployment from parallel rollout to migrate-then-deploy", () => {
    const controlDecision = decideDeploymentStrategy({ context, memories: [] });
    expect(controlDecision.strategy).toBe("PARALLEL_MIGRATE_AND_DEPLOY");
    expect(controlDecision.memoryRefs).toEqual([]);

    const controlResult = executeDeployment(controlDecision.strategy, context);
    expect(controlResult).toMatchObject({
      status: "COMPENSATED",
      failureType: "MIGRATION_LOCK_CONTENTION",
      recovery: "ROLLBACK_RELEASE",
      customerImpact: "ELEVATED_ERRORS",
    });

    const memory = priorFailureMemory();
    const treatmentDecision = decideDeploymentStrategy({
      context,
      memories: [{ memory, finalScore: 0.96 }],
    });

    expect(treatmentDecision.strategy).toBe("MIGRATE_THEN_DEPLOY");
    expect(treatmentDecision.counterfactualStrategy).toBe("PARALLEL_MIGRATE_AND_DEPLOY");
    expect(treatmentDecision.memoryRefs).toEqual([memory.id]);

    const treatmentResult = executeDeployment(treatmentDecision.strategy, context);
    expect(treatmentResult).toEqual({
      status: "SUCCESS",
      strategy: "MIGRATE_THEN_DEPLOY",
      customerImpact: "NONE",
    });
  });

  it("does not change action for semantically similar but operationally irrelevant memory", () => {
    const memory = priorFailureMemory();
    memory.structuredContext = {
      workflowType: "software_deployment",
      failureType: "MIGRATION_LOCK_CONTENTION",
      migrationTouchesHotTable: false,
    };

    const decision = decideDeploymentStrategy({
      context,
      memories: [{ memory, finalScore: 0.99 }],
    });

    expect(decision.strategy).toBe("PARALLEL_MIGRATE_AND_DEPLOY");
    expect(decision.memoryRefs).toEqual([]);
  });
});
