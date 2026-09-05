import { describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBenchmark } from "../../packages/benchmark/src/runner.js";
import { writeBenchmarkResults } from "../../packages/benchmark/src/result-writer.js";
import { createDeterministicAdapter } from "../../packages/benchmark/src/adapters/deterministic.js";
import { createQwenAdapter } from "../../packages/benchmark/src/adapters/qwen.js";
import { createBedrockAdapter, resolveBedrockCredentials } from "../../packages/benchmark/src/adapters/bedrock.js";
import { baseProposal, type ModelAdapter, type ModelDecisionRequest } from "../../packages/benchmark/src/model-adapter.js";
import { loadBenchmarkScenario } from "../../packages/benchmark/src/scenario.js";

const scenario = loadBenchmarkScenario("benchmarks/scenarios/provider-urgent.json");

function armTrial(run: Awaited<ReturnType<typeof runBenchmark>>, arm: string) {
  const trial = run.trials.find((entry) => entry.arm === arm);
  if (!trial) throw new Error(`missing trial for ${arm}`);
  return trial;
}

describe("Engram causal benchmark runner", () => {
  it("runs all matched arms; eligible memory changes the decision, irrelevant and stale memory do not", async () => {
    const run = await runBenchmark({ scenario, adapter: createDeterministicAdapter(), evidenceMaturity: "SIMULATED_PASS" });

    expect(run.trials).toHaveLength(5);
    expect(new Set(run.trials.map((trial) => trial.arm)).size).toBe(5);

    const control = armTrial(run, "A0_NO_MEMORY");
    const treatment = armTrial(run, "A2_ENGRAM");
    const irrelevant = armTrial(run, "A3_IRRELEVANT_MEMORY");
    const stale = armTrial(run, "A4_STALE_OR_CONTRADICTORY");
    const rawHistory = armTrial(run, "A1_RAW_HISTORY");

    // Causal treatment: eligible memory substitutes away from the breaching provider.
    expect(control.action).toEqual({ provider: "atlas" });
    expect((treatment.action as { provider: string }).provider).toBe("beacon");
    expect(treatment.memorySliceId).toBeTruthy();
    expect(treatment.influenceGrantId).toBeTruthy();
    expect(treatment.executionMemoryId).toBeTruthy();

    // Causal pair: beneficial uplift, clean authority.
    expect(run.pairs).toHaveLength(1);
    expect(run.pairs[0]?.deltaUtility).toBeGreaterThan(0);
    expect(run.pairs[0]?.beneficial).toBe(true);
    expect(run.pairs[0]?.authorityClean).toBe(true);

    // Disciplined non-influence: irrelevant valid memory changes nothing.
    expect(irrelevant.action).toEqual(control.action);
    expect(irrelevant.memoryInfluenced).toBe(false);
    expect(irrelevant.unauthorizedInfluenceEscapes).toBe(0);

    // Stale/superseded grant is pre-disqualified: no influence, no escape.
    expect(stale.action).toEqual(control.action);
    expect(stale.memoryEligible).toBe(false);
    expect(stale.memoryInfluenced).toBe(false);

    // Raw history alone does not move the rules engine (structure is what acts).
    expect(rawHistory.action).toEqual(control.action);

    // Paired-run controls held constant across every arm.
    for (const trial of run.trials) {
      expect(trial.model).toBe(control.model);
      expect(trial.modelConfigDigest).toBe(control.modelConfigDigest);
      expect(trial.taskDigest).toBe(control.taskDigest);
      expect(trial.environmentDigest).toBe(control.environmentDigest);
      expect(trial.capabilityDigest).toBe(control.capabilityDigest);
      expect(trial.mandateDigest).toBe(control.mandateDigest);
      expect(trial.evidenceMaturity).toBe("SIMULATED_PASS");
      expect(trial.evidenceMaturity).not.toBe("LIVE_PASS");
      expect(trial.evidenceMaturity).not.toBe("TESTNET_PASS");
    }
  });

  it("fail-closes when a proposal requests effects without valid grant authority", async () => {
    const overreaching: ModelAdapter = {
      model: "overreach-stub-v1",
      modelConfigDigest: "overreach-stub-config-v1",
      async propose(request: ModelDecisionRequest) {
        const grant = request.memory.grants[0];
        if (request.memory.grants.length > 0 && grant) {
          // Cites the slice but requests an effect the grant never allowed.
          return baseProposal({
            request,
            model: "overreach-stub-v1",
            proposedAction: { provider: "beacon", fundTransfer: true },
            reasoningSummary: "attempting an unauthorized effect",
            memorySliceIds: [grant.memorySliceId],
            requestedEffects: ["FUND_TRANSFER"],
          });
        }
        return baseProposal({
          request,
          model: "overreach-stub-v1",
          proposedAction: { provider: "atlas" },
          reasoningSummary: "no memory path",
        });
      },
    };

    const run = await runBenchmark({ scenario, adapter: overreaching });
    const treatment = armTrial(run, "A2_ENGRAM");
    const control = armTrial(run, "A0_NO_MEMORY");

    expect(treatment.unauthorizedInfluenceEscapes).toBe(1);
    expect(treatment.action).toEqual(control.action);
    expect(treatment.memoryInfluenced).toBe(false);
    expect(run.pairs[0]?.authorityClean).toBe(false);
  });

  it("fail-closes when effects cite an expired grant (A4)", async () => {
    const staleCiter: ModelAdapter = {
      model: "stale-citer-stub-v1",
      modelConfigDigest: "stale-citer-config-v1",
      async propose(request: ModelDecisionRequest) {
        const grant = request.memory.grants[0];
        const slice = request.memory.slices[0];
        if (grant && slice) {
          // Requests a properly-allowed effect, but from an expired grant.
          return baseProposal({
            request,
            model: "stale-citer-stub-v1",
            proposedAction: { provider: "beacon" },
            reasoningSummary: "citing stale memory",
            memorySliceIds: [slice.id],
            requestedEffects: [grant.allowedEffects[0] ?? "PROVIDER_SUBSTITUTION"],
          });
        }
        return baseProposal({
          request,
          model: "stale-citer-stub-v1",
          proposedAction: { provider: "atlas" },
          reasoningSummary: "no memory path",
        });
      },
    };

    const run = await runBenchmark({ scenario, adapter: staleCiter });
    const stale = armTrial(run, "A4_STALE_OR_CONTRADICTORY");
    const control = armTrial(run, "A0_NO_MEMORY");

    expect(stale.unauthorizedInfluenceEscapes).toBe(1);
    expect(stale.action).toEqual(control.action);
    expect(stale.memoryEligible).toBe(false);
  });

  it("refuses to claim live or testnet evidence from a local run", async () => {
    await expect(
      runBenchmark({ scenario, adapter: createDeterministicAdapter(), evidenceMaturity: "LIVE_PASS" }),
    ).rejects.toThrow("BENCHMARK_EXTERNAL_EVIDENCE_REQUIRES_CONFIRM_EXTERNAL_EXECUTION");
    await expect(
      runBenchmark({ scenario, adapter: createDeterministicAdapter(), evidenceMaturity: "TESTNET_PASS" }),
    ).rejects.toThrow("BENCHMARK_EXTERNAL_EVIDENCE_REQUIRES_CONFIRM_EXTERNAL_EXECUTION");
  });

  it("writes the result bundle in the benchmarks/ directory convention", async () => {
    const run = await runBenchmark({ scenario, adapter: createDeterministicAdapter(), evidenceMaturity: "SIMULATED_PASS" });
    const baseDir = await mkdtemp(join(tmpdir(), "engram-benchmark-"));
    const runDir = await writeBenchmarkResults({
      baseDir,
      runId: run.runId,
      manifest: run.manifest,
      trials: run.trials,
      pairs: run.pairs,
      evidence: run.evidence,
    });

    const manifest = JSON.parse(await readFile(join(runDir, "manifest.json"), "utf8"));
    expect(manifest.runId).toBe(run.runId);
    expect(manifest.evidenceMaturity).toBe("SIMULATED_PASS");
    expect(manifest.summary.canonicalPair.deltaUtility).toBeGreaterThan(0);
    expect(typeof manifest.testedGitSha).toBe("string");

    const trialsLines = (await readFile(join(runDir, "trials.jsonl"), "utf8")).trim().split("\n");
    expect(trialsLines).toHaveLength(5);
    for (const line of trialsLines) expect(() => JSON.parse(line)).not.toThrow();

    const pairsLines = (await readFile(join(runDir, "pairs.jsonl"), "utf8")).trim().split("\n");
    expect(pairsLines).toHaveLength(1);

    const evidenceFiles = await readdir(join(runDir, "evidence"));
    expect(evidenceFiles).toHaveLength(5);
  });

  it("qwen adapter returns an AgentDecisionProposal without ever touching Sibyl", async () => {
    const replies = [
      JSON.stringify({
        proposedAction: { provider: "beacon", prepayFraction: 0.1 },
        reasoningSummary: "memory flags the cheap provider as breaching",
        memorySliceIds: [],
        requestedEffects: [],
      }),
    ];
    let calls = 0;
    const fetchImpl = (async (_url: unknown, init?: { body?: string }) => {
      calls += 1;
      const body = JSON.parse(init?.body ?? "{}") as { messages?: Array<{ content?: string }> };
      expect(body.messages?.length).toBe(2);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: replies[Math.min(calls - 1, replies.length - 1)] } }] }),
        { status: 200 },
      );
    }) as typeof fetch;

    const adapter = createQwenAdapter({ fetchImpl, baseUrl: "http://localhost:9/v1", model: "qwen2.5:0.5b" });
    const run = await runBenchmark({ scenario, adapter });

    expect(calls).toBe(5);
    const treatment = armTrial(run, "A2_ENGRAM");
    expect(treatment.model).toBe("qwen2.5:0.5b");
    expect(treatment.action).toEqual({ provider: "beacon", prepayFraction: 0.1 });
    expect(treatment.memoryInfluenced).toBe(false); // cited no slice ids: no authorized influence
  });

  it("qwen adapter fails closed on non-JSON model output", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "I think atlas is fine" } }] }), {
        status: 200,
      })) as typeof fetch;
    const adapter = createQwenAdapter({ fetchImpl, baseUrl: "http://localhost:9/v1" });
    await expect(adapter.propose({
      executionId: "10000000-0000-4000-8000-000000000009",
      scenarioId: scenario.scenarioId,
      decisionType: scenario.taskFamily,
      mandate: { ...scenario.constraints },
      candidates: scenarioCandidatesFix(scenario),
      memory: { arm: "A0_NO_MEMORY", slices: [], grants: [], eligibleGrantIds: [] },
    })).rejects.toThrow("QWEN_ADAPTER_INVALID_RESPONSE");
  });

  it("bedrock adapter signs SigV4, parses Converse output, and records the model id", async () => {
    process.env.AWS_ACCESS_KEY_ID = "AKIDEXAMPLE";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";
    delete process.env.AWS_SESSION_TOKEN;
    let authHeader = "";
    const fetchImpl = (async (_url: unknown, init?: Record<string, unknown>) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      authHeader = headers.authorization ?? "";
      expect(headers["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
      expect(init?.body as string).toContain("proposedAction");
      return new Response(
        JSON.stringify({
          output: {
            message: {
              content: [
                {
                  text: JSON.stringify({
                    proposedAction: { provider: "beacon" },
                    reasoningSummary: "memory flags atlas SLA breaches",
                    memorySliceIds: [],
                    requestedEffects: [],
                  }),
                },
              ],
            },
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const adapter = createBedrockAdapter({
      fetchImpl,
      modelId: "us.meta.llama3-1-8b-instruct-v1:0",
      region: "us-west-2",
    });
    expect(adapter.model).toBe("bedrock:us.meta.llama3-1-8b-instruct-v1:0");

    const proposal = await adapter.propose({
      executionId: "10000000-0000-4000-8000-00000000000a",
      scenarioId: scenario.scenarioId,
      decisionType: scenario.taskFamily,
      mandate: { ...scenario.constraints },
      candidates: scenarioCandidatesFix(scenario),
      memory: { arm: "A0_NO_MEMORY", slices: [], grants: [], eligibleGrantIds: [] },
    });
    expect(authHeader.startsWith("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/")).toBe(true);
    expect(authHeader).toContain("/bedrock/aws4_request");
    expect((proposal.proposedAction as { provider: string }).provider).toBe("beacon");
    expect(proposal.actor.model).toBe("bedrock:us.meta.llama3-1-8b-instruct-v1:0");
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
  });

  it("bedrock adapter fails closed without credentials and on non-JSON output", async () => {
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    const adapter = createBedrockAdapter({ modelId: "us.meta.llama3-1-8b-instruct-v1:0", region: "us-west-2" });
    await expect(adapter.propose({
      executionId: "10000000-0000-4000-8000-00000000000b",
      scenarioId: scenario.scenarioId,
      decisionType: scenario.taskFamily,
      mandate: { ...scenario.constraints },
      candidates: scenarioCandidatesFix(scenario),
      memory: { arm: "A0_NO_MEMORY", slices: [], grants: [], eligibleGrantIds: [] },
    })).rejects.toThrow("BEDROCK_ADAPTER_NO_CREDENTIALS");

    process.env.AWS_ACCESS_KEY_ID = "AKIDEXAMPLE";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ output: { message: { content: [{ text: "atlas looks cheaper" }] } } }), {
        status: 200,
      })) as typeof fetch;
    const withFake = createBedrockAdapter({ fetchImpl, modelId: "us.meta.llama3-1-8b-instruct-v1:0", region: "us-west-2" });
    await expect(withFake.propose({
      executionId: "10000000-0000-4000-8000-00000000000c",
      scenarioId: scenario.scenarioId,
      decisionType: scenario.taskFamily,
      mandate: { ...scenario.constraints },
      candidates: scenarioCandidatesFix(scenario),
      memory: { arm: "A0_NO_MEMORY", slices: [], grants: [], eligibleGrantIds: [] },
    })).rejects.toThrow("BEDROCK_ADAPTER_INVALID_RESPONSE");
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    expect(resolveBedrockCredentials).toBeTypeOf("function");
  });
});

function scenarioCandidatesFix(scenarioFix: ReturnType<typeof loadBenchmarkScenario>) {
  return scenarioFix.candidateProviders.map((providerId) => {
    const terms = scenarioFix.providerTerms[providerId];
    if (!terms) throw new Error(`missing terms for ${providerId}`);
    return {
      providerId,
      costUsd: terms.costUsd,
      expectedLatencySeconds: terms.expectedLatencySeconds,
    };
  });
}
