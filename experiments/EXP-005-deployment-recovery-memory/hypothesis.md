# EXP-005 — Deployment Recovery Memory

## Hypothesis

A prior schema-deployment failure and successful rollback should change a later comparable deployment strategy when the execution experience is recalled through Engram.

For the same production schema-change context:

- source execution without relevant memory selects `DIRECT_MIGRATION`, encounters `MIGRATION_LOCK_TIMEOUT`, and recovers through `ROLLBACK_SCHEMA_CHANGE`;
- Engram admits that failure/recovery experience as Operational Memory;
- a same-context control deliberately omits recall and repeats the direct-migration baseline;
- a treatment recalls the source memory and the application changes to `EXPAND_CONTRACT`;
- Engram records the exact retrieval, `CHANGED_ACTION` influence, and real control execution as counterfactual provenance;
- treatment succeeds.

## Principle under test

`failure + recovery → operational memory → comparable recall → changed application action → observed outcome difference`

## Boundary

The deployment executor is deterministic and SIMULATED. Runtime lifecycle and causal provenance are real test behavior; no live production deployment is claimed.
