# EXP-001 Setup

## Workload

A deterministic TALOS-inspired multi-venue execution simulation. It is an Engram demonstration workload, not a TALOS port or product implementation.

## Fixed conditions

Both CONTROL and TREATMENT use:

- workflow type: `multi_venue_execution`
- intent: acquire the target asset using the lowest-risk available route
- environment version: `demo-v1`
- tool version: `execution-simulator-v1`
- risk tolerance: LOW
- allowed venues: A, B, C, D
- liquidity: A=100, B=100, C=20, D=100
- required liquidity: 50
- same deterministic route policy

## CONTROL

1. Start an execution with no relevant memory exposed.
2. Record the application-owned route decision.
3. Expected route: `A → B → C`.
4. Execute through the deterministic simulator.
5. Observe Venue C failure due to insufficient liquidity.
6. Observe recovery/compensation.
7. Complete the execution as `COMPENSATED`.
8. Submit an `UNEXPECTED_FAILURE` admission signal.
9. Persist the admitted Operational Memory with the source execution.

## TREATMENT

1. Start a second execution with the same fixed conditions.
2. Recall memories using the comparable thin-liquidity query.
3. Apply retrieval/expiry policy and persist which candidates were actually exposed.
4. Pass exposed candidates into the same route policy.
5. Expected route: `A → B → D`.
6. Record the application-owned route decision with an explicit `CHANGED_ACTION` influence.
7. Record the CONTROL route as the counterfactual action and the CONTROL execution ID as comparison evidence.
8. Execute Route D through the deterministic simulator.
9. Complete as `SUCCESS`.

## Required persisted proof chain

`CONTROL execution → admitted memory → TREATMENT retrieval → exposed memory → TREATMENT decision-memory relation → changed route → TREATMENT outcome`

## Automated implementations

- `services/demo/src/run-runtime-demo.ts`
- `tests/e2e/memory-caused-behavior.test.ts`
- `tests/e2e/demo-orchestration.test.ts`
- `packages/runtime/src/runtime.ts`
- `packages/cockroach/src/runtime-store.ts`

## External verification extension

The credentialed live-verification workflow repeats the Engram runtime/persistence/retrieval/provenance spine using CockroachDB Cloud, Bedrock embeddings, and Managed MCP. The external venue execution remains SIMULATED in that run.
