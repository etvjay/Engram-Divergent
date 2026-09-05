import type { MemoryRelationship } from "./domain.js";

export type MemoryRelationshipAssessment = {
  memoryId: string;
  contradicts: string[];
  qualifies: string[];
  supersedes: string[];
  supersededBy: string[];
  unresolvedContradictions: string[];
  warnings: string[];
};

/**
 * Summarize only relationships that have already been explicitly assessed.
 * Engram does not infer contradiction or supersession from embedding distance.
 */
export function assessMemoryRelationships(
  memoryId: string,
  relationships: MemoryRelationship[],
): MemoryRelationshipAssessment {
  const contradicts = new Set<string>();
  const qualifies = new Set<string>();
  const supersedes = new Set<string>();
  const supersededBy = new Set<string>();

  for (const relationship of relationships) {
    if (relationship.leftMemoryId !== memoryId && relationship.rightMemoryId !== memoryId) continue;
    const other = relationship.leftMemoryId === memoryId
      ? relationship.rightMemoryId
      : relationship.leftMemoryId;

    switch (relationship.relation) {
      case "CONTRADICTS":
        contradicts.add(other);
        break;
      case "QUALIFIES":
        qualifies.add(other);
        break;
      case "SUPERSEDES":
        if (relationship.leftMemoryId === memoryId) supersedes.add(other);
        else supersededBy.add(other);
        break;
      case "INDEPENDENT":
      case "UNKNOWN":
        break;
    }
  }

  const unresolvedContradictions = [...contradicts].filter((other) =>
    !supersedes.has(other) && !supersededBy.has(other),
  );
  const warnings: string[] = [];
  if (unresolvedContradictions.length) warnings.push("UNRESOLVED_CONTRADICTION");
  if (supersededBy.size) warnings.push("MEMORY_SUPERSEDED");

  return {
    memoryId,
    contradicts: [...contradicts],
    qualifies: [...qualifies],
    supersedes: [...supersedes],
    supersededBy: [...supersededBy],
    unresolvedContradictions,
    warnings,
  };
}
