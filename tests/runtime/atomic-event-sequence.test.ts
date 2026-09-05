import { describe, expect, it, vi } from "vitest";
import { EngramRuntime } from "../../packages/runtime/src/runtime.js";
import { DEFAULT_RUNTIME_POLICIES } from "../../packages/runtime/src/defaults.js";
import type { EngramRuntimeStore } from "../../packages/runtime/src/store.js";


describe("runtime event sequencing", () => {
  it("uses the store allocator when one is available instead of trace length", async () => {
    const appendEvent = vi.fn(async () => undefined);
    const nextEventSequence = vi.fn(async () => 41);
    const getTrace = vi.fn(async () => {
      throw new Error("trace length must not be consulted when an allocator exists");
    });

    const store = {
      getExecution: async (executionId: string) => ({
        id: executionId,
        agentId: "agent",
        workflowType: "workflow",
        intent: "work",
        context: {},
        constraints: {},
        status: "RUNNING" as const,
        startedAt: new Date(),
      }),
      nextEventSequence,
      appendEvent,
      getTrace,
    } as unknown as EngramRuntimeStore;

    const runtime = new EngramRuntime(store, DEFAULT_RUNTIME_POLICIES);
    await runtime.observe({
      executionId: "11111111-1111-4111-8111-111111111111",
      type: "TOOL_RESULT",
      payload: { ok: true },
      evidenceState: "OBSERVED",
    });

    expect(nextEventSequence).toHaveBeenCalledOnce();
    expect(getTrace).not.toHaveBeenCalled();
    expect(appendEvent).toHaveBeenCalledWith(expect.objectContaining({ sequenceNo: 41 }));
  });
});
