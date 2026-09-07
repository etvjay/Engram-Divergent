import { createHash } from "node:crypto";
import { z } from "zod";

export const AcpLifecycleStateSchema = z.enum([
  "CATALOG_FROZEN",
  "A0_PREPARED",
  "A0_AUTHORIZED",
  "A0_JOB_CREATED",
  "A0_FUNDED",
  "A0_TERMINAL",
  "A0_INGESTED",
  "A0_MEMORY_ADMITTED",
  "A2_FRESH_PROCESS_READY",
  "A2_PREPARED",
  "A2_AUTHORIZED",
  "A2_JOB_CREATED",
  "A2_FUNDED",
  "A2_TERMINAL",
  "A2_INGESTED",
  "EVALUATED",
]);
export type AcpLifecycleState = z.infer<typeof AcpLifecycleStateSchema>;

export const AcpCatalogSnapshotSchema = z.object({
  manifest: z.string().min(1),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type AcpCatalogSnapshot = z.infer<typeof AcpCatalogSnapshotSchema>;

export const AcpExecutionPlanSchema = z.object({
  arm: z.enum(["A0", "A2"]),
  taskId: z.string().min(1),
  taskVersion: z.number().int().positive(),
  input: z.record(z.string(), z.unknown()),
  candidateKey: z.string().min(1),
  agentId: z.string().min(1),
  offeringId: z.string().min(1),
  chainId: z.number().int().positive(),
  maximumSpendUsdc: z.number().nonnegative(),
  expectedLatencySeconds: z.number().positive(),
  catalogSnapshot: AcpCatalogSnapshotSchema,
  signerPolicy: z.literal("ACP_ONLY"),
});
export type AcpExecutionPlan = z.infer<typeof AcpExecutionPlanSchema>;

export const AcpOrchestrationRecordSchema = z.object({
  state: AcpLifecycleStateSchema,
  plan: AcpExecutionPlanSchema,
  authorizationRequired: z.boolean(),
  sideEffectOccurred: z.boolean(),
  jobId: z.string().optional(),
  receiptRef: z.string().optional(),
});
export type AcpOrchestrationRecord = z.infer<typeof AcpOrchestrationRecordSchema>;

export function catalogSnapshotFromBytes(input: { manifest: string; bytes: Uint8Array }): AcpCatalogSnapshot {
  return AcpCatalogSnapshotSchema.parse({
    manifest: input.manifest,
    digest: createHash("sha256").update(input.bytes).digest("hex"),
  });
}

export function prepareAcpExecution(input: {
  plan: AcpExecutionPlan;
  frozenCatalog: AcpCatalogSnapshot;
}): AcpOrchestrationRecord {
  const plan = AcpExecutionPlanSchema.parse(input.plan);
  const frozenCatalog = AcpCatalogSnapshotSchema.parse(input.frozenCatalog);
  if (plan.catalogSnapshot.digest !== frozenCatalog.digest) throw new Error("ACP_CATALOG_SNAPSHOT_MISMATCH");
  if (plan.catalogSnapshot.manifest !== frozenCatalog.manifest) throw new Error("ACP_CATALOG_MANIFEST_MISMATCH");
  if (plan.maximumSpendUsdc > 0.03) throw new Error("ACP_MAXIMUM_SPEND_EXCEEDED");
  if (plan.arm !== "A0") throw new Error("ACP_PREPARE_LIVE_READINESS_ONLY_A0");
  return {
    state: "A0_PREPARED",
    plan,
    authorizationRequired: true,
    sideEffectOccurred: false,
  };
}

export function authorizeAcpExecution(record: AcpOrchestrationRecord, authorization: { approved: boolean; scope: "A0_JOB_CREATION" }): AcpOrchestrationRecord {
  assertState(record, "A0_PREPARED");
  if (!authorization.approved || authorization.scope !== "A0_JOB_CREATION") throw new Error("ACP_ECONOMIC_AUTHORIZATION_REQUIRED");
  return { ...record, state: "A0_AUTHORIZED" };
}

export function createAcpJob(record: AcpOrchestrationRecord, job: { jobId: string }): AcpOrchestrationRecord {
  assertState(record, "A0_AUTHORIZED");
  if (!job.jobId) throw new Error("ACP_JOB_ID_REQUIRED");
  return { ...record, state: "A0_JOB_CREATED", jobId: job.jobId, sideEffectOccurred: true };
}

export function fundAcpJob(record: AcpOrchestrationRecord, receiptRef: string): AcpOrchestrationRecord {
  assertState(record, "A0_JOB_CREATED");
  if (!receiptRef) throw new Error("ACP_FUNDING_RECEIPT_REQUIRED");
  return { ...record, state: "A0_FUNDED", receiptRef, sideEffectOccurred: true };
}

export function observeAcpJob(record: AcpOrchestrationRecord, terminal: boolean): AcpOrchestrationRecord {
  assertState(record, "A0_FUNDED");
  if (!terminal) throw new Error("ACP_JOB_NOT_TERMINAL");
  return { ...record, state: "A0_TERMINAL" };
}

export function ingestAcpOutcome(record: AcpOrchestrationRecord): AcpOrchestrationRecord {
  assertState(record, "A0_TERMINAL");
  return { ...record, state: "A0_INGESTED" };
}

function assertState(record: AcpOrchestrationRecord, expected: AcpLifecycleState): void {
  if (record.state !== expected) throw new Error(`ACP_INVALID_STATE:${record.state}:expected=${expected}`);
}
