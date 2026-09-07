import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AcpExecutionPlanSchema, prepareAcpExecution } from "../packages/virtuals-acp/src/orchestration.js";

const catalogDir = resolve(process.env.ENGRAM_ACP_CATALOG_DIR ?? "evidence/virtuals/catalog/20260907T062655Z");
const draft = JSON.parse(await readFile(resolve(catalogDir, "live-benchmark-contract-draft.json"), "utf8")) as Record<string, any>;
const manifest = JSON.parse(await readFile(resolve(catalogDir, "manifest.json"), "utf8")) as Record<string, any>;
const candidate = draft.candidates[0];
const plan = AcpExecutionPlanSchema.parse({
  arm: "A0",
  taskId: draft.task.taskId,
  taskVersion: draft.task.taskVersion,
  input: draft.task.input,
  candidateKey: candidate.candidateKey,
  agentId: candidate.agentId,
  offeringId: candidate.offeringId,
  chainId: 8453,
  maximumSpendUsdc: draft.constraints.maximumSpendUsdc,
  expectedLatencySeconds: draft.constraints.maximumLatencySeconds,
  catalogSnapshot: { manifest: draft.catalogSnapshot.manifest, digest: draft.catalogSnapshot.digest },
  signerPolicy: "ACP_ONLY",
});
const prepared = prepareAcpExecution({
  plan,
  frozenCatalog: { manifest: draft.catalogSnapshot.manifest, digest: manifest.frozenCandidateSet.snapshotDigest },
});
const output = {
  schema: "engram.virtuals-acp-live-readiness/v1",
  evidenceState: "LOCAL_PASS",
  state: prepared.state,
  prepared,
  sideEffects: { jobCreated: false, jobFunded: false, baseTransaction: false, fundsMoved: false },
  stopGate: "A0_PREPARED",
};
const out = process.env.ENGRAM_ACP_PREPARED_OUT;
if (out) await writeFile(resolve(out), `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
