# EXP-008 Setup

## Automated proof

`tests/runtime/competing-memory-provenance.test.ts`

## Execution

One running execution performs two semantically distinct recalls:

1. recall A exposes memory A;
2. recall B exposes memory B.

## Correct-linkage case

- decision A cites memory A + retrieval A;
- decision B cites memory B + retrieval B;
- both influence edges preserve their exact retrieval IDs.

## Adversarial mismatch case

The application attempts to cite memory A + retrieval B.

Assertions:

- runtime rejects with `RETRIEVAL_MISMATCH`;
- no invalid decision is persisted by the adversarial store;
- `INFLUENCE_REJECTED` is recorded;
- runtime does not repair the mismatch.

## Evidence boundary

This is deterministic runtime provenance evidence. Credentialed CockroachDB reconstruction remains separately live-verification-gated.
