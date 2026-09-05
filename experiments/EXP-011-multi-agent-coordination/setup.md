# EXP-011 — Setup

## Automated proofs

- `packages/scenarios/multi-agent-coordination/src/index.ts`
- `tests/scenarios/multi-agent-coordination-memory.test.ts`
- `tests/e2e/multi-agent-coordination-memory.test.ts`

## Scenario

A coordinator delegates work to `worker-a` and `worker-b`. Both contributions target the same shared mutable artifact.

### Source execution

Memory-free coordinator strategy:

`PARALLEL_UNLEASED`

The deterministic workload produces:

- worker-a: `COMMITTED`;
- worker-b: `CONFLICTED`;
- conflict: `CONCURRENT_WRITE_CONFLICT`;
- outcome: `PARTIAL`.

The coordinator observes both worker results and admits an `UNEXPECTED_FAILURE` memory describing the failed coordination strategy and the recommended `LEASED_SERIALIZATION` strategy.

### Same-context control

A separate coordinator execution deliberately omits recall, repeats `PARALLEL_UNLEASED`, and reproduces the conflict. This is the real counterfactual baseline.

### Treatment

The same coordinator recalls the prior execution memory and selects:

`LEASED_SERIALIZATION`

Engram records:

- exact memory ID;
- exact retrieval ID;
- `CHANGED_ACTION`;
- `CONTROL_RUN` counterfactual referencing the real control execution.

Both workers then commit successfully in the deterministic workload.

## Agent-isolation assertion

The admitted memory belongs to `coordinator-agent`. Worker IDs are stored as evidence/details. Treatment retrieval contains only memories scoped to the coordinator agent. No team/shared-memory semantic is introduced.

## Negative controls

- independent artifacts / distinct targets remain safely parallel;
- similar conflict evidence from another workflow does not constrain coordination solely because retrieval score is high.

## Evidence

GitHub Actions Engram CI `31937169717` — PASS.

## Boundary

Coordination and worker execution are SIMULATED. Live distributed locks, leases, agents and schedulers remain UNVERIFIED.