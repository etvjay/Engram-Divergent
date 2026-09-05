import type { OperationalMemory } from "../../memory-core/src/domain.js";
import type { ExpiryPolicy } from "../../policy/src/contracts.js";

export type MemoryStalenessContext = {
  environmentVersion?: string;
  toolVersion?: string;
  now?: Date;
};

export type MemoryStalenessAssessment = {
  memoryId: string;
  stale: boolean;
  reasons: Array<
    | "EXPIRED"
    | "NOT_YET_VALID"
    | "ENVIRONMENT_CHANGED"
    | "TOOL_MAJOR_VERSION_CHANGED"
    | "MAX_AGE_EXCEEDED"
  >;
};

function major(version: string): string {
  return version.trim().replace(/^v/i, "").split(/[.+-]/, 1)[0] || version;
}

export function assessMemoryStaleness(
  memory: OperationalMemory,
  context: MemoryStalenessContext,
  policy: ExpiryPolicy,
): MemoryStalenessAssessment {
  const now = context.now ?? new Date();
  const reasons: MemoryStalenessAssessment["reasons"] = [];

  if (memory.validUntil && memory.validUntil <= now) reasons.push("EXPIRED");
  if (memory.validFrom && memory.validFrom > now) reasons.push("NOT_YET_VALID");

  if (
    policy.invalidateOnEnvironmentChange
    && memory.environmentVersion
    && context.environmentVersion
    && memory.environmentVersion !== context.environmentVersion
  ) {
    reasons.push("ENVIRONMENT_CHANGED");
  }

  if (
    policy.invalidateOnToolMajorVersionChange
    && memory.toolVersion
    && context.toolVersion
    && major(memory.toolVersion) !== major(context.toolVersion)
  ) {
    reasons.push("TOOL_MAJOR_VERSION_CHANGED");
  }

  if (policy.maxAgeSeconds && memory.validFrom) {
    const ageSeconds = Math.max(0, (now.getTime() - memory.validFrom.getTime()) / 1000);
    if (ageSeconds > policy.maxAgeSeconds) reasons.push("MAX_AGE_EXCEEDED");
  }

  return { memoryId: memory.id, stale: reasons.length > 0, reasons };
}
