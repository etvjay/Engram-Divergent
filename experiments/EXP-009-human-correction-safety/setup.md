# EXP-009 — Setup

## Automated proofs

- `packages/scenarios/operator-safety/src/index.ts`
- `tests/scenarios/operator-safety-memory.test.ts`
- `tests/e2e/human-correction-memory.test.ts`

## Scenario

An autonomous maintenance application is asked to rebuild a degraded production database index during peak traffic.

### Memory-free baseline

`IMMEDIATE_BLOCKING_REBUILD`

### Human correction

The operator rejects the blocking proposal before execution and requires:

`ONLINE_STAGED_REBUILD`

The source execution records the rejection as observed human evidence and completes `ABORTED`. A `HUMAN_CORRECTION` admission signal preserves:

- workflow type;
- resource class;
- traffic class;
- rejected strategy;
- corrected strategy;
- correction source.

### Same-context control

A new execution deliberately omits recall and repeats the blocking proposal. This real control becomes the counterfactual evidence for the treatment.

### Treatment

A new execution recalls the human-correction memory, selects the corrected strategy, and records:

- exact memory ID;
- exact retrieval ID;
- `CHANGED_ACTION`;
- `CONTROL_RUN` counterfactual with the actual control execution ID.

## Negative-control assertions

High-scoring correction memory must not change action when either resource class or traffic class no longer matches the correction scope.

## Evidence classification

- maintenance workload: SIMULATED;
- human correction observation: deterministic test evidence;
- Engram runtime/provenance: pending exact-head CI acceptance;
- live infrastructure execution: UNVERIFIED / outside EXP-009.
