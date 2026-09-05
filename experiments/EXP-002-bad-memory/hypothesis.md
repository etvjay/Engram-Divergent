# EXP-002 — Bad Memory Resistance

## Hypothesis

Engram should not allow a memory to influence an execution merely because semantic retrieval ranks it highly. Runtime policy must independently reject memories that are stale or otherwise ineligible, and influence policy must reject recalled memories whose evidence/confidence is insufficient.

## Attack cases

### A. High-score stale memory

A memory receives a high retrieval score but is:

- past `validUntil`;
- from a different environment version; and
- from an incompatible tool major version.

Expected behavior: candidate may be returned by database candidate generation, but runtime filtering rejects it before exposure. The persisted recall must show no exposed memory and a `RECALL_FILTERED` evaluation event.

### B. Recalled low-confidence memory

A current, semantically relevant memory passes recall eligibility but has confidence below the active influence-policy threshold.

Expected behavior: it may be exposed, but a later application attempt to cite it as decision influence is rejected with `CONFIDENCE_BELOW_THRESHOLD`. No decision-memory influence is persisted, and an `INFLUENCE_REJECTED` runtime evaluation is recorded.

## Falsification conditions

The hypothesis fails if:

- stale memory is exposed merely because its retrieval score is high;
- low-confidence memory is accepted as influence merely because it was recalled;
- a rejected influence is still persisted as a decision-memory relation;
- runtime rejection leaves no evaluation trace;
- historical memory is deleted or overwritten instead of being rejected for the current context.

## Principle under test

Retrieval, exposure, and influence are separate gates. Relevance is not authority.
