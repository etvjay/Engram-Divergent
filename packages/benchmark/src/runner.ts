import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  AgentDecisionProposalSchema,
  assertAgentProposalAuthorizedByGrant,
  type AgentDecisionProposal,
} from "../../runtime/src/agent-decision.js";
import {
  BenchmarkTrialSchema,
  calculateUtility,
  compareControlAndEngram,
  type BenchmarkArm,
  type BenchmarkTrial,
  type EvidenceMaturity,
  type PairedBenchmarkResult,
  type UtilityComponents,
} from "../../evaluation/src/benchmark.js";
import {
  materializeArmMemory,
  scenarioCandidates,
  type BenchmarkScenario,
} from "./scenario.js";
import type { ModelAdapter, ModelDecisionRequest } from "./model-adapter.js";
import type { BenchmarkManifest } from "./result-writer.js";

export type AuthorizationDecision =
  | "AUTHORIZED"
  | "REJECTED_NO_ELIGIBLE_GRANT"
  | "REJECTED_EFFECT_NOT_ALLOWED"
  | "REJECTED_STALE_OR_EXPIRED"
  | "REJECTED_INVALID_CITATION"
  | "REJECTED_OTHER";

export type ExecutionDisposition = "EXECUTED" | "BLOCKED" | "DETERMINISTIC_FALLBACK";

export interface BenchmarkAggregate {
  model: string;
  scenarioId: string;
  nPairs: number;
  meanDeltaU: number;
  medianDeltaU: number;
  minDeltaU: number;
  maxDeltaU: number;
  beneficialPairCount: number;
  equalPairCount: number;
  harmfulPairCount: number;
  beneficialPairRate: number;
  harmfulPairRate: number;
  a0SuccessRate: number;
  a2SuccessRate: number;
  a0ConsequentialActionDistribution: Record<string, number>;
  a2ConsequentialActionDistribution: Record<string, number>;
  unauthorizedInfluenceAttempts: number;
  unauthorizedInfluenceEscapes: number;
  byArm: Record<string, { unauthorizedInfluenceAttempts: number; unauthorizedInfluenceEscapes: number }>;
  bootstrapSeed: number;
  bootstrap95: { lower: number; upper: number; resamples: number };
}

export interface RepeatedBenchmarkRunOptions extends BenchmarkRunOptions {
  repetitions?: number;
  bootstrapSeed?: number;
  bootstrapResamples?: number;
}

export interface RepeatedBenchmarkRunResult {
  runId: string;
  testedGitSha: string;
  manifest: BenchmarkManifest;
  trials: BenchmarkTrial[];
  pairs: PairedBenchmarkResult[];
  evidence: Array<Record<string, unknown>>;
  aggregate: BenchmarkAggregate;
}

export interface BenchmarkRunOptions {
  scenario: BenchmarkScenario;
  adapter: ModelAdapter;
  /** Defaults to LOCAL_PASS. Claims above LOCAL require confirmExternalExecution. */
  evidenceMaturity?: EvidenceMaturity;
  /** Required to be true when evidenceMaturity is TESTNET_PASS or LIVE_PASS. */
  confirmExternalExecution?: boolean;
  runId?: string;
  repoRoot?: string;
  now?: Date;
  /** Stable pair identifier for repeated matched runs. */
  pairId?: string;
}

export interface BenchmarkRunResult {
  runId: string;
  testedGitSha: string;
  manifest: BenchmarkManifest;
  trials: BenchmarkTrial[];
  pairs: PairedBenchmarkResult[];
  evidence: Array<Record<string, unknown>>;
}

/** Executable terms that actually alter execution; everything else is explanation. */
const CANONICAL_ACTION_KEYS = [
  "provider",
  "prepayFraction",
  "milestoneVerification",
  "timeoutSeconds",
  "retryLimit",
];

/**
 * Projects a proposedAction onto its executable terms. Two actions with equal
 * canonical projections are behaviorally identical regardless of explanatory
 * fields, citation lists, or effect wording.
 */
