import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function safeStamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function commandOutput(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8", cwd: process.cwd() });
  if (result.status !== 0) return "unknown";
  return result.stdout.trim() || result.stderr.trim() || "unknown";
}

function commandStdoutAllowEmpty(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, { encoding: "utf8", cwd: process.cwd() });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function gitHead(): string {
  return commandOutput("git", ["rev-parse", "HEAD"]);
}

async function sha256File(path: string): Promise<string | null> {
  try {
    const body = await readFile(path);
    return createHash("sha256").update(body).digest("hex");
  } catch {
    return null;
  }
}

async function readJsonObject(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

type Step = {
  id: string;
  args: string[];
  env?: Record<string, string>;
};

type StepReceipt = {
  id: string;
  command: string;
  exitCode: number | null;
  stdoutFile: string;
  stdoutSha256: string | null;
  stderrFile: string;
  stderrSha256: string | null;
  startedAt: string;
  completedAt: string;
};

const capturedAt = new Date();
const head = gitHead();
const stamp = safeStamp(capturedAt);
const sourceTreeStatusResult = commandStdoutAllowEmpty("git", ["status", "--porcelain"]);
const sourceTreeStatus = sourceTreeStatusResult ?? "unknown";
const sourceTreeStatusLines = sourceTreeStatusResult === null || sourceTreeStatusResult.length === 0
  ? []
  : sourceTreeStatusResult.split("\n").map((line) => line.trimEnd()).filter(Boolean);

// `npm install` currently creates this untracked file because the repository
// does not commit a package lock. It is setup residue, not source drift. It is
// still hashed into the evidence manifest if present.
const allowedGeneratedStatusLines = new Set(["?? package-lock.json"]);
const allowedGeneratedStatus = sourceTreeStatusLines.filter((line) => allowedGeneratedStatusLines.has(line));
const unexpectedSourceTreeStatus = sourceTreeStatusLines.filter((line) => !allowedGeneratedStatusLines.has(line));
const submissionSourceClean = sourceTreeStatusResult !== null && unexpectedSourceTreeStatus.length === 0;
const literallyClean = sourceTreeStatusResult !== null && sourceTreeStatusLines.length === 0;
const allowDirty = process.env.ENGRAM_EVIDENCE_ALLOW_DIRTY === "1";

if (!submissionSourceClean && !allowDirty) {
  throw new Error(
    `EVIDENCE_SOURCE_TREE_DIRTY: commit-stamped evidence requires no tracked source drift or unexpected untracked files. `
    + `Set ENGRAM_EVIDENCE_ALLOW_DIRTY=1 only for non-submission diagnostics. `
    + `unexpected=${JSON.stringify(unexpectedSourceTreeStatus)}`,
  );
}

const outputDir = resolve(
  process.env.ENGRAM_EVIDENCE_DIR ?? `artifacts/sibyl-evidence/${stamp}-${head.slice(0, 12)}`,
);
const dbPath = resolve(outputDir, "sibyl-evidence.db");
const baseRoutineIntentPath = resolve(outputDir, "base-routine-intent.json");
const tenant = process.env.ENGRAM_SIBYL_TENANT ?? `engram-evidence-${stamp}`;
const python = process.env.ENGRAM_SIBYL_PYTHON ?? "python3";

// Deterministic non-secret addresses used only to bind the local evidence
// artifact. Official-window live execution must replace these with reviewed
// Base Sepolia requester/provider addresses before any wallet action.
const evidenceAtlasAddress = "0x1111111111111111111111111111111111111111";
const evidenceBeaconAddress = "0x2222222222222222222222222222222222222222";

const steps: Step[] = [
  { id: "sibyl-pressure-suite", args: ["run", "test:sibyl"] },
  { id: "base-conformance-suite", args: ["run", "test:base"] },
  { id: "route-seed", args: ["run", "demo:sibyl:seed"] },
  { id: "route-fresh-recall", args: ["run", "demo:sibyl:recall"] },
  { id: "route-no-memory-control", args: ["run", "demo:sibyl:no-memory-control"] },
  { id: "provider-history", args: ["run", "demo:sibyl:provider:seed"] },
  { id: "provider-fresh-urgent", args: ["run", "demo:sibyl:provider:urgent"] },
  {
    id: "provider-fresh-routine-base-intent",
    args: ["run", "demo:sibyl:provider:routine"],
    env: {
      ENGRAM_BASE_INTENT_OUT: baseRoutineIntentPath,
      ENGRAM_BASE_ATLAS_ADDRESS: evidenceAtlasAddress,
      ENGRAM_BASE_BEACON_ADDRESS: evidenceBeaconAddress,
    },
  },
  { id: "sibyl-deletion-mutation", args: ["run", "test:sibyl:deletion"] },
];

await mkdir(outputDir, { recursive: true });

const baseEnv = {
  ...process.env,
  ENGRAM_SIBYL_DB: dbPath,
  ENGRAM_SIBYL_TENANT: tenant,
};

const receipts: StepReceipt[] = [];
let failed = false;

for (const step of steps) {
  const startedAt = new Date();
  const result = spawnSync("npm", step.args, {
    encoding: "utf8",
    env: { ...baseEnv, ...step.env },
    cwd: process.cwd(),
  });
  const completedAt = new Date();
  const stdoutFile = `${step.id}.stdout.txt`;
  const stderrFile = `${step.id}.stderr.txt`;
  const stdoutPath = resolve(outputDir, stdoutFile);
  const stderrPath = resolve(outputDir, stderrFile);
  await writeFile(stdoutPath, result.stdout ?? "", "utf8");
  await writeFile(stderrPath, result.stderr ?? "", "utf8");

  receipts.push({
    id: step.id,
    command: `npm ${step.args.join(" ")}`,
    exitCode: result.status,
    stdoutFile,
    stdoutSha256: await sha256File(stdoutPath),
    stderrFile,
    stderrSha256: await sha256File(stderrPath),
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
  });

  if (result.status !== 0) {
    failed = true;
    break;
  }
}

const baseRoutineIntent = await readJsonObject(baseRoutineIntentPath);
if (!failed) {
  const terms = baseRoutineIntent?.terms as Record<string, unknown> | undefined;
  const provenance = baseRoutineIntent?.provenance as Record<string, unknown> | undefined;
  const memoryRefs = baseRoutineIntent?.memoryRefs;
  const validBaseIntent = baseRoutineIntent?.schema === "engram.base-settlement-intent/v1"
    && baseRoutineIntent?.chainId === 84532
    && baseRoutineIntent?.providerId === "atlas"
    && baseRoutineIntent?.recipient === evidenceAtlasAddress
    && terms?.authorizedPrepayAtomic === "800000"
    && terms?.requireMilestoneVerification === true
    && typeof provenance?.executionId === "string"
    && typeof provenance?.retrievalId === "string"
    && Array.isArray(memoryRefs)
    && memoryRefs.length > 0;
  if (!validBaseIntent) failed = true;
}

const packageJsonPath = resolve(process.cwd(), "package.json");
const packageLockPath = resolve(process.cwd(), "package-lock.json");
const sibylRequirementsPath = resolve(process.cwd(), "packages/sibyl/requirements.txt");
const dbSha256 = await sha256File(dbPath);
const baseRoutineIntentSha256 = await sha256File(baseRoutineIntentPath);

const manifest = {
  schema: "engram.sibyl-evidence-capture/v3",
  capturedAt: capturedAt.toISOString(),
  repository: commandOutput("git", ["remote", "get-url", "origin"]),
  gitHead: head,
  sourceTree: {
    submissionSourceClean,
    literallyClean,
    rawStatus: sourceTreeStatus,
    allowedGeneratedStatus,
    unexpectedStatus: unexpectedSourceTreeStatus,
    dirtyOverrideUsed: allowDirty && !submissionSourceClean,
  },
  tenant,
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    npm: commandOutput("npm", ["--version"]),
    python: commandOutput(python, ["--version"]),
    sibylMemoryClient: commandOutput(python, [
      "-c",
      "import importlib.metadata as m; print(m.version('sibyl-memory-client'))",
    ]),
  },
  dependencyDigests: {
    packageJsonSha256: await sha256File(packageJsonPath),
    generatedPackageLockSha256: await sha256File(packageLockPath),
    sibylRequirementsSha256: await sha256File(sibylRequirementsPath),
  },
  dbFile: "sibyl-evidence.db",
  dbSha256,
  baseSettlementIntent: baseRoutineIntent ? {
    file: "base-routine-intent.json",
    sha256: baseRoutineIntentSha256,
    schema: baseRoutineIntent.schema,
    chainId: baseRoutineIntent.chainId,
    providerId: baseRoutineIntent.providerId,
    recipient: baseRoutineIntent.recipient,
    terms: baseRoutineIntent.terms,
    provenance: baseRoutineIntent.provenance,
    memoryRefs: baseRoutineIntent.memoryRefs,
    liveExecutionBoundary: "This artifact binds memory-conditioned authority only. The deterministic addresses are not live partner addresses and no transaction is executed by evidence capture.",
  } : null,
  status: failed ? "FAILED" : "LOCAL_PASS",
  evidenceBoundary: "This capture is local/CI evidence unless the surrounding run is itself an eligible public evaluator or live partner execution. The retained Base intent is decision-authority evidence only; it is not a Base transaction receipt.",
  integrityNote: "SHA-256 values bind retained stdout/stderr, dependency manifests/setup lockfile when present, the final Sibyl database, and the memory-conditioned Base settlement intent to this manifest. The manifest itself is the root receipt and should be retained with the artifact.",
  steps: receipts,
};

await writeFile(resolve(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({ outputDir, ...manifest }, null, 2)}\n`);
if (failed) process.exit(1);
