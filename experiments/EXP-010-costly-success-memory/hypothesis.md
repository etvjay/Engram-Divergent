# EXP-010 — Hypothesis

Date: 2026-08-16

## Question

Can Engram preserve a materially expensive but otherwise successful execution as Operational Memory and allow that experience to change a later comparable strategy without misclassifying the source execution as a failure?

## Hypothesis

A prior `SUCCESS` should remain eligible for memory admission when observed execution evidence contains `SIGNIFICANT_COST`. Under comparable future context, the application may use that memory to choose a lower-cost strategy while Engram preserves exact recall, influence, counterfactual and outcome provenance.

## Expected causal chain

`successful expensive execution → SIGNIFICANT_COST memory → same-context memory-free control → treatment recall → changed strategy → successful lower-cost outcome`

## Invariants

1. Source outcome remains `SUCCESS`.
2. Cost is recorded as an operational consequence, not rewritten as failure.
3. A real memory-free control establishes the baseline.
4. `CHANGED_ACTION` references the exact retrieval that exposed the memory.
5. Lower-cost treatment must preserve accepted output quality.
6. High-scoring but scope-inapplicable cost memory must not control action.

## Boundary

The workload and cost model are deterministic and SIMULATED. This experiment does not prove live compute-cost savings.