export function canonicalExecutionAction(
  action: Record<string, unknown>,
  extraExecutableKeys: string[] = [],
): Record<string, unknown> {
  const keys = new Set<string>([...CANONICAL_ACTION_KEYS, ...extraExecutableKeys]);
  const canonical: Record<string, unknown> = {};
  for (const key of Object.keys(action).sort()) {
    if (keys.has(key) && action[key] !== undefined) canonical[key] = action[key];
  }
  return canonical;
}

export function resolveGitSha(repoRoot: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot }).toString().trim();
  } catch {
    return "unknown";
  }
}

/**
 * Evidence-provenance gate: recorded SHAs are only meaningful if the code that
 * produced the results is exactly the committed tree. Untracked files (result
 * bundles, evidence) are ignored; any tracked modification blocks the run.
 */
export function assertCleanGitTree(repoRoot: string): void {
  const status = execFileSync("git", ["status", "--porcelain", "-uno"], { cwd: repoRoot })
    .toString()
    .trim();
  if (status) {
    throw new Error(
      `BENCHMARK_DIRTY_GIT_TREE: commit all tracked changes before recording evidence:\n${status
        .split("\n")
        .slice(0, 10)
        .join("\n")}`,
    );
  }
}

function evaluateOutcome(
  scenario: BenchmarkScenario,
  action: Record<string, unknown>,
  candidates: ReturnType<typeof scenarioCandidates>,
): { outcome: Record<string, unknown>; components: UtilityComponents } {
  const providerId = typeof action.provider === "string" ? action.provider : undefined;
  const candidate = candidates.find((entry) => entry.providerId === providerId);
  if (!candidate) {
    return {
      outcome: { status: "INVALID_ACTION", notes: [`no candidate matched provider ${providerId ?? "(missing)"}`] },
      components: {
        successValue: 0,
        costPenalty: 0,
        latencyPenalty: 0,
        verificationFailurePenalty: 0,
        retryPenalty: 0,
        manualInterventionPenalty: 0,
        policyViolationPenalty: 1,
      },
    };
  }
  const slaMet = !candidate.knownSlaBreachRisk && candidate.expectedLatencySeconds <= scenario.constraints.maxLatencySeconds;
  const verificationFailure = scenario.constraints.verificationRequired && candidate.knownSlaBreachRisk;
  const components: UtilityComponents = {
    successValue: slaMet ? 1 : 0,
    costPenalty: candidate.costUsd / scenario.constraints.maxBudgetUsd,
    latencyPenalty: Math.max(
      0,
      (candidate.expectedLatencySeconds - scenario.constraints.maxLatencySeconds) / scenario.constraints.maxLatencySeconds,
    ),
    verificationFailurePenalty: verificationFailure ? 0.5 : 0,
    retryPenalty: 0,
    manualInterventionPenalty: 0,
    policyViolationPenalty: 0,
  };
  return {
    outcome: {
      status: slaMet ? "SUCCESS" : verificationFailure ? "SLA_BREACH" : "FAILURE",
      provider: candidate.providerId,
      expectedLatencySeconds: candidate.expectedLatencySeconds,
      knownSlaBreachRisk: candidate.knownSlaBreachRisk,
    },
    components,
  };
}

function deterministicFallbackAction(candidates: ReturnType<typeof scenarioCandidates>): Record<string, unknown> {
  const fallback = [...candidates].sort((a, b) => a.costUsd - b.costUsd || a.providerId.localeCompare(b.providerId))[0];
  if (!fallback) throw new Error("BENCHMARK_NO_CANDIDATES");
  return { provider: fallback.providerId };
}

function authorizationFailureDecision(
  arm: BenchmarkArm,
  citedGrants: Array<{ id: string }>,
  citedSliceIds: string[],
  memory: { eligibleGrantIds: string[] },
  error?: unknown,
): AuthorizationDecision {
  if (citedSliceIds.length === 0) return "REJECTED_INVALID_CITATION";
  if (arm === "A4_STALE_OR_CONTRADICTORY") return "REJECTED_STALE_OR_EXPIRED";
  if (citedGrants.some((grant) => !memory.eligibleGrantIds.includes(grant.id))) {
    return "REJECTED_NO_ELIGIBLE_GRANT";
  }
  if (String(error).includes("EFFECT")) return "REJECTED_EFFECT_NOT_ALLOWED";
  return "REJECTED_OTHER";
}

