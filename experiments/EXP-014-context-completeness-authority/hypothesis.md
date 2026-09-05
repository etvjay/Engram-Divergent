# EXP-014 — Context Completeness Authority Boundary

Date: 2026-08-16

## Hypothesis

A version-bound Operational Memory must not gain current action authority merely because the future execution omitted the environment or tool metadata needed to determine whether the memory is still compatible.

If a memory carries an `environmentVersion` or `toolVersion` that participates in active invalidation policy, absence of the corresponding execution metadata is **unknown compatibility**, not compatible context.

Therefore Engram should fail closed before exposure when comparison context is missing, expose the same memory when sufficient compatible context is supplied, and continue rejecting it when supplied context proves incompatibility.

## Why this matters

Execution Memory can outlive the exact runtime, toolchain and environment that produced it. A high semantic score is not evidence that a lesson remains operationally safe under an unidentified environment.

Treating missing comparison metadata as compatibility would create an authority escalation path:

`version-bound historical memory → incomplete future context → no mismatch detected → memory exposed`

The desired boundary is:

`version-bound historical memory → incomplete future context → compatibility UNKNOWN → memory rejected before exposure`

## Acceptance criteria

Using the same high-scoring, high-confidence OBSERVED memory:

1. a future execution with missing environment/tool metadata rejects it before exposure with machine-readable missing-context reasons;
2. a future execution with matching environment and compatible tool-major metadata exposes it;
3. a future execution with explicit incompatible environment/tool metadata rejects it through the existing invalidation reasons;
4. no change is made to application/business action-selection semantics;
5. the repository test suite and evidence-registry conformance remain green.

## Boundary

This experiment tests runtime memory-authority policy. It does not prove that all applications provide complete context, nor does it infer missing metadata automatically.