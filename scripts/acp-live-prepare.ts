import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { AcpCatalogCandidateSchema, prepareAcpExecution, verifyFrozenAcpContract } from "../packages/virtuals-acp/src/orchestration.js";

const catalogDir = resolve(process.env.ENGRAM_ACP_CATALOG_DIR ?? "evidence/virtuals/catalog/20260907T062655Z");
const manifestPath = join(catalogDir, "manifest.json");
const rawPath = join(catalogDir, "raw/browse-financial-data.json");
const normalizedPath = join(catalogDir, "normalized-candidates.json");
const contractPath = join(catalogDir, "live-benchmark-contract-draft.json");
const [manifest, rawBytes, normalized, contract] = await Promise.all([
  readJson(manifestPath),
  readFile(rawPath),
  readJson(normalizedPath),
  readJson(contractPath),
]);
const rawDigest = createHash("sha256").update(rawBytes).digest("hex");
if (rawDigest !== manifest.raw.sha256 || rawDigest !== manifest.frozenCandidateSet.snapshotDigest || rawDigest !== contract.catalogSnapshot.digest) {
  throw new Error("ACP_FROZEN_CATALOG_DIGEST_MISMATCH");
}
const normalizedDigest = createHash("sha256").update(await readFile(normalizedPath)).digest("hex");
if (normalizedDigest !== manifest.normalized.sha256) throw new Error("ACP_NORMALIZED_CATALOG_DIGEST_MISMATCH");
const frozenCandidates = normalized.candidates.map((candidate: any) => AcpCatalogCandidateSchema.parse({
  candidateKey: candidate.candidateKey,
  agentId: candidate.agentId,
  offeringId: candidate.offeringId,
  priceUsdc: candidate.price,
  slaMinutes: candidate.slaMinutes,
}));
const contractCandidates = contract.candidates.map((candidate: any) => AcpCatalogCandidateSchema.parse({
  candidateKey: candidate.candidateKey,
  agentId: candidate.agentId,
  offeringId: candidate.offeringId,
  priceUsdc: candidate.priceUsdc,
  slaMinutes: candidate.slaMinutes,
}));
verifyFrozenAcpContract({
  frozenCandidates,
  contractCandidates,
  maximumSpendUsdc: contract.constraints.maximumSpendUsdc,
  maximumLatencySeconds: contract.constraints.maximumLatencySeconds,
});
const selected = contractCandidates[0]!;
const prepared = prepareAcpExecution({
  plan: {
    arm: "A0",
    taskId: contract.task.taskId,
    taskVersion: contract.task.taskVersion,
    input: contract.task.input,
    candidateKey: selected.candidateKey,
    agentId: selected.agentId,
    offeringId: selected.offeringId,
    chainId: 8453,
    maximumSpendUsdc: contract.constraints.maximumSpendUsdc,
    expectedLatencySeconds: contract.constraints.maximumLatencySeconds,
    catalogSnapshot: { manifest: contract.catalogSnapshot.manifest, digest: contract.catalogSnapshot.digest },
    signerPolicy: "ACP_ONLY",
  },
  frozenCatalog: { manifest: contract.catalogSnapshot.manifest, digest: rawDigest },
});
const prospectiveRequests = contractCandidates.map((candidate: any) => ({
  candidateKey: candidate.candidateKey,
  method: "ACP_JOB_CREATE",
  command: ["acp", "job", "create", "--agent-id", candidate.agentId, "--offering-id", candidate.offeringId, "--chain-id", "8453", "--input-json", JSON.stringify(contract.task.input), "--json"],
  request: { agentId: candidate.agentId, offeringId: candidate.offeringId, chainId: 8453, input: contract.task.input },
  maximumSpendUsdc: candidate.priceUsdc,
  wouldRequire: ["ACP_SIGNER", "JOB_CREATION_AUTHORIZATION"],
  executed: false,
}));
const stamp = (process.env.ENGRAM_ACP_PREPARE_TIMESTAMP ?? new Date().toISOString()).replace(/[:.]/g, "-");
const outputDir = resolve(process.env.ENGRAM_ACP_PREPARE_DIR ?? join(process.cwd(), "evidence/virtuals/live-preparation", stamp));
await mkdir(outputDir, { recursive: true });
const a0Plan = {
  schema: "engram.virtuals.a0-execution-contract/v1",
  state: "A0_PREPARED",
  task: contract.task,
  candidateSet: contractCandidates,
  candidateSnapshotDigest: rawDigest,
  candidateOrdering: contractCandidates.map((candidate: any) => candidate.candidateKey),
  maximumSpendUsdc: contract.constraints.maximumSpendUsdc,
  maximumLatencySeconds: contract.constraints.maximumLatencySeconds,
  verificationCriteria: contract.verification,
  model: { ...contract.model, identity: "qwen2.5-7b-4k:latest", temperature: 0 },
  tools: { set: ["acp_catalog_snapshot", "acp_job_history"], capabilities: contract.constraints.sameToolsAndCapabilities },
  mandate: { signerPolicy: "ACP_ONLY", text: "Use only the frozen candidate set; no parallel jobs; one bounded smoke request maximum." },
  utility: contract.utility,
  fallbackBehavior: { beforeAuthorization: "STOP", afterTerminalFailure: "record evidence; do not silently substitute candidates" },
  a2TreatmentProtocol: { status: "DEFINED_NOT_READY", freshProcess: true, sameTaskFamily: true, sameCandidateUniverse: true, requiresAuthenticAdmittedA0Memory: true },
};
const authorizationRequirements = {
  schema: "engram.virtuals.authorization-requirements/v1",
  requiredFor: ["ACP_JOB_CREATE", "ACP_JOB_FUND", "ACP_SIGNING", "BASE_FUNDS_MOVEMENT"],
  signerPolicy: "ACP_ONLY",
  maximumSpendUsdc: contract.constraints.maximumSpendUsdc,
  noSecretsIncluded: true,
  currentAuthorization: "NOT_AUTHORIZED",
};
const bundleManifest = {
  schema: "engram.virtuals.live-preparation/v1",
  evidenceState: "PREPARED_UNAUTHORIZED",
  catalogSnapshot: { manifest: contract.catalogSnapshot.manifest, rawDigest, normalizedDigest },
  sourceFiles: { manifest: "manifest.json", candidateSnapshot: "candidate-snapshot.json", contract: "live-benchmark-contract-draft.json" },
  outputs: { a0Plan: "a0-plan.json", authorizationRequirements: "authorization-requirements.json" },
  prospectiveRequests: prospectiveRequests.map((request: any) => ({ ...request, executed: false })),
  sideEffects: { jobCreated: false, jobFunded: false, signerInvoked: false, baseInvoked: false, fundsMoved: false },
  stopGate: "A0_PREPARED",
};
await Promise.all([
  writeJson(join(outputDir, "manifest.json"), bundleManifest),
  writeJson(join(outputDir, "candidate-snapshot.json"), { source: normalizedPath, digest: rawDigest, candidates: normalized.candidates }),
  writeJson(join(outputDir, "a0-plan.json"), a0Plan),
  writeJson(join(outputDir, "authorization-requirements.json"), authorizationRequirements),
  writeJson(join(outputDir, "live-benchmark-contract-draft.json"), contract),
]);
process.stdout.write(`${JSON.stringify({ outputDir, state: prepared.state, maximumSpendUsdc: contract.constraints.maximumSpendUsdc, signerAuthorityRequired: true, sideEffects: bundleManifest.sideEffects }, null, 2)}\n`);

async function readJson(path: string): Promise<any> { return JSON.parse(await readFile(path, "utf8")); }
async function writeJson(path: string, value: unknown): Promise<void> { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
