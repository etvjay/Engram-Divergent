import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadBenchmarkScenario, resolveBenchmarkScenarioPath } from "../packages/benchmark/src/scenario.js";
import { createBedrockAdapter } from "../packages/benchmark/src/adapters/bedrock.js";
import { createQwenAdapter } from "../packages/benchmark/src/adapters/qwen.js";
import { createDeterministicAdapter } from "../packages/benchmark/src/adapters/deterministic.js";
import { assertCleanGitTree, runBenchmark } from "../packages/benchmark/src/runner.js";
import { appendCampaignRecord, readCompletedPairIds, withRequestTimeout, type CampaignRecord } from "../packages/benchmark/src/campaign.js";

const repoRoot = process.cwd();
assertCleanGitTree(repoRoot);
const scenario = loadBenchmarkScenario(
  resolveBenchmarkScenarioPath(process.env.ENGRAM_BENCHMARK_SCENARIO ?? process.argv[2]),
);
const repetitions = Number(process.env.ENGRAM_BENCHMARK_REPETITIONS ?? "10");
const requestTimeoutMs = Number(process.env.ENGRAM_MODEL_REQUEST_TIMEOUT_MS ?? "30000");
const model = process.env.ENGRAM_QWEN_MODEL;
const bedrockModelId = process.env.ENGRAM_BEDROCK_MODEL_ID;
const adapter = bedrockModelId
  ? createBedrockAdapter({ modelId: bedrockModelId })
  : model
    ? createQwenAdapter({ model, baseUrl: process.env.ENGRAM_QWEN_BASE_URL ?? "http://127.0.0.1:11434/v1" })
    : createDeterministicAdapter();
const boundedAdapter = withRequestTimeout(adapter, requestTimeoutMs);
const runKey = `${adapter.model}-${scenario.scenarioId}-${repetitions}-timeout-${requestTimeoutMs}`.replace(/[^a-zA-Z0-9._-]/g, "_");
const dir = join("benchmarks", "campaigns", runKey);
const checkpointPath = join(dir, "checkpoint.jsonl");
const summaryPath = join(dir, "summary.json");
await mkdir(dir, { recursive: true });
const completed = await readCompletedPairIds(checkpointPath);
let completedCount = completed.size;
let errorCount = 0;
for (let index = 1; index <= repetitions; index += 1) {
  const pairId = `${scenario.scenarioId}-pair-${index}`;
  if (completed.has(pairId)) continue;
  const recordedAt = new Date().toISOString();
  try {
    const run = await runBenchmark({
      scenario,
      adapter: boundedAdapter,
      pairId,
      runId: pairId,
      evidenceMaturity: model || bedrockModelId ? "LOCAL_PASS" : "SIMULATED_PASS",
      repoRoot,
    });
    const record: CampaignRecord = { kind: "completed", pairId, recordedAt, run };
    await appendCampaignRecord(checkpointPath, record);
    completedCount += 1;
  } catch (error) {
    const record: CampaignRecord = {
      kind: "error",
      pairId,
      recordedAt,
      error: error instanceof Error ? error.message : String(error),
    };
    await appendCampaignRecord(checkpointPath, record);
    errorCount += 1;
  }
  if ((completedCount + errorCount) % 5 === 0 || completedCount + errorCount === repetitions) {
    await writeFile(summaryPath, JSON.stringify({ schema: "engram.benchmark-campaign-summary/v1", model: adapter.model, scenarioId: scenario.scenarioId, targetRepetitions: repetitions, completedPairs: completedCount, errorPairs: errorCount, checkpointPath, requestTimeoutMs, updatedAt: new Date().toISOString() }, null, 2) + "\n");
    console.log(`progress: ${completedCount + errorCount}/${repetitions} completed=${completedCount} errors=${errorCount}`);
  }
}
const text = await readFile(checkpointPath, "utf8").catch(() => "");
console.log(`campaign: ${runKey}`);
console.log(`completed pairs: ${completedCount}`);
console.log(`error pairs: ${errorCount}`);
console.log(`checkpoint: ${checkpointPath}`);
console.log(`records: ${text.split("\n").filter(Boolean).length}`);
