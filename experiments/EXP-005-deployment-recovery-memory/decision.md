# EXP-005 — Decision

Date: 2026-08-16
Status: **ACCEPTED**
Evidence: GitHub Actions Engram CI `31935125047` and later combined run `31935273665`.

## Decision

Deployment recovery is a canonical Engram execution-memory acceptance scenario.

It validates:

`failure + recovery → operational memory → comparable recall → changed application action → observed outcome difference`

## Required causal form

Stronger Engram scenarios should use real control executions where practical. `CHANGED_ACTION` should not rely on an invented baseline when a controlled replay or same-context run can supply stronger evidence.

The scenario-specific decision rule remains outside Engram runtime core. Engram owns execution evidence, memory lifecycle, recall exposure, influence validation and provenance; the deployment application owns strategy selection.

## Boundary

The deployment workload is **SIMULATED**. Live production deployment remains externally unverified.
