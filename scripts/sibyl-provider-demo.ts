import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { EngramRuntime } from "../packages/runtime/src/runtime.js";
import { DEFAULT_RUNTIME_POLICIES } from "../packages/runtime/src/defaults.js";
import { SibylRuntimeStore } from "../packages/sibyl/src/runtime-store.js";
import {
  deriveBaseSettlementIntent,
  serializeBaseSettlementIntent,
} from "../packages/base-settlement/src/index.js";
import {
  decideProviderEngagement,
  executeProviderEngagement,
  type ProviderContinuityContext,
  type ProviderOffer,
} from "../packages/scenarios/provider-continuity/src/index.js";

const command = process.argv[2];
const offers: ProviderOffer[] = [
  { providerId: "atlas", priceUsd: 8, expectedLatencySeconds: 20 },
  { providerId: "beacon", priceUsd: 11, expectedLatencySeconds: 18 },
];

const baseContext: ProviderContinuityContext = {
  workflowType: "agent_provider_selection",
  taskType: "data_fetch",
  urgency: "URGENT",
  budgetUsd: 20,
  maxLatencySeconds: 30,
  environmentVersion: "provider-market-v1",
};

function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function recordBreach(runtime: EngramRuntime, attempt: number): Promise<string> {
  const run = await runtime.startExecution({
    agentId: "requester-agent",
    workflowType: "agent_provider_selection",
    intent: "obtain urgent data from an eligible provider",
    context: { taskType: "data_fetch", urgency: "URGENT", providerId: "atlas", attempt },
    constraints: { maxLatencySeconds: 30 },
    environmentVersion: "provider-market-v1",
  });
  await runtime.observe({
    executionId: run.executionId,
    type: "PROVIDER_SLA_BREACH",
    payload: { providerId: "atlas", taskType: "data_fetch", latencySeconds: 55 + attempt },
    evidenceState: "OBSERVED",
    provenance: [{ source: "provider-execution", attempt }],
  });
  await runtime.complete({
    executionId: run.executionId,
    status: "PARTIAL",
    failureType: "SLA_BREACH",
    summary: `Atlas breached the urgent SLA on attempt ${attempt}.`,
    result: { providerId: "atlas", failureType: "SLA_BREACH" },
    evidenceState: "OBSERVED",
  });
  return run.executionId;
}

async function seed(): Promise<void> {
  const store = new SibylRuntimeStore();
  const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
  const backend = await store.ping();
  const first = await recordBreach(runtime, 1);
  const second = await recordBreach(runtime, 2);
  const admitting = await runtime.startExecution({
    agentId: "requester-agent",
    workflowType: "agent_provider_selection",
    intent: "consolidate repeated provider execution experience",
    context: { taskType: "data_fetch", providerId: "atlas", purpose: "relationship-state-update" },
    constraints: {},
    environmentVersion: "provider-market-v1",
  });
  const completed = await runtime.complete({
    executionId: admitting.executionId,
    status: "PARTIAL",
    summary: "Two requester-owned Atlas executions breached the urgent data-fetch SLA.",
    result: { providerId: "atlas", repeatedPattern: true },
    evidenceState: "OBSERVED",
    admissionSignals: [{
      kind: "REPEATED_PATTERN",
      summary: "Across two requester-owned executions, Atlas repeatedly breached urgent data-fetch SLAs. Guard urgent delegation and reduce prepayment authority on routine work.",
      evidenceState: "OBSERVED",
      confidence: 0.92,
      sourceExecutionIds: [first, second, admitting.executionId],
      details: {
        memoryPrimitive: "EXPERIENTIAL_RELATIONSHIP",
        taskType: "data_fetch",
        providerId: "atlas",
        relationshipPosture: "CONTEXT_GUARDED",
        failureType: "SLA_BREACH",
        breachCount: 2,
      },
    }],
  });
  emit({
    phase: "provider-history",
    backend: "sibyl-memory-client",
    sibyl: backend,
    historicalExecutionIds: [first, second],
    admittingExecutionId: admitting.executionId,
    admittedMemoryIds: completed.admittedMemories.map((memory) => memory.id),
    relationshipPosture: "CONTEXT_GUARDED",
    instruction: "Terminate this process, then run urgent/routine commands against the same Sibyl DB and tenant.",
  });
}

