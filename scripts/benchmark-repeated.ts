import { loadBenchmarkScenario } from "../packages/benchmark/src/scenario.js";
import { createDeterministicAdapter } from "../packages/benchmark/src/adapters/deterministic.js";
import { createBedrockAdapter } from "../packages/benchmark/src/adapters/bedrock.js";
import { createQwenAdapter } from "../packages/benchmark/src/adapters/qwen.js";
import { assertCleanGitTree, runRepeatedBenchmark } from "../packages/benchmark/src/runner.js";
import { writeBenchmarkResults } from "../packages/benchmark/src/result-writer.js";

const scenario = loadBenchmarkScenario("benchmarks/scenarios/provider-urgent.json");
assertCleanGitTree(process.cwd());

const bedrockModelId = process.env.ENGRAM_BEDROCK_MODEL_ID;
const ollamaModel = process.env.ENGRAM_QWEN_MODEL;
const adapter = bedrockModelId
  ? createBedrockAdapter({ modelId: bedrockModelId })
  : ollamaModel
    ? createQwenAdapter({
        model: ollamaModel,
        baseUrl: process.env.ENGRAM_QWEN_BASE_URL ?? "http://127.0.0.1:11434/v1",
      })
    : createDeterministicAdapter();
const repetitions = Number(process.env.ENGRAM_BENCHMARK_REPETITIONS ?? "10");
const bootstrapSeed = Number(process.env.ENGRAM_BOOTSTRAP_SEED ?? "20260906");
const bootstrapResamples = Number(process.env.ENGRAM_BOOTSTRAP_RESAMPLES ?? "10000");
const maturity = bedrockModelId || ollamaModel ? "LOCAL_PASS" : "SIMULATED_PASS";
const run = await runRepeatedBenchmark({
  scenario,
  adapter,
  repetitions,
  bootstrapSeed,
  bootstrapResamples,
  evidenceMaturity: maturity,
});
const runDir = await writeBenchmarkResults({
  baseDir: "benchmarks",
  runId: run.runId,
  manifest: run.manifest,
  trials: run.trials,
  pairs: run.pairs,
  evidence: run.evidence,
  aggregate: run.aggregate,
});

console.log(`model:             ${run.aggregate.model}`);
console.log(`pairs:             ${run.aggregate.nPairs}`);
console.log(`git sha:           ${run.testedGitSha}`);
console.log(`evidence maturity: ${run.manifest.evidenceMaturity}`);
console.log(`bootstrap seed:    ${run.aggregate.bootstrapSeed}`);
console.log(`results dir:       ${runDir}`);
console.log("");
console.log(`mean ΔU:           ${run.aggregate.meanDeltaU.toFixed(3)}`);
console.log(`median ΔU:         ${run.aggregate.medianDeltaU.toFixed(3)}`);
console.log(`range ΔU:          ${run.aggregate.minDeltaU.toFixed(3)} .. ${run.aggregate.maxDeltaU.toFixed(3)}`);
console.log(`beneficial pairs:  ${run.aggregate.beneficialPairCount}/${run.aggregate.nPairs}`);
console.log(`equal pairs:       ${run.aggregate.equalPairCount}/${run.aggregate.nPairs}`);
console.log(`harmful pairs:     ${run.aggregate.harmfulPairCount}/${run.aggregate.nPairs}`);
console.log(`bootstrap 95% CI:  ${run.aggregate.bootstrap95.lower.toFixed(3)} .. ${run.aggregate.bootstrap95.upper.toFixed(3)}`);
console.log(`attempts:          ${run.aggregate.unauthorizedInfluenceAttempts}`);
console.log(`escapes:           ${run.aggregate.unauthorizedInfluenceEscapes}`);
