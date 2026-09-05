import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OperationalMemory } from "../../packages/memory-core/src/domain.js";
import { memoryStateDigest } from "../../packages/runtime/src/memory-state.js";

function baseMemory(): OperationalMemory {
  return {
    id: randomUUID(),
    agentId: "agent-a",
    memoryType: "UNEXPECTED_FAILURE",
    summary: "Preserve the observed workaround.",
    structuredContext: {
      workflowType: "deploy",
      nested: { beta: 2, alpha: 1 },
      sequence: [{ y: 2, x: 1 }],
    },
    confidence: 0.91,
    evidenceState: "OBSERVED",
    validFrom: new Date("2026-08-16T10:00:00.000Z"),
    validUntil: new Date("2026-08-17T10:00:00.000Z"),
    environmentVersion: "prod-v1",
    toolVersion: "1.2.3",
    policyVersion: "admission-v1",
  };
}

describe("memory state digest canonicalization", () => {
  it("is stable across equivalent object key ordering", () => {
    const left = baseMemory();
    const right: OperationalMemory = {
      ...left,
      structuredContext: {
        sequence: [{ x: 1, y: 2 }],
        nested: { alpha: 1, beta: 2 },
        workflowType: "deploy",
      },
    };

    expect(memoryStateDigest(right)).toBe(memoryStateDigest(left));
  });

  it("changes when authority-relevant content changes", () => {
    const left = baseMemory();
    const right = { ...left, confidence: 0.9 };

    expect(memoryStateDigest(right)).not.toBe(memoryStateDigest(left));
  });

  it("uses an explicit versioned digest namespace", () => {
    expect(memoryStateDigest(baseMemory())).toMatch(/^engram\.memory-state\/v1:sha256:[a-f0-9]{64}$/);
  });
});
