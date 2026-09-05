import { createHash } from "node:crypto";
import type { OperationalMemory } from "../../memory-core/src/domain.js";

export const MEMORY_STATE_DIGEST_VERSION = "engram.memory-state/v1" as const;

export function memoryStateDigest(memory: OperationalMemory): string {
  const canonical = stableJson({
    id: memory.id,
    agentId: memory.agentId,
    memoryType: memory.memoryType,
    summary: memory.summary,
    structuredContext: memory.structuredContext,
    confidence: memory.confidence,
    evidenceState: memory.evidenceState,
    validFrom: memory.validFrom ?? null,
    validUntil: memory.validUntil ?? null,
    environmentVersion: memory.environmentVersion ?? null,
    toolVersion: memory.toolVersion ?? null,
    policyVersion: memory.policyVersion ?? null,
  });
  const digest = createHash("sha256").update(canonical).digest("hex");
  return `${MEMORY_STATE_DIGEST_VERSION}:sha256:${digest}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => item === undefined ? null : normalize(item));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .filter((key) => record[key] !== undefined)
        .map((key) => [key, normalize(record[key])]),
    );
  }
  return value;
}
