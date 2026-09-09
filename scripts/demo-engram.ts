import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const providerPrep = await json("evidence/canonical/virtuals/a0-preparation/20260907T084541Z/manifest.json");
const providerExecution = await json("evidence/canonical/virtuals/a0-live-execution/20260909T104849Z/manifest.json");
const providerRead = await json("evidence/canonical/virtuals/a0-live-execution/20260909T104849Z/read-reconciliation-20260909.json");
const providerSession = await json("evidence/canonical/virtuals/a0-live-execution/20260909T104849Z/acp-session-diagnostic.json");
const tool = await json("evidence/canonical/tool-recovery/20260907T084535Z/process-b.json");
const handoff = await json("evidence/canonical/agent-handoff/20260907T085900Z/process-b.json");
const analysisManifest = await json("evidence/canonical/analysis/latest/manifest.json");
const analysisSummary = await json("evidence/canonical/longitudinal/latest/summary.json");
const scorecard = await json("evidence/canonical/analysis/latest/eval-scorecard.json");
const heldout = await json("evidence/canonical/analysis/latest/heldout-evaluation.json");
const summary = {
  product: "Engram",
  thesis: "Execution memory that changes what an agent does next.",
  replayMode: "REPLAYED_CANONICAL_LIVE_EVIDENCE",
  newLiveExecution: false,
  useCases: [
    {
      id: "provider-continuity",
      evidenceState: providerSession.evidenceState,
      source: "evidence/canonical/virtuals/a0-live-execution/20260909T104849Z/",
      preparation: providerPrep.stopGate,
      jobId: providerRead.job.jobId,
      jobCreated: providerExecution.jobCreated,
      jobFunded: false,
      freshProcess: false,
      authorizedInfluence: false,
      limitation: "Authentic job history is readable, but ACP session reconstruction returns null and funding returns SESSION_NOT_FOUND; no terminal provider outcome occurred.",
    },
    {
      id: "tool-recovery",
      evidenceState: "LOCAL_PASS",
      source: "evidence/canonical/tool-recovery/20260907T084535Z/",
      freshProcess: tool.processBoundary.freshRuntime,
      authorizedInfluence: tool.positiveAuthorization === "AUTHORIZED",
      unauthorizedInfluenceEscapes: tool.unauthorizedInfluenceEscapes,
    },
    {
      id: "agent-handoff",
      evidenceState: "LOCAL_PASS",
      source: "evidence/canonical/agent-handoff/20260907T085900Z/",
      crossAgent: true,
      boundedDisclosure: !handoff.disclosure.rawHistoryExposed && !handoff.disclosure.sourceEventsExposed,
      authorityPreserved: handoff.unauthorizedInfluenceEscapes === 0,
      authorizedInfluence: handoff.positiveAuthorization === "AUTHORIZED",
    },
  ],
  analysis: {
    source: "evidence/canonical/longitudinal/latest/summary.json",
    domainCounts: analysisManifest.domain_counts,
    providerObservationsInLongitudinal: analysisManifest.provider_observations_in_longitudinal,
    metrics: analysisSummary.summary,
    scorecard: scorecard.rows,
    heldout: {
      tool: heldout.toolRecovery.metrics,
      handoff: heldout.agentHandoff.metrics,
    },
    figures: [
      "evidence/canonical/analysis/latest/utility-by-arm.png",
      "evidence/canonical/analysis/latest/learning-delta.png",
      "evidence/canonical/analysis/latest/memory-lifecycle.png",
      "evidence/canonical/analysis/latest/authority-containment.png",
      "evidence/canonical/analysis/latest/use-case-evidence-matrix.png",
    ],
  },
};
const out = resolve("evidence/canonical/demo/latest/summary.json");
await mkdir(resolve(out, ".."), { recursive: true });
await writeFile(out, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

async function json(path: string): Promise<any> { return JSON.parse(await readFile(resolve(root, path), "utf8")); }
