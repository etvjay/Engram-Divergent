# EXP-010 — Decision

Date: 2026-08-16
Status: **ACCEPTED**
Evidence: GitHub Actions Engram CI `31935999992`

## Decision

Costly success is accepted as a canonical Engram execution-memory scenario.

Engram may preserve a successful execution as Operational Memory when observed evidence contains a materially significant cost or similar operational consequence. The source execution remains `SUCCESS`; consequence and outcome are not collapsed into one label.

## Accepted invariant

`successful execution + significant operational consequence → memory → comparable recall → changed later action`

For this scenario:

- source/control strategy: `FULL_RECOMPUTE`;
- source/control outcome: `SUCCESS`;
- source/control simulated cost: 120;
- treatment strategy: `INCREMENTAL_REUSE`;
- treatment outcome: `SUCCESS`;
- treatment simulated cost: 18;
- counterfactual source: real same-context `CONTROL_RUN`.

## Architectural consequence

Memory admission must remain consequence-aware rather than failure-only. Applications still own the optimization decision; Engram preserves evidence, recall, influence and counterfactual provenance.

No single successful outcome is sufficient evidence that a memory or strategy is beneficial. Explicit evaluation remains the mechanism for usefulness claims.

## Boundary

The workload and cost model are **SIMULATED**. Live cost savings remain unverified.