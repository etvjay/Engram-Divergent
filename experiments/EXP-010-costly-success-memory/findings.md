# EXP-010 — Findings

Date: 2026-08-16
Evidence run: GitHub Actions Engram CI `31935999992`
Result: **PASS**

## Findings

1. The source execution completed `SUCCESS` with accepted output while consuming 120 simulated cost units.
2. `SIGNIFICANT_COST` was admitted as Operational Memory without altering the source outcome semantics.
3. A same-context memory-free control repeated `FULL_RECOMPUTE`, also succeeded, and consumed 120 units.
4. The treatment recalled the source cost memory and the application changed strategy to `INCREMENTAL_REUSE`.
5. Treatment remained `SUCCESS` with equivalent accepted output and consumed 18 units.
6. Engram recorded the exact retrieval, `CHANGED_ACTION`, and the real control execution as `CONTROL_RUN` counterfactual evidence.
7. Scope-negative controls prevented high-scoring but operationally inapplicable cost memory from controlling the later action.

## Interpretation

Execution Memory is not failure memory. A technically successful execution can still contain consequential operational experience when the cost, latency, resource use, or other consequence is materially undesirable.

The important causal form is:

`SUCCESS + significant consequence → operational memory → comparable recall → changed application strategy → observed consequence difference`

Engram therefore preserves outcome and consequence as separate dimensions. `SUCCESS` says the intended result was achieved; it does not assert the execution strategy was operationally efficient.

## Boundary

The compute workload and cost units are deterministic and **SIMULATED**. This test does not claim measured cloud-cost savings.