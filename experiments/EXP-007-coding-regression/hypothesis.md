# EXP-007 — Coding Regression Memory

## Hypothesis

A coding agent that previously caused a behavioral regression by patching implicit behavior without first pinning that behavior with a test should change strategy on a later comparable task.

For a comparable subsystem and implicit-behavior context, the prior execution memory should constrain the memory-free `PATCH_FIRST` baseline and cause the application to select `REGRESSION_TEST_THEN_PATCH`.

## Control

Same coding task, no applicable memory:

- choose `PATCH_FIRST`;
- implicit behavior regresses in the deterministic simulator;
- patch is reverted;
- outcome is `COMPENSATED`.

## Treatment

Same coding task, applicable prior regression memory:

- recall the prior regression/revert experience;
- choose `REGRESSION_TEST_THEN_PATCH`;
- record the exact memory reference;
- preserve `PATCH_FIRST` as the memory-free counterfactual;
- simulated task succeeds with a regression test added.

## Negative controls

The memory must not change the action merely because its retrieval score is high when:

1. the prior regression came from another subsystem; or
2. the current behavior is explicit/well-tested rather than implicit.

## Falsification

The hypothesis fails if high-score but context-inapplicable memory changes action, or if applicable memory fails to produce an explicit action change and counterfactual.

## Boundary

The coding executor is deterministic and SIMULATED. This experiment evaluates the portability of Engram's execution-memory semantics to coding-agent workflows; it is not evidence of a live repository-writing agent integration.
