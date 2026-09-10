import { randomUUID } from "node:crypto";
import { loadBenchmarkScenario, materializeArmMemory, scenarioCandidates } from "../packages/benchmark/src/scenario.js";
import { createQwenAdapter } from "../packages/benchmark/src/adapters/qwen.js";

const scenario = loadBenchmarkScenario("benchmarks/scenarios/provider-urgent.json");
const model = process.env.ENGRAM_CONFORMANCE_MODEL ?? "llama3.2:1b";
const timeoutMs = Number(process.env.ENGRAM_CONFORMANCE_TIMEOUT_MS ?? "60000");
const executionId = randomUUID();
const adapter = createQwenAdapter({ model, requestTimeoutMs: timeoutMs, maxAttempts: 1 });
const request = {
  executionId,
  scenarioId: scenario.scenarioId,
  decisionType: scenario.taskFamily,
  mandate: { ...scenario.constraints },
  candidates: scenarioCandidates(scenario).map(({ knownSlaBreachRisk: _hidden, ...visible }) => visible),
  memory: materializeArmMemory(scenario, "A0_NO_MEMORY", { executionId, consumerAgentId: "conformance-agent", now: new Date() }),
};
const started = performance.now();
try {
  const proposal = await adapter.propose(request);
  console.log(JSON.stringify({ status: "VALID_PROPOSAL", model, timeoutMs, latencyMs: Math.round(performance.now() - started), proposedAction: proposal.proposedAction, requestedEffects: proposal.requestedEffects, memorySliceIds: proposal.memorySliceIds }));
} catch (error) {
  console.log(JSON.stringify({ status: "FAILED", model, timeoutMs, latencyMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}
