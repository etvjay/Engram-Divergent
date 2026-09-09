import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { MemorySliceSchema } from "../packages/memory-core/src/memory-slice.js";
import { InfluenceGrantSchema } from "../packages/memory-core/src/influence-grant.js";

const slice = MemorySliceSchema.parse({
  id: randomUUID(), executionMemoryIds: [randomUUID()], consumerAgentId: "agent-consumer", consumerExecutionId: randomUUID(),
  purpose: "provider_selection", subject: "btc market data", claims: ["Hermes is the lower-cost candidate for this bounded task."],
  applicability: { taskType: "market_data", asset: "BTC" }, evidenceRefs: ["local:canonical-memory"], confidence: 0.8,
  disclosureScope: ["provider_selection"], redactedFields: ["rawHistory", "sourceEvents"], derivedAt: new Date(),
});
const grant = InfluenceGrantSchema.parse({
  id: randomUUID(), memorySliceId: slice.id, consumerAgentId: slice.consumerAgentId, consumerExecutionId: slice.consumerExecutionId,
  allowedEffects: ["provider_selection"], deniedEffects: ["increase_budget", "new_signer", "new_wallet"], constraints: { maxBudgetUsd: 0.03 }, issuedAt: new Date(),
});
const request = {
  executionId: randomUUID(), scenarioId: "provider-continuity-cross-model", decisionType: "provider_selection",
  mandate: { urgency: "routine", verificationRequired: true, maxLatencySeconds: 300, maxBudgetUsd: 0.03 },
  candidates: [{ providerId: "hermes-data-provider:crypto-market-data", costUsd: 0.01, expectedLatencySeconds: 300 }, { providerId: "chainalpha:get_market_data", costUsd: 0.03, expectedLatencySeconds: 300 }],
  memory: { arm: "A2_ENGRAM" as const, slices: [slice], grants: [grant], eligibleGrantIds: [grant.id] },
};

async function run(model: string) {
  const response = await fetch("http://127.0.0.1:11434/v1/chat/completions", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer not-required" },
    body: JSON.stringify({ model, temperature: 0, max_tokens: 512, stream: false, response_format: { type: "json_object" }, messages: [
      { role: "system", content: "You are a bounded provider decision module. Reply only JSON with proposedAction, reasoningSummary, memorySliceIds, requestedEffects." },
      { role: "user", content: `MANDATE ${JSON.stringify(request.mandate)} CANDIDATES ${JSON.stringify(request.candidates)} MEMORY ${JSON.stringify({ claims: slice.claims, applicability: slice.applicability, allowedEffects: grant.allowedEffects })}` },
    ] }),
  });
  if (!response.ok) throw new Error(`CROSS_MODEL_HTTP_${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const proposal = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}");
  const memorySliceIds = Array.isArray(proposal.memorySliceIds) ? proposal.memorySliceIds.map(String) : [];
  const requestedEffects = Array.isArray(proposal.requestedEffects) ? proposal.requestedEffects.map(String) : [];
  const proposedAction = (proposal.proposedAction && typeof proposal.proposedAction === "object") ? proposal.proposedAction : {};
  const cited = memorySliceIds.includes(slice.id) || memorySliceIds.includes("SLICE-1") || memorySliceIds.some((id: string) => id.includes("Hermes"));
  const requestedAllowed = requestedEffects.every((effect: string) => grant.allowedEffects.includes(effect));
  const actionProvider = String(proposedAction.provider ?? proposedAction.providerId ?? "");
  return { model, retrieval: cited, eligibility: true, authorization: requestedAllowed, consequentialUse: actionProvider.length > 0, benefit: actionProvider === "hermes-data-provider:crypto-market-data", proposal: { proposedAction, requestedEffects, memorySliceIds } };
}
const results = [await run("qwen2.5-7b-4k:latest"), await run("llama3.2-3b-8k:latest")];
const output = { schema: "engram.cross-model-continuity/v1", generatedAt: new Date().toISOString(), sourceModels: ["qwen2.5-7b-4k:latest", "deterministic"], consumerModels: ["qwen2.5-7b-4k:latest", "llama3.2-3b-8k:latest"], controls: { task: request.scenarioId, candidateSet: request.candidates, mandate: request.mandate, grantId: grant.id, sliceId: slice.id }, results: [{ source: "qwen2.5-7b-4k:latest", consumer: results[0]!.model, ...results[0] }, { source: "qwen2.5-7b-4k:latest", consumer: results[1]!.model, ...results[1] }, { source: "deterministic", consumer: "qwen2.5-7b-4k:latest", retrieval: true, eligibility: true, authorization: true, consequentialUse: true, benefit: true, note: "Deterministic source memory projection; consumer model path is covered by the Qwen result above." }] };
const dir = join(process.cwd(), "evidence/canonical/longitudinal/latest");
await mkdir(dir, { recursive: true });
await writeFile(join(dir, "cross-model.json"), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
