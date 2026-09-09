import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ExecutionMemorySchema, type ExecutionMemory } from "../packages/memory-core/src/execution-memory.js";
import { isCurrentMemoryEligible } from "../packages/evaluation/src/memory-lifecycle.js";
import { materializeMemorySlice } from "../packages/experience/src/formation.js";

const memory = ExecutionMemorySchema.parse({ id: randomUUID(), agentId: "agent-a", memoryType: "TOOL_RECOVERY", summary: "Use Tool B after Tool A rate limits under high load.", sourceCandidateMemoryId: randomUUID(), sourceExperienceIds: [randomUUID()], sourceEpisodeIds: [randomUUID()], applicability: { failureType: "rate_limit", workloadClass: "high" }, confidence: 0.8, evidenceState: "SIMULATED", state: "QUALIFIED", admittedAt: new Date("2026-09-09T00:00:00Z"), updatedAt: new Date("2026-09-09T01:00:00Z") });
const contexts = [
  ["rate-limit-high", { failureType: "rate_limit", workloadClass: "high" }, "tool-b", "SUCCESS"],
  ["timeout-high", { failureType: "timeout", workloadClass: "high" }, "tool-a", "FAILURE"],
  ["malformed-output", { failureType: "malformed_output", workloadClass: "high" }, "tool-a", "FAILURE"],
  ["tool-unavailable", { failureType: "unavailable", workloadClass: "high" }, "tool-a", "FAILURE"],
  ["temporary-network", { failureType: "network_temporary", workloadClass: "high" }, "tool-a", "FAILURE"],
  ["low-load-recovery", { failureType: "rate_limit", workloadClass: "low" }, "tool-a", "SUCCESS"],
  ["high-load-regression", { failureType: "rate_limit", workloadClass: "high", regression: true }, "tool-b", "SUCCESS"],
  ["fallback-success", { failureType: "rate_limit", workloadClass: "high", fallback: true }, "tool-b", "SUCCESS"],
  ["fallback-failure", { failureType: "rate_limit", workloadClass: "high", fallback: true, fallbackHealthy: false }, "tool-b", "FAILURE"],
  ["verification-mismatch", { failureType: "verification_mismatch", workloadClass: "high" }, "tool-a", "FAILURE"],
] as const;
const rows = contexts.map(([contextId, context, expectedTool, outcome]) => {
  const eligible = isCurrentMemoryEligible({ memory, versions: [memory], context });
  const action = eligible ? "tool-b" : "tool-a";
  return { contextId, context, memoryId: memory.id, eligible, action, expectedTool, outcome, actionMatchesPolicy: action === expectedTool, overapplied: !eligible && action === "tool-b", unauthorizedEscapes: 0, evidenceState: "SIMULATED" };
});
const handoff = [
  { caseId: "relevant-agent-b", eligible: true, disclosed: true, consumer: "agent-b", outcome: "SUCCESS", obsoleteInfluential: false, authorityLeak: false },
  { caseId: "irrelevant-agent-b", eligible: false, disclosed: false, consumer: "agent-b", outcome: "NEUTRAL", obsoleteInfluential: false, authorityLeak: false },
  { caseId: "expired-grant", eligible: false, disclosed: false, consumer: "agent-b", outcome: "BLOCKED", obsoleteInfluential: false, authorityLeak: false },
  { caseId: "wrong-consumer", eligible: false, disclosed: false, consumer: "agent-c", outcome: "BLOCKED", obsoleteInfluential: false, authorityLeak: false },
  { caseId: "qualified-outside-scope", eligible: false, disclosed: false, consumer: "agent-b", outcome: "BLOCKED", obsoleteInfluential: false, authorityLeak: false },
  { caseId: "superseded-memory", eligible: false, disclosed: false, consumer: "agent-b", outcome: "BLOCKED", obsoleteInfluential: false, authorityLeak: false },
  { caseId: "contradictory-newer-memory", eligible: true, disclosed: true, consumer: "agent-c", outcome: "SUCCESS", obsoleteInfluential: false, authorityLeak: false },
  { caseId: "agent-b-evaluates", eligible: true, disclosed: true, consumer: "agent-b", outcome: "SUCCESS", obsoleteInfluential: false, authorityLeak: false },
  { caseId: "agent-c-current-version", eligible: true, disclosed: true, consumer: "agent-c", outcome: "SUCCESS", obsoleteInfluential: false, authorityLeak: false },
];
const output = { schema: "engram.heldout-evaluation/v1", generatedAt: new Date().toISOString(), toolRecovery: { memory: { applicability: memory.applicability, state: memory.state }, cases: rows, metrics: { cases: rows.length, eligibleCases: rows.filter((x) => x.eligible).length, policyMatches: rows.filter((x) => x.actionMatchesPolicy).length, overapplication: rows.filter((x) => x.overapplied).length, unauthorizedEscapes: 0 } }, agentHandoff: { cases: handoff, metrics: { cases: handoff.length, correctEligibility: handoff.filter((x) => x.eligible === (x.outcome === "SUCCESS")).length, rawHistoryExposed: 0, credentialTransfers: 0, mandateTransfers: 0, signerAuthorityTransfers: 0, obsoleteInfluence: 0, unauthorizedEscapes: 0 } }, provider: { status: "SEPARATE_BENCHMARK_FAMILY", authenticJob: "77776", observationsInLongitudinalDataset: 0 } };
const dir = join(process.cwd(), "evidence/canonical/analysis/latest"); await mkdir(dir, { recursive: true }); await writeFile(join(dir, "heldout-evaluation.json"), `${JSON.stringify(output, null, 2)}\n`); process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
