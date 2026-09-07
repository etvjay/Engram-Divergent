import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, mkdir, copyFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, execFileSync } from "node:child_process";
import { admitCandidateMemory, formExecutionEpisode } from "../../packages/experience/src/formation.js";
import { CandidateMemorySchema } from "../../packages/memory-core/src/candidate-memory.js";

const fixturePath = resolve(process.cwd(), "tests/fixtures/virtuals-acp/completed-job-history.json");
const tsx = resolve(process.cwd(), "node_modules/.bin/tsx");
const describeSibyl = process.env.ENGRAM_SIBYL_TEST_REQUIRED === "1" ? describe : describe.skip;

function runProcess(script: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(tsx, [script, ...args], { env, encoding: "utf8", timeout: 60_000 });
  if (result.status !== 0) throw new Error(`${script} failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

describeSibyl("ACP evidence to durable Sibyl behavioral memory", () => {
  it("survives a real process boundary and authorizes only bounded future influence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "engram-acp-learning-"));
    const db = join(dir, "memory.db");
    const state = join(dir, "state.json");
    const env = { ...process.env, ENGRAM_SIBYL_DB: db, ENGRAM_SIBYL_TENANT: "acp-learning-fixture" };
    try {
      const processA = runProcess("scripts/acp-learning-process-a.ts", ["--fixture", fixturePath, "--source-ref", "tests/fixtures/virtuals-acp/completed-job-history.json", "--out", state], env);
      expect(processA.normalization.evidenceState).toBe("OBSERVED");
      expect(processA.completion.status).toBe("SUCCESS");
      expect(processA.admission.status).toBe("ADMITTED");
      expect(processA.executionMemoryId).toMatch(/^[0-9a-f-]{36}$/);
      expect(processA.lineageIds.episodeId).toMatch(/^[0-9a-f-]{36}$/);

      const processB = runProcess("scripts/acp-learning-process-b.ts", ["--state", state, "--out", join(dir, "future.json")], env);
      expect(processB.processBoundary.sourceProcessCompleted).toBe(true);
      expect(processB.processBoundary.freshRuntime).toBe(true);
      expect(processB.recall.memoryFound).toBe(true);
      expect(processB.recall.applicable).toBe(true);
      expect(processB.recall.eligible).toBe(true);
      expect(processB.positiveAuthorization).toBe("AUTHORIZED");
      expect(processB.negativeAuthorization).toMatch(/^REJECTED/);
      expect(processB.unauthorizedInfluenceEscapes).toBe(0);
      expect(processB.lineageValidation).toEqual([]);
      expect(processB.evidenceRefs).toContain("tests/fixtures/virtuals-acp/completed-job-history.json");

      const ledgerObservation = JSON.parse(await readFile(join(dir, "future.json"), "utf8"));
      expect(ledgerObservation.sourceEvidencePath).toBe("tests/fixtures/virtuals-acp/completed-job-history.json");
      expect(ledgerObservation.ids.executionMemoryId).toBe(processA.executionMemoryId);
      const evidenceStamp = new Date().toISOString().replace(/[:.]/g, "-");
      const evidenceDir = join(process.cwd(), "evidence/evals/acp-to-sibyl", evidenceStamp);
      await mkdir(evidenceDir, { recursive: true });
      await copyFile(state, join(evidenceDir, "process-a.json"));
      await copyFile(join(dir, "future.json"), join(evidenceDir, "process-b.json"));
      await writeFile(join(evidenceDir, "manifest.json"), `${JSON.stringify({
        schema: "engram.acp-to-sibyl-durable-learning/v1",
        evidenceState: "LOCAL_PASS",
        sourceEvidencePath: "tests/fixtures/virtuals-acp/completed-job-history.json",
        processA: "process-a.json",
        processB: "process-b.json",
        executionMemoryId: processA.executionMemoryId,
        memorySliceId: ledgerObservation.ids.memorySliceId,
        influenceGrantId: ledgerObservation.ids.influenceGrantId,
        testedGitSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).trim(),
      }, null, 2)}\n`, "utf8");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("fails closed on missing outcome, mismatched execution, and invalid chronology", () => {
    const base = {
      execution: {
        id: "10000000-0000-4000-8000-000000000001",
        agentId: "agent",
        workflowType: "provider_selection",
        intent: "test",
        context: {},
        constraints: {},
        status: "SUCCESS",
        startedAt: new Date("2026-09-07T00:00:00Z"),
        completedAt: new Date("2026-09-07T00:01:00Z"),
      },
      events: [],
      evidenceRefs: ["fixture"],
      evidenceState: "OBSERVED" as const,
    };
    expect(() => formExecutionEpisode({ ...base, outcome: undefined as never })).toThrow("EXECUTION_OUTCOME_REQUIRED");
    expect(() => formExecutionEpisode({ ...base, outcome: { id: "10000000-0000-4000-8000-000000000002", executionId: "10000000-0000-4000-8000-000000000003", status: "SUCCESS", summary: "bad", result: {}, evidenceState: "OBSERVED" } })).toThrow("EXECUTION_OUTCOME_ID_MISMATCH");
    expect(() => formExecutionEpisode({ ...base, evidenceRefs: [], outcome: { id: "10000000-0000-4000-8000-000000000002", executionId: base.execution.id, status: "SUCCESS", summary: "ok", result: {}, evidenceState: "OBSERVED" } })).toThrow("EXECUTION_EVIDENCE_REQUIRED");
    expect(() => formExecutionEpisode({ ...base, outcome: { id: "10000000-0000-4000-8000-000000000002", executionId: base.execution.id, status: "SUCCESS", summary: "ok", result: {}, evidenceState: "OBSERVED" }, events: [{ id: "10000000-0000-4000-8000-000000000004", executionId: base.execution.id, sequenceNo: 1, eventType: "x", payload: {}, evidenceState: "OBSERVED", occurredAt: new Date("2026-09-07T00:00:10Z") }] })).toThrow("EXECUTION_EVENT_SEQUENCE_INVALID");
    expect(() => formExecutionEpisode({ ...base, outcome: { id: "10000000-0000-4000-8000-000000000002", executionId: base.execution.id, status: "SUCCESS", summary: "ok", result: {}, evidenceState: "OBSERVED" }, events: [{ id: "10000000-0000-4000-8000-000000000004", executionId: base.execution.id, sequenceNo: 0, eventType: "x", payload: {}, evidenceState: "OBSERVED", occurredAt: new Date("2026-09-07T00:00:30Z") }, { id: "10000000-0000-4000-8000-000000000005", executionId: base.execution.id, sequenceNo: 1, eventType: "y", payload: {}, evidenceState: "OBSERVED", occurredAt: new Date("2026-09-07T00:00:10Z") }] })).toThrow("EXECUTION_EVENT_CHRONOLOGY_INVALID");
  });

  it("does not admit a low-confidence candidate", () => {
    const candidate = CandidateMemorySchema.parse({
      id: "10000000-0000-4000-8000-000000000010",
      agentId: "agent",
      memoryType: "TEST",
      summary: "weak observation",
      sourceExperienceIds: ["10000000-0000-4000-8000-000000000011"],
      sourceEpisodeIds: ["10000000-0000-4000-8000-000000000012"],
      applicability: {},
      proposedInfluence: ["provider_selection"],
      confidence: 0.2,
      evidenceState: "OBSERVED",
      status: "CANDIDATE",
      proposedAt: new Date(),
    });
    const decision = admitCandidateMemory({ candidate, reason: "insufficient confidence" });
    expect(decision.status).toBe("REJECTED");
    expect(decision.reason).toBe("CONFIDENCE_BELOW_ADMISSION_THRESHOLD");
  });
});
