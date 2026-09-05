import { loadBenchmarkScenario } from "../packages/benchmark/src/scenario.js";
import { createDeterministicAdapter } from "../packages/benchmark/src/adapters/deterministic.js";
import { runBenchmark } from "../packages/benchmark/src/runner.js";
import { writeBenchmarkResults } from "../packages/benchmark/src/result-writer.js";

const scenario = loadBenchmarkScenario("benchmarks/scenarios/provider-urgent.json");
const run = await runBenchmark({
  scenario,
  adapter: createDeterministicAdapter(),
  evidenceMaturity: "SIMULATED_PASS",
});
const runDir = await writeBenchmarkResults({
  baseDir: "benchmarks",
  runId: run.runId,
  manifest: run.manifest,
  trials: run.trials,
  pairs: run.pairs,
  evidence: run.evidence,
});

console.log(`run-id:            ${run.runId}`);
console.log(`git sha:           ${run.testedGitSha}`);
console.log(`evidence maturity: ${run.manifest.evidenceMaturity}`);
console.log(`results dir:       ${runDir}`);
console.log("");
for (const trial of run.trials) {
  console.log(
    `${trial.arm.padEnd(26)} utility=${trial.utility.toFixed(3).padStart(7)}  provider=${String(
      (trial.action as { provider?: string }).provider ?? "(none)",
    ).padEnd(8)} influenced=${String(trial.memoryInfluenced).padEnd(5)} escapes=${trial.unauthorizedInfluenceEscapes}`,
  );
}
const pair = run.pairs[0];
if (pair) {
  console.log("");
  console.log(`canonical pair ΔU = U(A2) - U(A0) = ${pair.deltaUtility.toFixed(3)}`);
  console.log(
    `actionChanged=${pair.actionChanged} consequential=${pair.behaviorConsequential} beneficial=${pair.beneficial} harmful=${pair.harmful} authorityClean=${pair.authorityClean}`,
  );
}
