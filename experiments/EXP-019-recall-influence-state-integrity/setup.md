# EXP-019 Setup

## Test shape

1. Seed one eligible Operational Memory.
2. Start a comparable execution and recall that memory.
3. Persist the exposed recall together with a versioned memory-state digest.
4. Reconstruct the Engram runtime from the same store to remove warm-process assumptions.
5. In the positive lane, leave the memory unchanged and record an influence using the persisted retrieval.
6. In adversarial lanes, mutate the same memory ID after recall and before influence.
7. Attempt to record a decision using the original retrieval.

## Adversarial mutations

The test changes each of the following independently behind the same memory ID:

- summary;
- structured context;
- confidence;
- evidence state;
- validity metadata;
- tool metadata;
- policy metadata.

A separate legacy lane removes the persisted digest entirely to represent an old recall record that never captured state continuity.

## Expected result

- unchanged persisted state remains eligible after runtime reconstruction;
- every authority-relevant mutation fails with `MEMORY_STATE_CHANGED_SINCE_RECALL`;
- a legacy/unbound persisted recall fails with `RECALL_MEMORY_STATE_UNBOUND`;
- rejected influence persists no decision and emits `INFLUENCE_REJECTED`;
- the binding survives storage reconstruction rather than depending on an in-memory runtime cache.

## Evidence classification

The experiment is deterministic runtime/storage-contract evidence. It does not promote CockroachDB Cloud or any external deployment claim to LIVE VERIFIED; those remain separately gated by credentialed verification.
