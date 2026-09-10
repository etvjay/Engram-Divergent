import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendCampaignRecord, readCompletedPairIds, withTimeout } from "../../packages/benchmark/src/campaign.js";

describe("resumable benchmark campaign", () => {
  it("persists completed pairs and resumes from the checkpoint", async () => {
    const dir = await mkdtemp(join(tmpdir(), "engram-campaign-"));
    const path = join(dir, "checkpoint.jsonl");
    await appendCampaignRecord(path, { kind: "completed", pairId: "pair-1", recordedAt: "now", run: {} as never });
    await appendCampaignRecord(path, { kind: "error", pairId: "pair-2", recordedAt: "now", error: "MODEL_REQUEST_TIMEOUT_10MS" });
    expect(await readCompletedPairIds(path)).toEqual(new Set(["pair-1"]));
    expect((await readFile(path, "utf8")).split("\n").filter(Boolean)).toHaveLength(2);
  });

  it("rejects a request when the model exceeds the configured timeout", async () => {
    await expect(withTimeout(new Promise((resolve) => setTimeout(resolve, 30)), 5, "MODEL_REQUEST")).rejects.toThrow("MODEL_REQUEST_TIMEOUT_5MS");
  });
});
