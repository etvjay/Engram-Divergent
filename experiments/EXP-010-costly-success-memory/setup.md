# EXP-010 — Setup

## Automated proofs

- `packages/scenarios/cost-aware/src/index.ts`
- `tests/scenarios/cost-aware-memory.test.ts`
- `tests/e2e/costly-success-memory.test.ts`

## Scenario

A compute-heavy application produces acceptable output using `FULL_RECOMPUTE`.

### Source execution

- strategy: `FULL_RECOMPUTE`
- outcome: `SUCCESS`
- accepted output quality: unchanged
- simulated cost: 120 units
- admission signal: `SIGNIFICANT_COST`

Engram must preserve this as expensive successful experience rather than rewriting it as failure.

### Memory-free control

A separate same-context execution deliberately omits memory recall:

- strategy: `FULL_RECOMPUTE`
- outcome: `SUCCESS`
- cost: 120 units

This control supplies the real baseline for later `CHANGED_ACTION` provenance.

### Treatment

A comparable execution recalls the cost memory and the application selects `INCREMENTAL_REUSE`:

- outcome: `SUCCESS`
- accepted output quality: equal to control/source
- cost: 18 units

Engram records the exact memory ID, retrieval ID, `CHANGED_ACTION`, and a `CONTROL_RUN` counterfactual referencing the actual control execution.

## Negative controls

High retrieval score is insufficient if the remembered cost applies to a materially different workload scope or execution condition.

## Evidence

GitHub Actions Engram CI `31935999992` — PASS.

## Boundary

The workload and cost model are deterministic and SIMULATED. The experiment proves execution-memory semantics and provenance, not real cloud billing reduction.