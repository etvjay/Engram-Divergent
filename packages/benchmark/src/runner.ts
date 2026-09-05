import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { assertAgentProposalAuthorizedByGrant, type AgentDecisionProposal } from "../../runtime/src/agent-decision.js";
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
}

export interface BenchmarkRunResult {
  runId: string;
  testedGitSha: string;
  manifest: BenchmarkManifest;
  trials: BenchmarkTrial[];
  pairs: PairedBenchmarkResult[];
  evidence: Array<Record<string, unknown>>;
  resultsPath?: string;
}

interface ArmExecution {
  arm: BenchmarkArm;
  executionId: string;
  proposal: AgentDecisionProposal;
  memorySliceIds: string[];
  influenceGrantId?: string;
  executionMemoryId?: string;
  escapes: number;
  memoryEligible: boolean;
}

function resolveGitSha(repoRoot: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot }).toString().trim();
  } catch {
    return "unknown";
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
  const verificationFailure =
    scenario.constraints.verificationRequired && candidate.knownSlaBreachRisk;
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

/**
 * Runs the matched-arm causal benchmark: same model, task, tools, environment
 * and mandate on every arm; only the memory condition changes. Authority is
 * enforced per AgentDecisionProposal via assertAgentProposalAuthorizedByGrant
 * with runner-side expiry gating (assertInfluenceAllowed does not check time).
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
  const trials: BenchmarkTrial[] = [];
  const evidence: Array<Record<string, unknown>> = [];
  const armExecutions: ArmExecution[] = [];

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
    let escapes = 0;

    if (proposal.requestedEffects.length > 0) {
      const citedGrants = memory.grants.filter((grant) =>
        proposal.memorySliceIds.includes(grant.memorySliceId),
      );
      let authorized = false;
      if (citedGrants.length > 0) {
        try {
          for (const grant of citedGrants) {
            if (!memory.eligibleGrantIds.includes(grant.id)) {
              throw new Error("INFLUENCE_GRANT_NOT_ELIGIBLE");
            }
            assertAgentProposalAuthorizedByGrant(proposal, grant);
          }
          authorized = true;
        } catch {
          authorized = false;
        }
      }
      if (!authorized) {
        escapes += 1;
        // Fail closed: the memory-driven proposal is not allowed to stand.
        // Re-pose the identical decision with the memory condition removed;
        // the action that stands is the no-memory action.
        proposal = await adapter.propose({
          ...request,
          memory: { arm, slices: [], grants: [], eligibleGrantIds: [] },
        });
      }
    }

    const citedSliceIds = proposal.memorySliceIds.filter((id) =>
      memory.slices.some((slice) => slice.id === id),
    );
    const usedGrant = memory.grants.find((grant) => citedSliceIds.includes(grant.memorySliceId));
    const executionMemoryId = usedGrant
      ? memory.slices.find((slice) => slice.id === usedGrant.memorySliceId)?.executionMemoryIds[0]
      : undefined;

    armExecutions.push({
      arm,
      executionId,
      proposal,
      memorySliceIds: citedSliceIds,
      influenceGrantId: usedGrant?.id,
      executionMemoryId,
      escapes,
      memoryEligible: arm === "A2_ENGRAM" ? usedGrant !== undefined : false,
    });
  }

  const control = armExecutions.find((entry) => entry.arm === "A0_NO_MEMORY");
  if (!control) throw new Error("BENCHMARK_A0_CONTROL_REQUIRED");
  const controlActionJson = JSON.stringify(control.proposal.proposedAction);

  for (const execution of armExecutions) {
    const { outcome, components } = evaluateOutcome(scenario, execution.proposal.proposedAction, groundTruthCandidates);
    const actionJson = JSON.stringify(execution.proposal.proposedAction);
    const actionChanged = actionJson !== controlActionJson;
    const trial = BenchmarkTrialSchema.parse({
      id: randomUUID(),
      pairId: `${scenario.scenarioId}-a0-vs-a2`,
      scenarioId: scenario.scenarioId,
      arm: execution.arm,
      model: adapter.model,
      modelConfigDigest: adapter.modelConfigDigest,
      taskDigest: scenario.fixed.taskDigest,
      environmentDigest: scenario.fixed.environmentDigest,
      capabilityDigest: scenario.fixed.capabilityDigest,
      mandateDigest: scenario.fixed.mandateDigest,
      action: execution.proposal.proposedAction,
      outcome,
      utilityComponents: components,
      utility: calculateUtility(components),
      behaviorChangedFromControl: actionChanged,
      behaviorConsequential: actionChanged,
      memoryInfluenced: execution.memorySliceIds.length > 0 && execution.escapes === 0,
      memoryEligible: execution.memoryEligible,
      relevantMemoryPresent: execution.arm === "A2_ENGRAM",
      unauthorizedInfluenceEscapes: execution.escapes,
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
      renderedMemory: {
        sliceIds: execution.proposal.memorySliceIds,
        grantIds: [],
        influenceRejected: execution.escapes > 0,
      },
      evaluation: { components, outcome },
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
            memoryInfluenced: trial.memoryInfluenced,
            behaviorChangedFromControl: trial.behaviorChangedFromControl ?? false,
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
