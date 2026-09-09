import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { applyMemoryUpdate, isCurrentMemoryEligible, resolveCurrentMemory } from "../packages/evaluation/src/memory-lifecycle.js";
import { aggregateLongitudinal, utilityForOutcome, type LongitudinalObservation } from "../packages/evaluation/src/closed-loop.js";
import { BehavioralMemoryEvaluationSchema } from "../packages/evaluation/src/memory-evaluation.js";
import { ExecutionMemorySchema, type ExecutionMemory } from "../packages/memory-core/src/execution-memory.js";
import { materializeMemorySlice } from "../packages/experience/src/formation.js";

const seedValues = (process.env.ENGRAM_LONGITUDINAL_SEEDS ?? "11,23,47").split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value >= 0);
const uuid = () => randomUUID();

function makeMemory(agentId: string, context: Record<string, unknown>, id = uuid()): ExecutionMemory {
  return ExecutionMemorySchema.parse({
    id,
    agentId,
    memoryType: "TOOL_RECOVERY",
    summary: "Use Tool B with bounded retries after Tool A rate limits under high load.",
    sourceCandidateMemoryId: uuid(),
    sourceExperienceIds: [uuid()],
    sourceEpisodeIds: [uuid()],
    applicability: context,
    confidence: 0.7,
    evidenceState: "SIMULATED",
    state: "ADMITTED",
    admittedAt: new Date("2026-09-09T00:00:00Z"),
    updatedAt: new Date("2026-09-09T00:00:00Z"),
  });
}

function evaluate(memory: ExecutionMemory, directive: "STRENGTHEN" | "QUALIFY", executionId: string, outcome: "SUCCESS" | "FAILURE") {
  return BehavioralMemoryEvaluationSchema.parse({
    id: uuid(),
    executionMemoryId: memory.id,
    memorySliceId: uuid(),
    influenceGrantId: uuid(),
    influencedExecutionId: executionId,
    influencedDecisionId: uuid(),
    effect: outcome === "SUCCESS" ? "BENEFICIAL" : "HARMFUL",
    effectScore: outcome === "SUCCESS" ? 0.8 : -0.8,
    actionChanged: true,
    treatmentAction: { tool: "tool-b" },
    treatmentOutcome: outcome,
    updateDirective: directive,
    rationale: `${directive} after observed ${outcome} outcome.`,
    evidenceState: "SIMULATED",
    evaluatedAt: new Date("2026-09-09T01:00:00Z"),
  });
}

function chooseTool(versions: ExecutionMemory[], context: Record<string, unknown>): { tool: string; influenced: boolean; memoryId?: string } {
  const current = resolveCurrentMemory(versions);
  if (current && isCurrentMemoryEligible({ memory: current, versions, context })) {
    return { tool: "tool-b", influenced: true, memoryId: current.id };
  }
  return { tool: "tool-a", influenced: false };
}

function observation(input: Omit<LongitudinalObservation, "utility"> & { outcome: LongitudinalObservation["outcome"]; costPenalty?: number }): LongitudinalObservation {
  const { costPenalty, ...rest } = input;
  return { ...rest, utility: utilityForOutcome({ outcome: input.outcome, costPenalty }) };
}

async function runTool(seed: number): Promise<{ observations: LongitudinalObservation[]; update: unknown; rehabilitation: boolean }> {
  const observations: LongitudinalObservation[] = [];
  const high = { workflowType: "tool_recovery", taskType: "fetch", toolId: "tool-a", workloadClass: "high", urgency: "routine", requestVolume: "high" };
  const low = { ...high, workloadClass: "low", requestVolume: "low" };
  observations.push(observation({ runId: `tool-${seed}`, executionId: uuid(), arm: "A0_NO_MEMORY", seed, action: { tool: "tool-a" }, outcome: "FAILURE", influenced: false, unauthorizedAttempts: 1, unauthorizedEscapes: 0 }));
  observations.push(observation({ runId: `tool-${seed}`, executionId: uuid(), arm: "A1_RAW_HISTORY", seed, action: { tool: "tool-b" }, outcome: "SUCCESS", influenced: false, costPenalty: 0.15, unauthorizedAttempts: 0, unauthorizedEscapes: 0 }));
  let versions = [makeMemory("agent-a", { workloadClass: "high", requestVolume: "high" })];
  const e2 = uuid();
  const action2 = chooseTool(versions, high);
  observations.push(observation({ runId: `tool-${seed}`, executionId: e2, arm: "A2_INITIAL_ENGRAM_MEMORY", seed, action: action2, outcome: action2.tool === "tool-b" ? "SUCCESS" : "FAILURE", influenced: action2.influenced, memoryId: action2.memoryId, costPenalty: 0.1, unauthorizedAttempts: 0, unauthorizedEscapes: 0 }));
  const update2 = applyMemoryUpdate({ prior: versions[0]!, evaluation: evaluate(versions[0]!, "STRENGTHEN", e2, "SUCCESS"), newMemoryId: uuid() });
  versions = [versions[0]!, update2.memory];
  const e3 = uuid();
  const action3 = chooseTool(versions, low);
  observations.push(observation({ runId: `tool-${seed}`, executionId: e3, arm: "A3_IRRELEVANT_MEMORY", seed, action: action3, outcome: "SUCCESS", influenced: action3.influenced, memoryId: action3.memoryId, costPenalty: 0.05, unauthorizedAttempts: 0, unauthorizedEscapes: 0 }));
  const update3 = applyMemoryUpdate({ prior: update2.memory, evaluation: evaluate(update2.memory, "QUALIFY", e3, "SUCCESS"), newMemoryId: uuid() });
  versions = [versions[0]!, update2.memory, update3.memory];
  const e4 = uuid();
  const action4 = chooseTool([versions.at(-1)!], { ...high, requestVolume: "unknown" });
  observations.push(observation({ runId: `tool-${seed}`, executionId: e4, arm: "A4_STALE_OR_CONTRADICTORY", seed, action: action4, outcome: "NEUTRAL", influenced: action4.influenced, memoryId: action4.memoryId, unauthorizedAttempts: 0, unauthorizedEscapes: 0 }));
  const e5 = uuid();
  const action5 = chooseTool(versions, high);
  observations.push(observation({ runId: `tool-${seed}`, executionId: e5, arm: "A5_EVALUATED_UPDATED_MEMORY", seed, action: action5, outcome: action5.tool === "tool-b" ? "SUCCESS" : "FAILURE", influenced: action5.influenced, memoryId: action5.memoryId, costPenalty: 0.08, unauthorizedAttempts: 0, unauthorizedEscapes: 0 }));
  return { observations, update: { strengthen: update2.record, qualify: update3.record }, rehabilitation: action3.tool === "tool-a" && action5.tool === "tool-b" };
}

