import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  BenchmarkArm,
  BenchmarkTrial,
  EvidenceMaturity,
  PairedBenchmarkResult,
} from "../../evaluation/src/benchmark.js";

export interface BenchmarkManifest {
  runId: string;
  testedGitSha: string;
  scenarioId: string;
  scenarioVersion: number;
  adapter: { model: string; modelConfigDigest: string };
  evidenceMaturity: EvidenceMaturity;
  armsRun: BenchmarkArm[];
  controls: Record<string, unknown>;
  createdAt: string;
  summary: {
    perArm: Record<string, unknown>;
    canonicalPair: PairedBenchmarkResult;
  };
}

export interface WriteBenchmarkResultsInput {
  baseDir: string;
  runId: string;
  manifest: BenchmarkManifest;
  trials: BenchmarkTrial[];
  pairs: PairedBenchmarkResult[];
  evidence: Array<Record<string, unknown>>;
}

export async function writeBenchmarkResults(input: WriteBenchmarkResultsInput): Promise<string> {
  const runDir = join(input.baseDir, "results", input.runId);
  const evidenceDir = join(runDir, "evidence");
  await mkdir(evidenceDir, { recursive: true });

  await writeFile(join(runDir, "manifest.json"), `${JSON.stringify(input.manifest, null, 2)}\n`, "utf8");

  const trialsJsonl = input.trials.map((trial) => JSON.stringify(trial)).join("\n");
  await writeFile(join(runDir, "trials.jsonl"), trialsJsonl ? `${trialsJsonl}\n` : "", "utf8");

  const pairsJsonl = input.pairs.map((pair) => JSON.stringify(pair)).join("\n");
  await writeFile(join(runDir, "pairs.jsonl"), pairsJsonl ? `${pairsJsonl}\n` : "", "utf8");

  for (const record of input.evidence) {
    const trialId = typeof record.trialId === "string" ? record.trialId : "unknown";
    await writeFile(join(evidenceDir, `${trialId}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }

  return runDir;
}