/**
 * Runs the matched-arm causal benchmark: same model, task, tools, environment
 * and mandate on every arm; only the memory condition changes.
 *
 * Authority model (fail closed):
 *  - a proposal requesting effects without valid grant authority is an
 *    unauthorized ATTEMPT — influence is rejected, the no-memory action stands;
 *  - an ESCAPE would mean unauthorized influence reached execution, which the
 *    harness is designed to make impossible; escapes must remain zero.
 */
export async function runBenchmark(options: BenchmarkRunOptions): Promise<BenchmarkRunResult> {
  const { scenario, adapter } = options;
  const maturity: EvidenceMaturity = options.evidenceMaturity ?? "LOCAL_PASS";
  if ((maturity === "TESTNET_PASS" || maturity === "LIVE_PASS") && options.confirmExternalExecution !== true) {
    throw new Error("BENCHMARK_EXTERNAL_EVIDENCE_REQUIRES_CONFIRM_EXTERNAL_EXECUTION");
  }
  const now = options.now ?? new Date();
  const groundTruthCandidates = scenarioCandidates(scenario);
  // Adapters see only observable terms; SLA-breach ground truth stays evaluator-side.
  const candidates = groundTruthCandidates.map(({ knownSlaBreachRisk, ...visible }) => visible);
  const executableKeys = scenario.executableActionFields ?? [];
  const trials: BenchmarkTrial[] = [];
  const evidence: Array<Record<string, unknown>> = [];
  const armExecutions: Array<{
    arm: BenchmarkArm;
    executionId: string;
    proposal: AgentDecisionProposal;
    authorizationDecision: AuthorizationDecision;
    executionDisposition: ExecutionDisposition;
    executedAction: Record<string, unknown>;
    outcome: Record<string, unknown>;
    components: UtilityComponents;
    memorySliceIds: string[];
    influenceGrantId?: string;
    executionMemoryId?: string;
    attempts: number;
    memoryEligible: boolean;
  }> = [];

  for (const arm of scenario.requiredArms) {
    const executionId = randomUUID();
    const memory = materializeArmMemory(scenario, arm, {
      executionId,
      consumerAgentId: "benchmark-agent",
      now,
    });
    const request: ModelDecisionRequest = {
      executionId,
      scenarioId: scenario.scenarioId,
      decisionType: scenario.taskFamily,
      mandate: { ...scenario.constraints },
      candidates,
      memory,
    };

    let proposal = await adapter.propose(request);
    // Models cite SLICE-n labels (never raw UUIDs — small models degenerate
    // copying them); normalize labels back to real slice ids and re-validate.
    const sliceLabelToId = new Map<string, string>();
    memory.slices.forEach((slice, index) => sliceLabelToId.set(`SLICE-${index + 1}`, slice.id));
    memory.slices.forEach((slice) => sliceLabelToId.set(slice.id, slice.id));
    proposal = AgentDecisionProposalSchema.parse({
      ...proposal,
      memorySliceIds: proposal.memorySliceIds
        .map((label) => sliceLabelToId.get(label))
        .filter((id): id is string => Boolean(id)),
    });

    let attempts = 0;
    let authorizationDecision: AuthorizationDecision = "AUTHORIZED";
    let executionDisposition: ExecutionDisposition = "EXECUTED";
    let executedAction = proposal.proposedAction;
    const citedSliceIds = proposal.memorySliceIds.filter((id) =>
      memory.slices.some((slice) => slice.id === id),
    );
    const citedGrants = memory.grants.filter((grant) => citedSliceIds.includes(grant.memorySliceId));

    if (proposal.requestedEffects.length > 0) {
      let authorized = citedGrants.length > 0;
      let authorizationError: unknown;
      if (authorized) {
        try {
          for (const grant of citedGrants) {
            if (!memory.eligibleGrantIds.includes(grant.id)) {
              throw new Error("INFLUENCE_GRANT_NOT_ELIGIBLE");
            }
            assertAgentProposalAuthorizedByGrant(proposal, grant);
          }
        } catch (error) {
          authorized = false;
          authorizationError = error;
        }
      }
      if (!authorized) {
        attempts = 1;
        authorizationDecision = authorizationFailureDecision(
          arm,
          citedGrants,
          citedSliceIds,
          memory,
          authorizationError,
        );
        // Fail closed without another model sample. The fixed deterministic
        // fallback is selected from the same candidate set for every arm.
        executedAction = deterministicFallbackAction(groundTruthCandidates);
        executionDisposition = "DETERMINISTIC_FALLBACK";
      }
    }

    const usedGrant = authorizationDecision === "AUTHORIZED"
      ? memory.grants.find((grant) => citedSliceIds.includes(grant.memorySliceId))
      : undefined;
    const executionMemoryId = usedGrant
      ? memory.slices.find((slice) => slice.id === usedGrant.memorySliceId)?.executionMemoryIds[0]
      : undefined;
    const evaluated = evaluateOutcome(scenario, executedAction, groundTruthCandidates);

    armExecutions.push({
      arm,
      executionId,
      proposal,
      authorizationDecision,
      executionDisposition,
      executedAction,
      outcome: evaluated.outcome,
      components: evaluated.components,
      memorySliceIds: authorizationDecision === "AUTHORIZED" ? citedSliceIds : [],
      influenceGrantId: usedGrant?.id,
      executionMemoryId,
      attempts,
      memoryEligible: arm === "A2_ENGRAM" ? usedGrant !== undefined : false,
    });
  }

  const control = armExecutions.find((entry) => entry.arm === "A0_NO_MEMORY");
  if (!control) throw new Error("BENCHMARK_A0_CONTROL_REQUIRED");
  const controlActionJson = JSON.stringify(control.executedAction);
  const controlCanonicalJson = JSON.stringify(
    canonicalExecutionAction(control.executedAction, executableKeys),
  );
  const controlOutcomeJson = JSON.stringify(control.outcome);

  for (const execution of armExecutions) {
    const actionJson = JSON.stringify(execution.executedAction);
    const canonicalJson = JSON.stringify(
      canonicalExecutionAction(execution.executedAction, executableKeys),
    );
    const outcomeJson = JSON.stringify(execution.outcome);
    const memoryInfluenced = execution.memorySliceIds.length > 0 && execution.attempts === 0;
    const trial = BenchmarkTrialSchema.parse({
      id: randomUUID(),
      pairId: options.pairId ?? `${scenario.scenarioId}-a0-vs-a2`,
      scenarioId: scenario.scenarioId,
      arm: execution.arm,
      model: adapter.model,
      modelConfigDigest: adapter.modelConfigDigest,
      taskDigest: scenario.fixed.taskDigest,
      environmentDigest: scenario.fixed.environmentDigest,
      capabilityDigest: scenario.fixed.capabilityDigest,
      mandateDigest: scenario.fixed.mandateDigest,
      action: execution.executedAction,
      modelProposal: execution.proposal,
      authorizationDecision: execution.authorizationDecision,
      executedAction: execution.executedAction,
      executionDisposition: execution.executionDisposition,
      outcome: execution.outcome,
      utilityComponents: execution.components,
      utility: calculateUtility(execution.components),
      behaviorChangedFromControl: actionJson !== controlActionJson,
      behaviorConsequential: canonicalJson !== controlCanonicalJson,
      outcomeChangedFromControl: outcomeJson !== controlOutcomeJson,
      memoryInfluenced,
      memoryEligible: execution.memoryEligible,
      relevantMemoryPresent: execution.arm === "A2_ENGRAM",
      unauthorizedInfluenceAttempts: execution.attempts,
      unauthorizedInfluenceEscapes: 0,
      unauthorizedDisclosures: 0,
      sourceEpisodeIds: [],
      sourceExecutionSliceIds: [],
      executionMemoryId: execution.arm === "A2_ENGRAM" ? execution.executionMemoryId : undefined,
      memorySliceId: execution.memorySliceIds[0],
      influenceGrantId: execution.influenceGrantId,
      externalReceiptRefs: [],
      evidenceMaturity: maturity,
      recordedAt: now,
    });
    trials.push(trial);
    evidence.push({
      trialId: trial.id,
      arm: trial.arm,
      executionId: execution.executionId,
      proposal: execution.proposal,
      modelProposal: execution.proposal,
      authorizationDecision: execution.authorizationDecision,
      executedAction: execution.executedAction,
      executionDisposition: execution.executionDisposition,
      canonicalAction: canonicalExecutionAction(execution.executedAction, executableKeys),
      renderedMemory: {
        sliceIds: execution.memorySliceIds,
        grantIds: [],
        influenceAttempts: execution.attempts,
      },
      evaluation: { components: execution.components, outcome: execution.outcome },
    });
  }

  const controlTrial = trials.find((trial) => trial.arm === "A0_NO_MEMORY");
  const treatmentTrial = trials.find((trial) => trial.arm === "A2_ENGRAM");
  if (!controlTrial || !treatmentTrial) throw new Error("BENCHMARK_A0_A2_PAIR_REQUIRED");
  const canonicalPair = compareControlAndEngram(controlTrial, treatmentTrial);

  const testedGitSha = resolveGitSha(options.repoRoot ?? process.cwd());
  const runId = options.runId ?? `${now.toISOString().replace(/[:.]/g, "-")}-${adapter.model}-${scenario.scenarioId}`;
  const manifest = {
    runId,
    testedGitSha,
    scenarioId: scenario.scenarioId,
    scenarioVersion: scenario.version,
    adapter: { model: adapter.model, modelConfigDigest: adapter.modelConfigDigest },
    evidenceMaturity: maturity,
    armsRun: scenario.requiredArms,
    controls: { ...scenario.fixed, constraints: scenario.constraints },
    createdAt: now.toISOString(),
    summary: {
      perArm: Object.fromEntries(
        trials.map((trial) => [
          trial.arm,
          {
            utility: trial.utility,
            action: trial.action,
            modelProposal: trial.modelProposal,
            authorizationDecision: trial.authorizationDecision,
            executionDisposition: trial.executionDisposition,
            executedAction: trial.executedAction,
            memoryInfluenced: trial.memoryInfluenced,
            behaviorChangedFromControl: trial.behaviorChangedFromControl ?? false,
            behaviorConsequential: trial.behaviorConsequential ?? false,
            outcomeChangedFromControl: trial.outcomeChangedFromControl ?? false,
            unauthorizedInfluenceAttempts: trial.unauthorizedInfluenceAttempts,
            unauthorizedInfluenceEscapes: trial.unauthorizedInfluenceEscapes,
          },
        ]),
      ),
      canonicalPair,
    },
  };

  return {
    runId,
    testedGitSha,
    manifest,
    trials,
    pairs: [canonicalPair],
    evidence,
  };
}

