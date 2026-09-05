# EXP-006 — Setup

## Automated proof

Scenario applicability and negative controls:

- `tests/scenarios/incident-memory.test.ts`
- `packages/scenarios/incident-response/src/index.ts`

Full EngramRuntime causal proof:

- `tests/e2e/incident-recovery-memory.test.ts`

## Current incident

A large `checkout-worker` fleet is unhealthy while a dependency is saturated.

### Memory-free baseline

`RESTART_ALL`

The deterministic simulator models restart-all into dependency saturation as restoring the primary fleet but causing `THUNDERING_HERD`, 24-minute recovery, prolonged customer impact, and a `PARTIAL` outcome.

### Memory-constrained strategy

`ISOLATE_DRAIN_STAGED_RESTART`

Applicable memory must preserve the comparable saturated-dependency failure mode and the harmful consequence of the prior restart-all recovery. The scenario-level negative controls ensure a different failure mode or small fleet does not inherit the constraint solely from a high retrieval score.

## Runtime causal conditions

1. Source execution starts with no relevant memory, performs restart-all, observes primary recovery plus the secondary thundering herd, and admits the resulting operational lesson.
2. A separate same-context control deliberately excludes recall, repeats restart-all, and reproduces the partial/degraded outcome.
3. Treatment recall exposes the source memory.
4. The application changes to isolate/drain/staged restart.
5. Engram records `CHANGED_ACTION` through the exact retrieval.
6. The counterfactual uses `CONTROL_RUN` and the actual control execution ID.
7. Treatment succeeds in 9 simulated minutes with contained customer impact.

## Evidence

Full runtime/coding/incident aggregate suite: GitHub Actions Engram CI `31935548397` — PASS.

## Boundary

Incident orchestration is SIMULATED. Live infrastructure recovery remains separately UNVERIFIED.
