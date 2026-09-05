import { EngramRuntime } from "../packages/runtime/src/runtime.js";
import { DEFAULT_RUNTIME_POLICIES } from "../packages/runtime/src/defaults.js";
import { SibylRuntimeStore } from "../packages/sibyl/src/runtime-store.js";
import { fetchAcpJobHistory } from "../packages/virtuals-acp/src/cli.js";
import {
  acpEvidenceToEngramObservation,
  acpHistoryToExecutionEvidence,
} from "../packages/virtuals-acp/src/evidence.js";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string): string {
  const value = flag(name);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function parseDate(name: string): Date | undefined {
  const value = flag(name);
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid --${name}: ${value}`);
  return date;
}

const executionId = required("execution-id");
const jobId = required("job-id");
const chainId = Number(required("chain-id"));
const providerId = required("provider-id");
const taskType = required("task-type");
const urgency = required("urgency").toUpperCase();
const expectedLatency = flag("expected-latency-seconds");
const testnet = process.argv.includes("--testnet");

if (!Number.isInteger(chainId) || chainId <= 0) throw new Error("--chain-id must be a positive integer");
if (urgency !== "URGENT" && urgency !== "ROUTINE") throw new Error("--urgency must be URGENT or ROUTINE");

const history = await fetchAcpJobHistory({ jobId, chainId, testnet });
const evidence = acpHistoryToExecutionEvidence(history, {
  providerId,
  taskType,
  urgency,
  expectedLatencySeconds: expectedLatency === undefined ? undefined : Number(expectedLatency),
  startedAt: parseDate("started-at"),
  completedAt: parseDate("completed-at"),
});

const runtime = new EngramRuntime(new SibylRuntimeStore(), DEFAULT_RUNTIME_POLICIES);
await runtime.observe({
  executionId,
  ...acpEvidenceToEngramObservation(evidence),
});

process.stdout.write(`${JSON.stringify({
  phase: "virtuals-acp-ingest",
  executionId,
  jobId: evidence.jobId,
  chainId: evidence.chainId,
  protocol: evidence.protocol,
  status: evidence.status,
  providerId: evidence.providerId,
  taskType: evidence.taskType,
  urgency: evidence.urgency,
  failureType: evidence.failureType ?? null,
  observedLatencySeconds: evidence.observedLatencySeconds ?? null,
  evidenceState: evidence.evidenceState,
  memoryBackend: "sibyl-memory-client",
  partnerClaim: "UNVERIFIED_UNTIL_REAL_ACP_JOB_EVIDENCE_IS_RETAINED",
}, null, 2)}\n`);
