import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { decideRoute, ROUTE_C, ROUTE_D } from "../../packages/memory-core/src/policy.js";
import { executeRoute } from "../../packages/execution-simulator/src/index.js";
import type { OperationalMemory } from "../../packages/memory-core/src/domain.js";

const thinLiquidity = {
  liquidity: { A: 100, B: 100, C: 20, D: 100 },
  requiredLiquidity: 50,
};

describe("Engram memory-caused behavioral change", () => {
  it("changes Route C to Route D when a prior comparable failure is recalled", () => {
    const controlDecision = decideRoute({ memories: [], memoryAvailable: true });
    expect(controlDecision.route).toEqual(ROUTE_C);

    const runOne = executeRoute(controlDecision.route, thinLiquidity);
    expect(runOne.status).toBe("COMPENSATED");
    expect(runOne.failedVenue).toBe("C");

    const memory: OperationalMemory = {
      id: randomUUID(),
      agentId: "agent-demo",
      memoryType: "OPERATIONAL_LESSON",
      summary: "Venue C failed under comparable thin-liquidity conditions; avoid it or revalidate liquidity before prior commitments.",
      structuredContext: {
        workflowType: "multi_venue_execution",
        failureType: "LIQUIDITY_UNAVAILABLE",
        failedVenue: "C",
        outcome: "COMPENSATED",
      },
      confidence: 0.91,
      evidenceState: "SIMULATED",
    };

    const treatmentDecision = decideRoute({
      memoryAvailable: true,
      memories: [{ memory, semanticScore: 0.95, contextScore: 1, outcomeScore: 1, recencyScore: 1 }],
    });

    expect(treatmentDecision.route).toEqual(ROUTE_D);
    expect(treatmentDecision.counterfactualRoute).toEqual(ROUTE_C);
    expect(treatmentDecision.memoryRefs).toEqual([memory.id]);

    const runTwo = executeRoute(treatmentDecision.route, thinLiquidity);
    expect(runTwo.status).toBe("SUCCESS");
  });

  it("does not falsely claim memory use when memory is unavailable", () => {
    const decision = decideRoute({ memories: [], memoryAvailable: false });
    expect(decision.memoryRefs).toEqual([]);
    expect(decision.route).toEqual(ROUTE_C);
    expect(decision.reason).toContain("Memory is unavailable");
  });
});