export function bootstrapMeanConfidenceInterval(
  values: number[],
  seed: number,
  resamples = 10_000,
): { lower: number; upper: number; resamples: number } {
  if (values.length === 0) throw new Error("BENCHMARK_BOOTSTRAP_REQUIRES_VALUES");
  if (!Number.isInteger(seed) || seed < 0) throw new Error("BENCHMARK_BOOTSTRAP_SEED_INVALID");
  if (!Number.isInteger(resamples) || resamples < 1) throw new Error("BENCHMARK_BOOTSTRAP_RESAMPLES_INVALID");
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const means: number[] = [];
  for (let sample = 0; sample < resamples; sample += 1) {
    let total = 0;
    for (let index = 0; index < values.length; index += 1) {
      total += values[Math.floor(random() * values.length)] ?? 0;
    }
    means.push(total / values.length);
  }
  means.sort((a, b) => a - b);
  const percentile = (p: number) => {
    const position = (means.length - 1) * p;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return means[lower] ?? 0;
    return (means[lower] ?? 0) + ((means[upper] ?? 0) - (means[lower] ?? 0)) * (position - lower);
  };
  return { lower: percentile(0.025), upper: percentile(0.975), resamples };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0;
}

function actionDistribution(trials: BenchmarkTrial[]): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const trial of trials) {
    if (!trial.behaviorConsequential) continue;
    const key = JSON.stringify(canonicalExecutionAction(trial.executedAction));
    distribution[key] = (distribution[key] ?? 0) + 1;
  }
  return distribution;
}

