import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const providerPrep = await json("evidence/canonical/virtuals/a0-preparation/20260907T084541Z/manifest.json");
const providerAttempt = await json("evidence/canonical/virtuals/a0-live-attempt/20260907T085000Z/manifest.json");
const tool = await json("evidence/canonical/tool-recovery/20260907T084535Z/process-b.json");
const handoff = await json("evidence/canonical/agent-handoff/20260907T085900Z/process-b.json");
const summary = {
  product: "Engram",
  thesis: "Execution memory that changes what an agent does next.",
  replayMode: "REPLAYED_CANONICAL_LIVE_EVIDENCE",
  newLiveExecution: false,
  useCases: [
    {
      id: "provider-continuity",
      evidenceState: providerAttempt.evidenceState,
      source: "evidence/canonical/virtuals/a0-live-attempt/20260907T085000Z/",
      preparation: providerPrep.stopGate,
      freshProcess: false,
      authorizedInfluence: false,
      limitation: "A0 model decision timed out before job creation; no live provider execution occurred.",
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
};
const out = resolve("evidence/canonical/demo/latest/summary.json");
await mkdir(resolve(out, ".."), { recursive: true });
await writeFile(out, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

async function json(path: string): Promise<any> { return JSON.parse(await readFile(resolve(root, path), "utf8")); }
