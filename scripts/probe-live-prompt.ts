import { loadBenchmarkScenario, materializeArmMemory } from "../packages/benchmark/src/scenario.js";
import { renderMemoryContextForModel } from "../packages/benchmark/src/model-adapter.js";

const scenario = loadBenchmarkScenario("benchmarks/scenarios/provider-urgent.json");
const memory = materializeArmMemory(scenario, "A2_ENGRAM", {
  executionId: "10000000-0000-4000-8000-00000000aaaa",
  consumerAgentId: "benchmark-agent",
  now: new Date(),
});
const system = [
  "You are the decision module of an autonomous execution agent.",
  "You propose one action; you have NO direct access to memory stores, tools, or ledgers.",
  "Reply with ONLY a JSON object, no prose, no code fences, with fields:",
  '  "proposedAction": object (must include "provider": one of the candidate provider ids)',
  '  "reasoningSummary": string',
  '  "memorySliceIds": array of slice ids you relied on (only ids provided to you)',
  '  "requestedEffects": array of strings chosen ONLY from effects explicitly allowed by the provided influence grants (empty list if none apply)',
].join(" ");
const user = [
  `MANDATE: urgency=URGENT, verificationRequired=true, maxLatencySeconds=1800, maxBudgetUsd=20`,
  "CANDIDATES:",
  ...scenario.candidateProviders.map((p) => JSON.stringify({ providerId: p, costUsd: scenario.providerTerms[p]?.costUsd, expectedLatencySeconds: scenario.providerTerms[p]?.expectedLatencySeconds })),
  "MEMORY CONTEXT:",
  renderMemoryContextForModel(memory),
].join("\n");
console.log("SYSTEM_CHARS:", system.length, "USER_CHARS:", user.length);
const res = await fetch("http://127.0.0.1:11434/v1/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    model: "llama3.2-1b-8k",
    temperature: 0,
    max_tokens: 512,
    stream: false,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  }),
});
const data = await res.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }>; usage?: unknown };
console.log("FINISH_REASON:", data.choices?.[0]?.finish_reason);
console.log("USAGE:", JSON.stringify(data.usage));
console.log("CONTENT_FULL:", JSON.stringify(data.choices?.[0]?.message?.content));
