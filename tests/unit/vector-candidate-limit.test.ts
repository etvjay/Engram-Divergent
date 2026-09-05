import { afterEach, describe, expect, it } from "vitest";
import { resolveVectorCandidateLimit } from "../../packages/cockroach/src/repository.js";

describe("resolveVectorCandidateLimit", () => {
  afterEach(() => {
    delete process.env.ENGRAM_VECTOR_CANDIDATE_LIMIT;
  });

  it("defaults to a 64-candidate envelope for the normal top-8 retrieval", () => {
    expect(resolveVectorCandidateLimit(8)).toBe(64);
  });

  it("scales with larger result limits", () => {
    expect(resolveVectorCandidateLimit(20)).toBe(160);
  });

  it("never permits a configured candidate limit below the requested result limit", () => {
    process.env.ENGRAM_VECTOR_CANDIDATE_LIMIT = "4";
    expect(resolveVectorCandidateLimit(8)).toBe(8);
  });

  it("caps the candidate envelope", () => {
    process.env.ENGRAM_VECTOR_CANDIDATE_LIMIT = "1000";
    expect(resolveVectorCandidateLimit(8)).toBe(400);
  });
});
