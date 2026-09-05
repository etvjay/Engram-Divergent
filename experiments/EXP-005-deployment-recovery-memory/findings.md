# EXP-005 — Findings

Date: 2026-08-16
Evidence: GitHub Actions Engram CI `31935125047`; later combined Engram CI `31935273665` also includes the E2E.
Result: **PASS**

## Findings

1. The source execution begins with no relevant memory and chooses the memory-free `DIRECT_MIGRATION` baseline.
2. The simulated deployment fails with `MIGRATION_LOCK_TIMEOUT` and recovers via `ROLLBACK_SCHEMA_CHANGE`.
3. Engram admits the failure/recovery experience as Operational Memory.
4. A same-context control that omits recall repeats the unsafe baseline and reproduces the failure.
5. Treatment recalls the admitted source memory and the application changes to `EXPAND_CONTRACT`.
6. Engram records the exact retrieval, a `CHANGED_ACTION` influence edge, and the real control execution as `CONTROL_RUN` counterfactual evidence.
7. The treatment outcome is observed as successful.

## Interpretation

This is a stronger causal proof than a workload-only before/after test because the memory itself is derived from an earlier execution, the baseline is represented by a real control execution, and the treatment influence edge is reconstructable through the runtime.

## Boundary

The deployment executor is deterministic and SIMULATED. This result does not establish a live production deployment integration.
