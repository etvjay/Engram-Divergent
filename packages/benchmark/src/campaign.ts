import { appendFile, readFile } from "node:fs/promises";
import type { ModelAdapter, ModelDecisionRequest } from "./model-adapter.js";
import type { BenchmarkRunResult } from "./runner.js";

export type CampaignRecord =
  | { kind: "completed"; pairId: string; recordedAt: string; run: BenchmarkRunResult }
  | { kind: "error"; pairId: string; recordedAt: string; error: string };

export async function readCompletedPairIds(path: string): Promise<Set<string>> {
  try {
    const text = await readFile(path, "utf8");
    const ids = new Set<string>();
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const record = JSON.parse(line) as CampaignRecord;
      if (record.kind === "completed") ids.add(record.pairId);
    }
    return ids;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    throw error;
  }
}

export async function appendCampaignRecord(path: string, record: CampaignRecord): Promise<void> {
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("CAMPAIGN_TIMEOUT_INVALID");
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT_${timeoutMs}MS`)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export function withRequestTimeout(adapter: ModelAdapter, timeoutMs: number): ModelAdapter {
  return {
    model: adapter.model,
    modelConfigDigest: `${adapter.modelConfigDigest}:request-timeout=${timeoutMs}`,
    propose: (request: ModelDecisionRequest) =>
      withTimeout(adapter.propose(request), timeoutMs, "MODEL_REQUEST"),
  };
}
