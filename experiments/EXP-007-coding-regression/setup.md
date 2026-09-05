# EXP-007 Setup

## Automated proof

Scenario applicability and negative controls:

- `tests/scenarios/coding-memory.test.ts`
- `packages/scenarios/coding/src/index.ts`

Full EngramRuntime causal proof:

- `tests/e2e/coding-regression-memory.test.ts`

## Current task

An autonomous coding agent must modify implicit parser behavior.

### Memory-free baseline

`PATCH_FIRST`

The deterministic simulator models patch-first modification of implicit behavior as producing `BEHAVIORAL_REGRESSION`, followed by `REVERT_PATCH` and a `COMPENSATED` outcome.

### Memory-constrained strategy

`REGRESSION_TEST_THEN_PATCH`

A prior Operational Memory is applicable only when it records:

- workflow `autonomous_coding`;
- failure `BEHAVIORAL_REGRESSION`;
- the same subsystem;
- implicit prior behavior;
- sufficient confidence and retrieval score.

## Scenario-level assertions

1. Control without memory chooses `PATCH_FIRST` and is compensated after regression.
2. Treatment with applicable memory chooses `REGRESSION_TEST_THEN_PATCH` and succeeds.
3. A high-score memory from another subsystem does not change action.
4. A prior implicit-behavior failure does not automatically constrain a current explicit/well-tested behavior change.

## Runtime-level assertions

1. Source execution starts with no relevant memory, observes the regression and revert, then admits the recovery lesson.
2. A separate same-context control execution deliberately omits recall and reproduces the regression.
3. Treatment recall exposes the source memory.
4. The application selects `REGRESSION_TEST_THEN_PATCH`.
5. Engram records `CHANGED_ACTION` through the exact recall.
6. The counterfactual source is `CONTROL_RUN` and references the actual control execution ID.
7. Treatment succeeds and the trace records `INFLUENCE_ACCEPTED`.

## Evidence classification

- coding task execution: SIMULATED;
- scenario applicability/negative controls: TESTED by the existing accepted EXP-007 evidence;
- full runtime causal proof: pending CI acceptance for `tests/e2e/coding-regression-memory.test.ts`;
- live coding-agent integration: UNVERIFIED / outside EXP-007.
