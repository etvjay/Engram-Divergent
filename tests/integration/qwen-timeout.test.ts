import { describe, expect, it } from "vitest";
import { createQwenAdapter } from "../../packages/benchmark/src/adapters/qwen.js";

describe("Qwen adapter request cancellation", () => {
  it("aborts the underlying fetch on timeout", async () => {
    let aborted = false;
    const adapter = createQwenAdapter({
      model: "test-model",
      requestTimeoutMs: 10,
      fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
    });
    await expect(adapter.propose({
      executionId: "execution-1",
      scenarioId: "scenario-1",
      decisionType: "provider_selection",
      mandate: { urgency: "URGENT", verificationRequired: true, maxLatencySeconds: 10, maxBudgetUsd: 20 },
      candidates: [{ providerId: "atlas", costUsd: 1, expectedLatencySeconds: 1 }],
      memory: { arm: "A0_NO_MEMORY", slices: [], grants: [], eligibleGrantIds: [] },
    })).rejects.toThrow("QWEN_ADAPTER_TIMEOUT_10MS");
    expect(aborted).toBe(true);
  });
});
