# EXP-008 — Competing Memory Provenance

## Hypothesis

When one execution performs multiple memory recalls, Engram must preserve the exact recall that exposed each memory used by a later decision. A valid memory ID paired with the wrong retrieval ID must be rejected rather than accepted because the memory happened to be recalled elsewhere in the same execution.

## Expected behavior

- correct memory + exact exposing retrieval is accepted;
- a memory paired with another recall's retrieval is rejected with `RETRIEVAL_MISMATCH`;
- the invalid decision is not persisted;
- an `INFLUENCE_REJECTED` runtime evaluation remains as evidence of the failed claim;
- Engram never silently substitutes a matching retrieval.

## Falsification

The hypothesis fails if execution-level recall membership is treated as sufficient influence provenance.

## Principle under test

`memory influence → exact retrieval → exact exposed memory`
