# EXP-008 Findings

## Evidence

GitHub Actions Engram CI runs `31923329226`, `31935001862`, and later combined scenario run `31935273665` all pass the repository suite containing `tests/runtime/competing-memory-provenance.test.ts`.

## Findings

1. Distinct recalls preserve distinct retrieval identities.
2. An influence is valid only when its retrieval actually exposed the cited memory.
3. A valid memory paired with the wrong retrieval fails closed with `RETRIEVAL_MISMATCH`.
4. Engram does not silently repair or substitute provenance.
5. The rejected influence remains observable as `INFLUENCE_REJECTED`.
6. The invalid decision is not persisted by the adversarial test store.

## Interpretation

Exact retrieval identity is part of memory-to-action provenance. “The memory was recalled somewhere in the execution” is insufficient when multiple recalls, retries, tools, or decision stages exist.

## Boundary

This is deterministic runtime evidence. Live CockroachDB trace reconstruction remains separately promoted through the credentialed integration path.