async function runHandoff(seed: number): Promise<{ observations: LongitudinalObservation[]; controls: Record<string, boolean> }> {
  const source = makeMemory("agent-a", { workflowType: "tool_recovery", workloadClass: "high" });
  const slice = materializeMemorySlice({ memory: source, consumerAgentId: "agent-b", consumerExecutionId: uuid(), purpose: "bounded_tool_recovery", subject: "tool-recovery", claims: ["Tool B is a bounded fallback under high load."], evidenceRefs: ["local:agent-a"], expiresAt: new Date("2026-09-10T00:00:00Z") });
  const observations: LongitudinalObservation[] = [];
  const bAction = { tool: "tool-b", sourceMemoryId: source.id };
  const bExecution = uuid();
  observations.push(observation({ runId: `handoff-${seed}`, executionId: bExecution, arm: "A2_INITIAL_ENGRAM_MEMORY", seed, action: bAction, outcome: "SUCCESS", memoryId: source.id, influenced: true, costPenalty: 0.1, unauthorizedAttempts: 0, unauthorizedEscapes: 0 }));
  const updated = applyMemoryUpdate({ prior: source, evaluation: evaluate(source, "STRENGTHEN", bExecution, "SUCCESS"), newMemoryId: uuid() });
  const cCurrent = resolveCurrentMemory([source, updated.memory]);
  const cEligible = cCurrent ? isCurrentMemoryEligible({ memory: cCurrent, versions: [source, updated.memory], context: source.applicability }) : false;
  observations.push(observation({ runId: `handoff-${seed}`, executionId: uuid(), arm: "A5_EVALUATED_UPDATED_MEMORY", seed, action: { tool: "tool-b", sourceMemoryId: cCurrent?.id }, outcome: cEligible ? "SUCCESS" : "FAILURE", memoryId: cCurrent?.id, influenced: cEligible, costPenalty: 0.08, unauthorizedAttempts: 0, unauthorizedEscapes: 0 }));
  return { observations, controls: { rawHistoryNotTransferred: slice.redactedFields.includes("rawHistory"), sourceEventsNotTransferred: slice.redactedFields.includes("sourceEvents"), obsoleteNotInfluential: !isCurrentMemoryEligible({ memory: source, versions: [source, updated.memory], context: source.applicability }), updatedMemoryUsedByC: cEligible } };
}

const observations: LongitudinalObservation[] = [];
const runs: Record<string, unknown>[] = [];
for (const seed of seedValues) {
  const tool = await runTool(seed);
  const handoff = await runHandoff(seed);
  observations.push(...tool.observations, ...handoff.observations);
  runs.push({ seed, tool, handoff });
}
const summary = aggregateLongitudinal(observations);
const output = { schema: "engram.closed-loop-evaluation/v1", generatedAt: new Date().toISOString(), seeds: seedValues, runs, observations, summary, providerContinuity: { externalState: "BLOCKED_FUNDING_BALANCE_ZERO", jobId: "77776", chainId: 8453, jobCreated: true, jobFunded: false, terminalOutcome: "NOT_REACHED", syntheticLocalSequenceOnly: true } };
const dir = join(process.cwd(), "evidence/canonical/longitudinal/latest");
await mkdir(dir, { recursive: true });
await writeFile(join(dir, "summary.json"), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
