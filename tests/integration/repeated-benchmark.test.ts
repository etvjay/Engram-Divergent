import { describe, expect, it } from "vitest";
import { createDeterministicAdapter } from "../../packages/benchmark/src/adapters/deterministic.js";
import { createQwenAdapter } from "../../packages/benchmark/src/adapters/qwen.js";
import { baseProposal, type ModelAdapter, type ModelDecisionRequest } from "../../packages/benchmark/src/model-adapter.js";
import { loadBenchmarkScenario, scenarioCandidates } from "../../packages/benchmark/src/scenario.js";
import { runBenchmark, runRepeatedBenchmark } from "../../packages/benchmark/src/runner.js";

const scenario = loadBenchmarkScenario("benchmarks/scenarios/provider-urgent.json");
const UUID = "10000000-0000-4000-8000-000000000001";

function proposalFor(request: ModelDecisionRequest, provider: string, effects: string[] = []) {
  return baseProposal({
    request,
    model: "rejection-stub-v1",
    proposedAction: { provider },
    reasoningSummary: "test proposal",
    memorySliceIds: request.memory.slices[0] ? [request.memory.slices[0].id] : [],
    requestedEffects: effects,
  });
}

describe("benchmark methodology correction", () => {
  it("does not expose execution, slice, or grant UUIDs in the Qwen prompt", async () => {
    let prompt = "";
    const fetchImpl = (async (_url: unknown, init?: { body?: string }) => {
      prompt = init?.body ?? "";
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ proposedAction: { provider: "atlas" }, reasoningSummary: "ok", memorySliceIds: [], requestedEffects: [] }) } }],
      }), { status: 200 });
    }) as typeof fetch;
    const adapter = createQwenAdapter({ fetchImpl, baseUrl: "http://localhost:9/v1", model: "qwen-test" });
    const sliceId = UUID.replace("1", "2");
    const grantId = UUID.replace("1", "3");
    await adapter.propose({
      executionId: UUID,
      scenarioId: scenario.scenarioId,
      decisionType: scenario.taskFamily,
      mandate: scenario.constraints,
      candidates: scenarioCandidates(scenario).map(({ knownSlaBreachRisk: _, ...candidate }) => candidate),
      memory: {
        arm: "A2_ENGRAM",
        slices: [{ id: sliceId, executionMemoryIds: [UUID.replace("1", "4")], consumerAgentId: "agent", consumerExecutionId: UUID, purpose: "test", subject: "provider:atlas", claims: ["claim"], applicability: {}, evidenceRefs: [], confidence: 1, disclosureScope: [], redactedFields: [], derivedAt: new Date(), expiresAt: new Date(Date.now() + 10000) }],
        grants: [{ id: grantId, memorySliceId: sliceId, consumerAgentId: "agent", consumerExecutionId: UUID, allowedEffects: ["PROVIDER_SUBSTITUTION"], deniedEffects: [], constraints: {}, issuedAt: new Date(), expiresAt: new Date(Date.now() + 10000) }],
        eligibleGrantIds: [grantId],
      },
    });
    expect(prompt).not.toContain(UUID);
    expect(prompt).not.toContain(sliceId);
    expect(prompt).not.toContain(grantId);
    expect(prompt).not.toContain("RUN ");
    expect(prompt).toContain("SLICE-1");
    expect(prompt).toContain("GRANT-1");
  });

  it("rejects A3/A4 without a second model call and uses deterministic fallback", async () => {
    let calls = 0;
    const adapter: ModelAdapter = {
      model: "rejecting-stub-v1",
      modelConfigDigest: "rejecting-stub-config-v1",
      async propose(request) {
        calls += 1;
        const grant = request.memory.grants[0];
        return grant
          ? proposalFor(request, "beacon", [grant.allowedEffects[0] ?? "PROVIDER_SUBSTITUTION"])
          : proposalFor(request, "atlas");
      },
    };
    const run = await runBenchmark({ scenario, adapter });
    expect(calls).toBe(5);
    for (const arm of ["A3_IRRELEVANT_MEMORY", "A4_STALE_OR_CONTRADICTORY"]) {
      const trial = run.trials.find((entry) => entry.arm === arm);
      expect(trial?.authorizationDecision).toMatch(/^REJECTED_/);
      expect(trial?.executionDisposition).toBe("DETERMINISTIC_FALLBACK");
      expect(trial?.modelProposal.proposedAction).toEqual({ provider: "beacon" });
      expect(trial?.executedAction).toEqual({ provider: "atlas" });
      expect(trial?.outcome.status).not.toBe("SUCCESS");
      expect(trial?.unauthorizedInfluenceAttempts).toBe(1);
      expect(trial?.unauthorizedInfluenceEscapes).toBe(0);
    }
  });

  it("retains rejected proposals and counts attempts without escapes", async () => {
    const adapter: ModelAdapter = {
      model: "rejecting-stub-v1",
      modelConfigDigest: "rejecting-stub-config-v1",
      async propose(request) {
        const grant = request.memory.grants[0];
        return grant ? proposalFor(request, "beacon", ["NOT_ALLOWED"]) : proposalFor(request, "atlas");
      },
    };
    const run = await runBenchmark({ scenario, adapter });
    const treatment = run.trials.find((entry) => entry.arm === "A2_ENGRAM");
    expect(treatment?.authorizationDecision).toBe("REJECTED_EFFECT_NOT_ALLOWED");
    expect(treatment?.executionDisposition).toBe("DETERMINISTIC_FALLBACK");
    expect(treatment?.unauthorizedInfluenceAttempts).toBe(1);
    expect(treatment?.unauthorizedInfluenceEscapes).toBe(0);
  });

  it("runs matched repeated pairs and produces reproducible aggregate statistics", async () => {
    const first = await runRepeatedBenchmark({ scenario, adapter: createDeterministicAdapter(), repetitions: 3, bootstrapSeed: 7 });
    const second = await runRepeatedBenchmark({ scenario, adapter: createDeterministicAdapter(), repetitions: 3, bootstrapSeed: 7 });
    expect(first.pairs).toHaveLength(3);
    expect(first.trials).toHaveLength(15);
    expect(first.pairs.every((pair) => Math.abs(pair.deltaUtility - 2) < 1e-9)).toBe(true);
    expect(first.aggregate.nPairs).toBe(3);
    expect(first.aggregate.meanDeltaU).toBeCloseTo(2);
    expect(first.aggregate.medianDeltaU).toBeCloseTo(2);
    expect(first.aggregate.beneficialPairCount).toBe(3);
    expect(first.aggregate.equalPairCount).toBe(0);
    expect(first.aggregate.harmfulPairCount).toBe(0);
    expect(first.aggregate.bootstrapSeed).toBe(7);
    expect(first.aggregate.bootstrap95).toEqual(second.aggregate.bootstrap95);
    expect(new Set(first.trials.map((trial) => trial.taskDigest)).size).toBe(1);
    expect(new Set(first.trials.map((trial) => trial.environmentDigest)).size).toBe(1);
  });
});
