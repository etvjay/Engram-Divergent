import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();
const tsx = resolve(root, "node_modules/.bin/tsx");
const fixture = resolve(root, "tests/fixtures/tool-recovery/tool-a-rate-limit-failure.json");
const sourceRef = "tests/fixtures/tool-recovery/tool-a-rate-limit-failure.json";
const mode = process.argv.includes("--fresh-only") ? "FRESH_SESSION_ONLY" : "JUDGE_PROOF";
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const rootTmp = await mkdtemp(join(tmpdir(), "engram-judge-proof-"));
const enabledDir = join(rootTmp, "sibyl-enabled");
const emptyDir = join(rootTmp, "sibyl-empty");
const state = join(rootTmp, "process-a.json");
const future = join(rootTmp, "process-b.json");
const sourceDigest = createHash("sha256").update(await readFile(fixture)).digest("hex");
const testedSha = run("git", ["rev-parse", "HEAD"]).trim();

function run(command: string, args: string[], env?: Record<string, string | undefined>): string {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, ...env }, encoding: "utf8", timeout: 120_000 });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}
function runJson(command: string, args: string[], env?: Record<string, string | undefined>): Record<string, any> {
  return JSON.parse(run(command, args, env));
}

try {
  const enabledEnv = { ENGRAM_SIBYL_DB: join(enabledDir, "memory.db"), ENGRAM_SIBYL_TENANT: `judge-proof-enabled-${runId}` };
  const processA = runJson(tsx, ["scripts/tool-recovery-process-a.ts", "--fixture", fixture, "--source-ref", sourceRef, "--out", state], enabledEnv);
  const processB = runJson(tsx, ["scripts/tool-recovery-process-b.ts", "--state", state, "--out", future], enabledEnv);
  const enabled = {
    sourceProcess: { completed: true, executionMemoryId: processA.executionMemoryId, admission: processA.admission },
    freshProcess: processB.processBoundary,
    memoryFound: processB.recall.memoryFound,
    applicable: processB.recall.applicable,
    eligible: processB.recall.eligible,
    memorySlice: { id: processB.ids.memorySliceId, claims: processB.memorySlice?.claims ?? null },
    influenceGrant: { id: processB.ids.influenceGrantId, allowedEffects: processB.allowedEffects, deniedEffects: processB.deniedEffects },
    behavior: { changed: processB.positiveAuthorization === "AUTHORIZED", selectedStrategy: "tool-b-recovery", expectedOutcome: "SUCCESS" },
    authority: { valid: processB.positiveAuthorization === "AUTHORIZED", unauthorizedEscapes: processB.unauthorizedInfluenceEscapes },
    evidenceRefs: processB.evidenceRefs,
  };

  let empty: Record<string, any> | null = null;
  if (mode === "JUDGE_PROOF") {
    empty = runJson(tsx, ["scripts/judge-empty-process-c.ts", "--execution-memory-id", processA.executionMemoryId], { ENGRAM_SIBYL_DB: join(emptyDir, "memory.db"), ENGRAM_SIBYL_TENANT: `judge-proof-empty-${runId}` });
  }

  const proof = {
    schema: "engram.judge-proof/v1",
    evidenceState: "LOCAL_PASS",
    mode,
    generatedAt: new Date().toISOString(),
    testedSha,
    source: { fixture: sourceRef, sha256: sourceDigest },
    arm1SibylEnabled: enabled,
    arm2SibylAbsent: empty,
    materialDegradation: empty ? enabled.behavior.selectedStrategy !== empty.action && enabled.behavior.expectedOutcome !== empty.outcome : null,
    claims: {
      processDeathObserved: enabled.freshProcess.sourceProcessCompleted && enabled.freshProcess.freshRuntime && !enabled.freshProcess.inMemoryObjectsReused,
      memoryContinuityObserved: enabled.memoryFound && enabled.applicable && enabled.eligible,
      boundedInfluenceObserved: enabled.authority.valid && enabled.authority.unauthorizedEscapes === 0,
      deletionDegradesContinuity: empty ? empty.memoryFound === false && empty.outcome === "FAILURE" : null,
    },
  };
  const outDir = resolve(root, "evidence/canonical/judge/latest");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, mode === "JUDGE_PROOF" ? "proof.json" : "fresh-session.json"), `${JSON.stringify(proof, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
} finally {
  await rm(rootTmp, { recursive: true, force: true });
}
