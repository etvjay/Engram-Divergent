# EXP-009 — Human Correction / Safety Intervention

## Hypothesis

Engram should preserve an explicit human correction as operational experience even when the autonomous proposal is stopped before harmful execution occurs.

When a human operator rejects `IMMEDIATE_BLOCKING_REBUILD` for a production database index during peak traffic and requires `ONLINE_STAGED_REBUILD`, a later comparable autonomous maintenance execution should recall that correction and change its proposal before the human must intervene again.

## Source execution

- no relevant prior memory;
- application proposes `IMMEDIATE_BLOCKING_REBUILD`;
- human operator rejects the proposal before execution;
- execution ends `ABORTED` rather than pretending the rejected action succeeded or failed;
- Engram admits a `HUMAN_CORRECTION` Operational Memory preserving the rejected strategy, corrected strategy, scope, and human provenance.

## Control

A same-context memory-free execution deliberately omits recall and repeats `IMMEDIATE_BLOCKING_REBUILD`.

## Treatment

A same-context execution recalls the correction memory and changes the application proposal to `ONLINE_STAGED_REBUILD`. Engram records the exact retrieval, `CHANGED_ACTION`, and the control execution as `CONTROL_RUN` counterfactual evidence.

## Negative controls

The correction must not be overgeneralized when:

- traffic class changes from `PEAK` to `OFF_PEAK`; or
- resource class changes from `DATABASE_INDEX` to another resource.

## Principle under test

Operational memory may originate from authoritative human correction, not only autonomous failure/recovery.

## Boundary

The maintenance workload is deterministic and SIMULATED. No live infrastructure modification is performed or claimed.
