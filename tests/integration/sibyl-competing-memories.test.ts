import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MemoryRelationship } from "../../packages/evaluation/src/domain.js";
import { RelationshipMemoryEligibilityAdvisor } from "../../packages/evaluation/src/eligibility-advisor.js";
import type { OperationalMemory } from "../../packages/memory-core/src/domain.js";
import { DEFAULT_RUNTIME_POLICIES } from "../../packages/runtime/src/defaults.js";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import { SibylRuntimeStore } from "../../packages/sibyl/src/runtime-store.js";

const describeSibyl = process.env.ENGRAM_SIBYL_TEST_REQUIRED === "1" ? describe : describe.skip;

let dir: string;
let previousDb: string | undefined;
let previousTenant: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "engram-sibyl-conflict-"));
  previousDb = process.env.ENGRAM_SIBYL_DB;
  previousTenant = process.env.ENGRAM_SIBYL_TENANT;
  process.env.ENGRAM_SIBYL_DB = join(dir, "memory.db");
  process.env.ENGRAM_SIBYL_TENANT = "engram-conflict-test";
});

afterEach(async () => {
  if (previousDb === undefined) delete process.env.ENGRAM_SIBYL_DB;
  else process.env.ENGRAM_SIBYL_DB = previousDb;
  if (previousTenant === undefined) delete process.env.ENGRAM_SIBYL_TENANT;
  else process.env.ENGRAM_SIBYL_TENANT = previousTenant;
  await rm(dir, { recursive: true, force: true });
});

class RelationshipStore {
  relationships: MemoryRelationship[] = [];

  async listRelationships(memoryId: string): Promise<MemoryRelationship[]> {
    return this.relationships.filter((relationship) =>
      relationship.leftMemoryId === memoryId || relationship.rightMemoryId === memoryId,
    );
  }
}

function relationship(
  leftMemoryId: string,
  rightMemoryId: string,
  relation: MemoryRelationship["relation"],
): MemoryRelationship {
  return {
    id: randomUUID(),
    leftMemoryId,
    rightMemoryId,
    relation,
    rationale: `${relation} is explicit evaluation evidence`,
    evidenceState: "OBSERVED",
    method: "HUMAN_ASSESSMENT",
    assessedAt: new Date(),
  };
}

function memory(id: string, sourceExecutionId: string, summary: string): OperationalMemory {
  return {
    id,
    agentId: "agent-conflict",
    memoryType: "OPERATIONAL_LESSON",
    summary,
    structuredContext: {
      workflowType: "deployment",
      sourceExecutionId,
      sourceExecutionIds: [sourceExecutionId],
      outcome: "COMPENSATED",
    },
    confidence: 0.93,
    evidenceState: "OBSERVED",
    validFrom: new Date(Date.now() - 1_000),
    environmentVersion: "prod-v1",
    toolVersion: "1.4.0",
  };
}

async function sourceExecution(store: SibylRuntimeStore) {
  const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
  const run = await runtime.startExecution({
    agentId: "agent-conflict",
    workflowType: "deployment",
    intent: "produce conflict evidence",
    context: {},
    constraints: {},
    environmentVersion: "prod-v1",
    toolVersion: "1.4.0",
  });
  await runtime.complete({
    executionId: run.executionId,
    status: "COMPENSATED",
    summary: "Source execution retained for provenance.",
    evidenceState: "OBSERVED",
  });
  return run.executionId;
}

async function start(runtime: EngramRuntime) {
  return runtime.startExecution({
    agentId: "agent-conflict",
    workflowType: "deployment",
    intent: "Deploy service",
    context: {},
    constraints: {},
    environmentVersion: "prod-v1",
    toolVersion: "1.4.0",
  });
}

describeSibyl("Sibyl competing memory semantics", () => {
  it("keeps contradictory memories recall-visible but rejects influence until explicit supersession", async () => {
    const seedStore = new SibylRuntimeStore();
    const sourceA = await sourceExecution(seedStore);
    const sourceB = await sourceExecution(seedStore);
    const memoryA = memory(randomUUID(), sourceA, "Use dependency alpha during production deployment.");
    const memoryB = memory(randomUUID(), sourceB, "Avoid dependency alpha during production deployment.");
    await seedStore.persistMemory(memoryA, [sourceA]);
    await seedStore.persistMemory(memoryB, [sourceB]);

    const relationships = new RelationshipStore();
    relationships.relationships = [relationship(memoryA.id, memoryB.id, "CONTRADICTS")];
    const advisor = new RelationshipMemoryEligibilityAdvisor(relationships, {
      unresolvedContradictionStages: ["INFLUENCE"],
    });

    // Fresh store/runtime proves the memories themselves are coming back through Sibyl.
    const runtime = new EngramRuntime(new SibylRuntimeStore(), DEFAULT_RUNTIME_POLICIES, undefined, advisor);
    const run = await start(runtime);
    const recalled = await runtime.recall({
      executionId: run.executionId,
      query: "dependency alpha production deployment",
    });

    expect(recalled.candidates.map((candidate) => candidate.memory.id).sort()).toEqual(
      [memoryA.id, memoryB.id].sort(),
    );

    await expect(runtime.recordDecision({
      executionId: run.executionId,
      decisionType: "DEPENDENCY_SELECTION",
      selectedAction: { dependency: "alpha" },
      reasoningSummary: "Attempt to act on one side of unresolved contradictory Sibyl memory.",
      influences: [{
        memoryId: memoryA.id,
        retrievalId: recalled.recall.id,
        influenceType: "SUPPORTED_ACTION",
        summary: "Memory A supports dependency alpha.",
      }],
    })).rejects.toThrow("UNRESOLVED_MEMORY_CONTRADICTION");

    const rejectedTrace = await runtime.trace(run.executionId) as Record<string, unknown>;
    expect((rejectedTrace.decisions as unknown[])).toHaveLength(0);

    relationships.relationships.push(relationship(memoryB.id, memoryA.id, "SUPERSEDES"));
    const resolvedRun = await start(runtime);
    const resolvedRecall = await runtime.recall({
      executionId: resolvedRun.executionId,
      query: "dependency alpha production deployment",
    });

    await expect(runtime.recordDecision({
      executionId: resolvedRun.executionId,
      decisionType: "DEPENDENCY_SELECTION",
      selectedAction: { dependency: "beta" },
      reasoningSummary: "Explicit supersession resolves the prior contradiction for Memory B.",
      influences: [{
        memoryId: memoryB.id,
        retrievalId: resolvedRecall.recall.id,
        influenceType: "SUPPORTED_ACTION",
        summary: "Memory B is eligible after explicit supersession evidence.",
      }],
    })).resolves.toMatchObject({ executionId: resolvedRun.executionId });
  }, 20_000);
});
