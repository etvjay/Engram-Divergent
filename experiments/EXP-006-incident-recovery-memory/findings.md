# EXP-006 — Findings

Date: 2026-08-16
Evidence run: GitHub Actions Engram CI `31935273665`
Result: **PASS**

## Findings

The full `EngramRuntime` causal lifecycle passes for incident recovery:

1. Source execution starts with no relevant memory and selects `RESTART_ALL`.
2. The recovery restores the primary fleet but creates a `THUNDERING_HERD`, prolonged customer impact, and a `PARTIAL` outcome.
3. Engram observes that degraded recovery and admits a durable Operational Memory describing the recovery consequence and recommended alternative.
4. A same-context control intentionally omits recall, repeats `RESTART_ALL`, and reproduces the secondary failure.
5. A treatment execution recalls the admitted source memory.
6. The incident application changes to `ISOLATE_DRAIN_STAGED_RESTART`.
7. Engram records `CHANGED_ACTION` with the exact retrieval ID and the real control execution as `CONTROL_RUN` counterfactual evidence.
8. Treatment succeeds with contained impact and lower simulated time-to-recovery.
9. The treatment trace contains an accepted influence edge and successful outcome.

## Interpretation

Execution Memory covers the consequences of **recovery actions**, not only initial task actions. A recovery may achieve its immediate objective while still create operational evidence that should constrain future recovery under comparable conditions.

The strongest causal form is:

`source recovery consequence → admitted memory → same-context memory-free control → treatment recall → explicit changed-action edge → observed outcome difference`

## Boundary

The incident/recovery workload is deterministic and **SIMULATED**. Runtime lifecycle and provenance are tested; live infrastructure orchestration is not claimed.
