import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MemoryRelationship } from "../../packages/evaluation/src/domain.js";
import { assessMemoryRelationships } from "../../packages/evaluation/src/relationships.js";

function relation(
  leftMemoryId: string,
  rightMemoryId: string,
  relationType: MemoryRelationship["relation"],
): MemoryRelationship {
  return {
    id: randomUUID(),
    leftMemoryId,
    rightMemoryId,
    relation: relationType,
    rationale: `${relationType} assessed from explicit evidence`,
    evidenceState: "OBSERVED",
    method: "HUMAN_ASSESSMENT",
    assessedAt: new Date(),
  };
}

describe("memory relationship assessment", () => {
  it("flags an explicit contradiction as unresolved until supersession is assessed", () => {
    const older = randomUUID();
    const newer = randomUUID();

    const unresolved = assessMemoryRelationships(older, [
      relation(older, newer, "CONTRADICTS"),
    ]);
    expect(unresolved.unresolvedContradictions).toEqual([newer]);
    expect(unresolved.warnings).toContain("UNRESOLVED_CONTRADICTION");

    const resolved = assessMemoryRelationships(older, [
      relation(older, newer, "CONTRADICTS"),
      relation(newer, older, "SUPERSEDES"),
    ]);
    expect(resolved.unresolvedContradictions).toEqual([]);
    expect(resolved.supersededBy).toEqual([newer]);
    expect(resolved.warnings).toContain("MEMORY_SUPERSEDED");
  });

  it("does not invent conflict from unrelated or merely qualifying relationships", () => {
    const target = randomUUID();
    const qualifier = randomUUID();
    const unrelatedA = randomUUID();
    const unrelatedB = randomUUID();

    const result = assessMemoryRelationships(target, [
      relation(target, qualifier, "QUALIFIES"),
      relation(unrelatedA, unrelatedB, "CONTRADICTS"),
    ]);

    expect(result.qualifies).toEqual([qualifier]);
    expect(result.contradicts).toEqual([]);
    expect(result.unresolvedContradictions).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