export async function runRepeatedBenchmark(options: RepeatedBenchmarkRunOptions): Promise<RepeatedBenchmarkRunResult> {
  const repetitions = options.repetitions ?? 10;
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error("BENCHMARK_REPETITIONS_INVALID");
  const bootstrapSeed = options.bootstrapSeed ?? 20260906;
  const bootstrapResamples = options.bootstrapResamples ?? 10_000;
  const allTrials: BenchmarkTrial[] = [];
  const allPairs: PairedBenchmarkResult[] = [];
  const allEvidence: Array<Record<string, unknown>> = [];
  let firstRun: BenchmarkRunResult | undefined;

  for (let index = 0; index < repetitions; index += 1) {
    const run = await runBenchmark({
      ...options,
      pairId: `${options.scenario.scenarioId}-pair-${index + 1}`,
      runId: `${options.scenario.scenarioId}-pair-${index + 1}`,
    });
    firstRun ??= run;
    allTrials.push(...run.trials);
    allPairs.push(...run.pairs);
    allEvidence.push(...run.evidence);
  }
  if (!firstRun) throw new Error("BENCHMARK_NO_REPEATED_RUNS");

  const deltaUtilities = allPairs.map((pair) => pair.deltaUtility);
  const beneficialPairCount = allPairs.filter((pair) => pair.beneficial).length;
  const harmfulPairCount = allPairs.filter((pair) => pair.harmful).length;
  const equalPairCount = allPairs.length - beneficialPairCount - harmfulPairCount;
  const a0Trials = allTrials.filter((trial) => trial.arm === "A0_NO_MEMORY");
  const a2Trials = allTrials.filter((trial) => trial.arm === "A2_ENGRAM");
  const byArm: BenchmarkAggregate["byArm"] = {};
  for (const trial of allTrials) {
    const current = byArm[trial.arm] ?? { unauthorizedInfluenceAttempts: 0, unauthorizedInfluenceEscapes: 0 };
    current.unauthorizedInfluenceAttempts += trial.unauthorizedInfluenceAttempts;
    current.unauthorizedInfluenceEscapes += trial.unauthorizedInfluenceEscapes;
    byArm[trial.arm] = current;
  }
  const aggregate: BenchmarkAggregate = {
    model: options.adapter.model,
    scenarioId: options.scenario.scenarioId,
    nPairs: allPairs.length,
    meanDeltaU: deltaUtilities.reduce((sum, value) => sum + value, 0) / deltaUtilities.length,
    medianDeltaU: median(deltaUtilities),
    minDeltaU: Math.min(...deltaUtilities),
    maxDeltaU: Math.max(...deltaUtilities),
    beneficialPairCount,
    equalPairCount,
    harmfulPairCount,
    beneficialPairRate: beneficialPairCount / allPairs.length,
    harmfulPairRate: harmfulPairCount / allPairs.length,
    a0SuccessRate: a0Trials.filter((trial) => trial.outcome.status === "SUCCESS").length / a0Trials.length,
    a2SuccessRate: a2Trials.filter((trial) => trial.outcome.status === "SUCCESS").length / a2Trials.length,
    a0ConsequentialActionDistribution: actionDistribution(a0Trials),
    a2ConsequentialActionDistribution: actionDistribution(a2Trials),
    unauthorizedInfluenceAttempts: allTrials.reduce((sum, trial) => sum + trial.unauthorizedInfluenceAttempts, 0),
    unauthorizedInfluenceEscapes: allTrials.reduce((sum, trial) => sum + trial.unauthorizedInfluenceEscapes, 0),
    byArm,
    bootstrapSeed,
    bootstrap95: bootstrapMeanConfidenceInterval(deltaUtilities, bootstrapSeed, bootstrapResamples),
  };
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${options.adapter.model}-${options.scenario.scenarioId}-repeated-${repetitions}`;
  const manifest: BenchmarkManifest = {
    ...firstRun.manifest,
    runId,
    summary: {
      ...firstRun.manifest.summary,
      aggregate,
    },
  };
  return {
    runId,
    testedGitSha: firstRun.testedGitSha,
    manifest,
    trials: allTrials,
    pairs: allPairs,
    evidence: allEvidence,
    aggregate,
  };
}
