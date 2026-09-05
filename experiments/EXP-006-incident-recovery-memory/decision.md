# EXP-006 — Decision

Date: 2026-08-16
Status: **ACCEPTED**
Evidence run: GitHub Actions Engram CI `31935273665`

## Decision

Incident recovery is accepted as a canonical Engram execution-memory acceptance scenario.

It validates:

`recovery consequence → operational memory → comparable recall → changed recovery action → observed outcome difference`

## Required causal form

For strong recovery scenarios Engram should prefer a real same-context control execution when practical:

- source execution establishes the recovery consequence;
- Engram admits the consequence as Operational Memory;
- control excludes recall and records the memory-free action/outcome;
- treatment recalls the memory and changes application behavior;
- the influence edge cites the exact retrieval and the control execution as counterfactual provenance;
- treatment outcome is observed afterward.

## Architectural consequence

Recovery strategy remains workload/application logic. Engram records evidence, admits memory, governs exposure/influence eligibility, and preserves causal provenance; it does not become an incident-response planner.

## Boundary

The incident executor is **SIMULATED**. Live infrastructure recovery remains externally unverified.
