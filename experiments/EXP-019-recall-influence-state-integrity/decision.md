# EXP-019 Decision

**Status:** ACCEPTED

Engram will treat recall-to-influence memory-state continuity as part of authoritative influence provenance.

For a current influence to rely on an exposed recall, that persisted recall must bind the authority-relevant Operational Memory state that was exposed. The runtime must recompute the current state digest before influence and fail closed when the binding is absent or no longer matches.

## Accepted rules

- memory identity alone is insufficient to prove recalled-state continuity;
- the persisted recall carries a versioned `memoryStateDigest`;
- current influence through a legacy/unbound recall is rejected with `RECALL_MEMORY_STATE_UNBOUND`;
- changed state behind the same memory ID is rejected with `MEMORY_STATE_CHANGED_SINCE_RECALL`;
- equivalent object key ordering must canonicalize to the same digest;
- state binding survives store reconstruction/cold runtime boundaries;
- this check composes with, and does not replace, exact retrieval identity, provenance authenticity, agent isolation, lifecycle eligibility, evidence-state limits, policy, and counterfactual authenticity.

## Acceptance evidence

- `packages/runtime/src/memory-state.ts`
- `packages/runtime/src/runtime.ts`
- `packages/core/src/protocol.ts`
- `packages/cockroach/src/runtime-store.ts`
- `db/migrations/008_recall_memory_state_digest.sql`
- `tests/runtime/recall-influence-state-integrity.test.ts`
- `tests/runtime/memory-state-digest.test.ts`
- full Engram CI `31947418007` — SUCCESS

The failed initial full-suite run `31947220066` remains useful negative evidence showing that a store that drops the state binding cannot support influence under this invariant.