async function maybeWriteBaseIntent(input: {
  executionId: string;
  retrievalId: string;
  treatment: ReturnType<typeof decideProviderEngagement>;
}): Promise<{ intentPath: string; intent: ReturnType<typeof serializeBaseSettlementIntent> } | undefined> {
  const out = process.env.ENGRAM_BASE_INTENT_OUT;
  if (!out) return undefined;

  const atlas = process.env.ENGRAM_BASE_ATLAS_ADDRESS;
  const beacon = process.env.ENGRAM_BASE_BEACON_ADDRESS;
  if (!atlas || !beacon) {
    throw new Error("BASE_INTENT_REQUIRES_ENGRAM_BASE_ATLAS_ADDRESS_AND_ENGRAM_BASE_BEACON_ADDRESS");
  }

  const serialized = serializeBaseSettlementIntent(deriveBaseSettlementIntent({
    decision: input.treatment,
    addresses: { atlas, beacon },
    provenance: {
      executionId: input.executionId,
      retrievalId: input.retrievalId,
    },
  }));
  const intentPath = resolve(out);
  await mkdir(dirname(intentPath), { recursive: true });
  await writeFile(intentPath, `${JSON.stringify(serialized, null, 2)}\n`, "utf8");
  return { intentPath, intent: serialized };
}

async function decide(urgency: "URGENT" | "ROUTINE"): Promise<void> {
  const store = new SibylRuntimeStore();
  const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
  const backend = await store.ping();
  const run = await runtime.startExecution({
    agentId: "requester-agent",
    workflowType: "agent_provider_selection",
    intent: `obtain ${urgency.toLowerCase()} data from an eligible provider`,
    context: { taskType: "data_fetch", urgency },
    constraints: { budgetUsd: 20, maxLatencySeconds: 30 },
    environmentVersion: "provider-market-v1",
  });
  const recalled = await runtime.recall({
    executionId: run.executionId,
    query: "Atlas repeated data fetch SLA breaches experiential relationship",
  });
  const context: ProviderContinuityContext = { ...baseContext, urgency };
  const control = decideProviderEngagement({ context, offers, memories: [] });
  const treatment = decideProviderEngagement({
    context,
    offers,
    memories: recalled.candidates.map((candidate) => ({ memory: candidate.memory, finalScore: candidate.score })),
  });

  if (treatment.memoryRefs.length) {
    await runtime.recordDecision({
      executionId: run.executionId,
      decisionType: "PROVIDER_ENGAGEMENT",
      selectedAction: { providerId: treatment.providerId, terms: treatment.terms },
      alternatives: [{ providerId: control.providerId, terms: control.terms }],
      reasoningSummary: treatment.reason,
      influences: [{
        memoryId: treatment.memoryRefs[0]!,
        retrievalId: recalled.recall.id,
        influenceType: treatment.providerId !== control.providerId ? "CHANGED_ACTION" : "CONSTRAINED_ACTION",
        summary: urgency === "URGENT"
          ? "Accumulated provider experience changed urgent delegation from Atlas to Beacon."
          : "Accumulated provider experience constrained Atlas prepayment and verification authority.",
        counterfactual: treatment.providerId !== control.providerId ? {
          action: { providerId: control.providerId, terms: control.terms },
          source: "APPLICATION_DECLARED",
          evidenceState: "OBSERVED",
          explanation: "Without relationship memory, the cheapest eligible provider is Atlas.",
        } : undefined,
      }],
    });
  }

  const baseSettlement = await maybeWriteBaseIntent({
    executionId: run.executionId,
    retrievalId: recalled.recall.id,
    treatment,
  });

  emit({
    phase: urgency === "URGENT" ? "provider-fresh-urgent" : "provider-fresh-routine",
    backend: "sibyl-memory-client",
    sibyl: backend,
    executionId: run.executionId,
    retrievalId: recalled.recall.id,
    recalledMemoryIds: recalled.candidates.map((candidate) => candidate.memory.id),
    baseline: {
      providerId: control.providerId,
      terms: control.terms,
      result: executeProviderEngagement(control, context),
    },
    memoryConditioned: {
      providerId: treatment.providerId,
      terms: treatment.terms,
      result: executeProviderEngagement(treatment, context),
    },
    providerChanged: control.providerId !== treatment.providerId,
    authorityChanged: JSON.stringify(control.terms) !== JSON.stringify(treatment.terms),
    baseSettlement,
    trace: await runtime.trace(run.executionId),
  });
}

switch (command) {
  case "seed": await seed(); break;
  case "urgent": await decide("URGENT"); break;
  case "routine": await decide("ROUTINE"); break;
  default: throw new Error("Usage: tsx scripts/sibyl-provider-demo.ts <seed|urgent|routine>");
}
