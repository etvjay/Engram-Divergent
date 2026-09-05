import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OperationalMemory } from "../../packages/memory-core/src/domain.js";
import {
  decideMaintenanceStrategy,
  type MaintenanceContext,
} from "../../packages/scenarios/operator-safety/src/index.js";

const context: MaintenanceContext = {
  workflowType: "production_maintenance",
  resourceType: "DATABASE_INDEX",
  trafficClass: "PEAK",
  environmentVersion: "prod-v6",
};

function correctionMemory(): OperationalMemory {
  return {
    id: randomUUID(),
    agentId: "maintenance-agent",
    memoryType: "OPERATIONAL_LESSON",
    summary: "A human operator rejected an immediate blocking index rebuild during peak traffic and required an online staged rebuild instead.",
    structuredContext: {
      workflowType: "production_maintenance",
      correctionType: "HUMAN_CORRECTION",
      resourceType: "DATABASE_INDEX",
      trafficClass: "PEAK",
      rejectedStrategy: "IMMEDIATE_BLOCKING_REBUILD",
      correctedStrategy: "ONLINE_STAGED_REBUILD",
    },
    confidence: 0.98,
    evidenceState: "OBSERVED",
    environmentVersion: "prod-v6",
  };
}

describe("human-correction execution-memory scenario", () => {
  it("changes a comparable later proposal to the previously corrected strategy", () => {
    const baseline = decideMaintenanceStrategy({ context, memories: [] });
    expect(baseline.strategy).toBe("IMMEDIATE_BLOCKING_REBUILD");
    expect(baseline.memoryRefs).toEqual([]);

    const memory = correctionMemory();
    const treatment = decideMaintenanceStrategy({
      context,
      memories: [{ memory, finalScore: 0.99 }],
    });

    expect(treatment.strategy).toBe("ONLINE_STAGED_REBUILD");
    expect(treatment.counterfactualStrategy).toBe("IMMEDIATE_BLOCKING_REBUILD");
    expect(treatment.memoryRefs).toEqual([memory.id]);
  });

  it("does not overgeneralize a peak-traffic correction to off-peak maintenance", () => {
    const decision = decideMaintenanceStrategy({
      context: { ...context, trafficClass: "OFF_PEAK" },
      memories: [{ memory: correctionMemory(), finalScore: 0.99 }],
    });

    expect(decision.strategy).toBe("IMMEDIATE_BLOCKING_REBUILD");
    expect(decision.memoryRefs).toEqual([]);
  });

  it("does not overgeneralize a database-index correction to another resource class", () => {
    const decision = decideMaintenanceStrategy({
      context: { ...context, resourceType: "OTHER" },
      memories: [{ memory: correctionMemory(), finalScore: 0.99 }],
    });

    expect(decision.strategy).toBe("IMMEDIATE_BLOCKING_REBUILD");
    expect(decision.memoryRefs).toEqual([]);
  });
});
