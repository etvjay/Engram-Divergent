import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, mkdir, copyFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const fixturePath = resolve(process.cwd(), "tests/fixtures/tool-recovery/recovered-market-data.json");
const tsx = resolve(process.cwd(), "node_modules/.bin/tsx");

describe("tool recovery durable learning", () => {
  it("uses the generic Engram-to-Sibyl path across a real process boundary", async () => {
    const dir = await mkdtemp(join(tmpdir(), "engram-tool-recovery-"));
    const db = join(dir, "memory.db");
    const state = join(dir, "state.json");
    const future = join(dir, "future.json");
    const env = { ...process.env, ENGRAM_SIBYL_DB: db, ENGRAM_SIBYL_TENANT: "tool-recovery-fixture" };
    try {
      const a = spawnSync(tsx, ["scripts/tool-recovery-process-a.ts", "--fixture", fixturePath, "--source-ref", "tests/fixtures/tool-recovery/recovered-market-data.json", "--out", state], { env, encoding: "utf8", timeout: 60_000 });
      if (a.status !== 0) throw new Error(a.stderr || a.stdout);
      const processA = JSON.parse(a.stdout) as any;
      expect(processA.completion.status).toBe("SUCCESS");
      expect(processA.admission.status).toBe("ADMITTED");
      const b = spawnSync(tsx, ["scripts/tool-recovery-process-b.ts", "--state", state, "--out", future], { env, encoding: "utf8", timeout: 60_000 });
      if (b.status !== 0) throw new Error(b.stderr || b.stdout);
      const processB = JSON.parse(b.stdout) as any;
      expect(processB.processBoundary).toEqual({ sourceProcessCompleted: true, freshRuntime: true, inMemoryObjectsReused: false });
      expect(processB.recall).toEqual({ memoryFound: true, applicable: true, eligible: true });
      expect(processB.positiveAuthorization).toBe("AUTHORIZED");
      expect(processB.negativeAuthorization).toMatch(/^REJECTED:INFLUENCE_EFFECT_DENIED:new_tool/);
      expect(processB.unauthorizedInfluenceEscapes).toBe(0);
      expect(processB.lineageValidation).toEqual([]);
      const evidenceStamp = new Date().toISOString().replace(/[:.]/g, "-");
      const evidenceDir = join(process.cwd(), "evidence/evals/tool-recovery", evidenceStamp);
      await mkdir(evidenceDir, { recursive: true });
      await copyFile(state, join(evidenceDir, "process-a.json"));
      await copyFile(future, join(evidenceDir, "process-b.json"));
      await writeFile(join(evidenceDir, "manifest.json"), `${JSON.stringify({ schema: "engram.tool-recovery-durable-learning/v1", evidenceState: "LOCAL_PASS", sourceEvidencePath: "tests/fixtures/tool-recovery/recovered-market-data.json", processA: "process-a.json", processB: "process-b.json", executionMemoryId: processA.executionMemoryId, memorySliceId: processB.ids.memorySliceId, influenceGrantId: processB.ids.influenceGrantId }, null, 2)}\n`);
      expect(JSON.parse(await readFile(join(evidenceDir, "manifest.json"), "utf8")).evidenceState).toBe("LOCAL_PASS");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
