# EXP-005 — Setup

## Automated proof

`tests/e2e/deployment-recovery-memory.test.ts`

## Runtime under test

The experiment drives `EngramRuntime` through the full source/control/treatment lifecycle.

### Source execution

1. Start a high-write production schema deployment with no relevant memory.
2. Recall returns no candidate.
3. Application selects `DIRECT_MIGRATION`.
4. Deterministic workload returns `MIGRATION_LOCK_TIMEOUT` and `ROLLBACK_SCHEMA_CHANGE`.
5. Engram observes the failure/recovery and admits an Operational Memory recommending `EXPAND_CONTRACT` for comparable work.

### Memory-free control

1. Start the same execution context.
2. Deliberately omit recall.
3. Application again selects `DIRECT_MIGRATION`.
4. The same simulated failure is reproduced.
5. The control execution becomes explicit counterfactual evidence.

### Treatment

1. Start the same execution context.
2. Recall the admitted source memory.
3. Application selects `EXPAND_CONTRACT`.
4. Record `CHANGED_ACTION` with exact retrieval ID and the control execution as `CONTROL_RUN` counterfactual.
5. Observe successful treatment outcome.

## Evidence boundary

- deployment workload: SIMULATED;
- Engram runtime lifecycle/provenance: TESTED when CI passes;
- live deployment integration: UNVERIFIED.
