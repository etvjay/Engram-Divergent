# EXP-007 — Findings

Date: 2026-08-16
Evidence runs:
- workload/negative-control suite: GitHub Actions Engram CI `31935273665`
- full runtime E2E: GitHub Actions Engram CI `31935526015`
Result: **PASS**

## Automated proofs

- `tests/scenarios/coding-memory.test.ts` — workload applicability and negative controls.
- `tests/e2e/coding-regression-memory.test.ts` — full EngramRuntime source/control/treatment causal lifecycle.

## Findings

1. Source execution begins without relevant memory and selects `PATCH_FIRST`.
2. The simulated implicit-behavior patch produces `BEHAVIORAL_REGRESSION`, `REVERT_PATCH`, and a `COMPENSATED` outcome.
3. Engram observes the regression/recovery and admits an Operational Memory describing the comparable parser failure and preferred test-first methodology.
4. A same-context control deliberately omits recall, repeats `PATCH_FIRST`, and reproduces the regression.
5. Treatment recalls the admitted source memory and the coding application changes to `REGRESSION_TEST_THEN_PATCH`.
6. Engram records the exact retrieval, `CHANGED_ACTION`, and the real control execution as `CONTROL_RUN` counterfactual provenance.
7. Treatment succeeds with a regression test added.
8. The treatment trace contains a successful outcome and an accepted influence edge.
9. Workload-level negative controls show that very high retrieval score still cannot change action when subsystem or behavior class differs.

## Interpretation

Execution Memory can change an autonomous system's **work methodology**, not merely its destination, provider, or route. The stronger E2E demonstrates the same causal spine as deployment and incident recovery:

`source execution → admitted memory → memory-free control → treatment recall → changed-action provenance → observed outcome`

Retrieval score remains insufficient authority; operational applicability is still required.

## Boundary

The coding executor is deterministic and **SIMULATED**. Runtime lifecycle and provenance are tested; a live repository-writing coding-agent integration is not claimed.
