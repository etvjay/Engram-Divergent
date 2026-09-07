import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

it("prepares a retained A0 bundle without ACP, signer, Base, job, or funding side effects", async () => {
  const dir = await mkdtemp(join(tmpdir(), "engram-acp-live-prepare-"));
  const tsx = resolve(process.cwd(), "node_modules/.bin/tsx");
  try {
    const result = spawnSync(tsx, ["scripts/acp-live-prepare.ts"], {
      env: { ...process.env, ENGRAM_ACP_PREPARE_DIR: dir },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as any;
    expect(output.state).toBe("A0_PREPARED");
    expect(output.sideEffects).toEqual({ jobCreated: false, jobFunded: false, signerInvoked: false, baseInvoked: false, fundsMoved: false });
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    const plan = JSON.parse(await readFile(join(dir, "a0-plan.json"), "utf8"));
    const auth = JSON.parse(await readFile(join(dir, "authorization-requirements.json"), "utf8"));
    expect(manifest.stopGate).toBe("A0_PREPARED");
    expect(manifest.catalogSnapshot.rawDigest).toBe("5479652180e4b879d68d724ee89451b0d7c2aa250557fbd78ff640a381099e76");
    expect(plan.candidateSet).toHaveLength(2);
    expect(plan.task.input).toEqual({ symbol: "BTC" });
    expect(plan.a2TreatmentProtocol).toEqual(expect.objectContaining({ status: "DEFINED_NOT_READY", requiresAuthenticAdmittedA0Memory: true }));
    expect(auth.currentAuthorization).toBe("NOT_AUTHORIZED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
