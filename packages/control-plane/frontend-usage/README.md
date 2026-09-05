# Control Plane Read Model — Frontend Usage

**Consumption mode:** `API_ONLY`

## What exists

`packages/control-plane/src/types.ts` and `store.ts` define read models for:

- agents;
- executions;
- memories;
- memory influences;
- policy bundles;
- policy assignments;
- overview metrics.

The CockroachDB-backed implementation lives server-side. Frontends should consume these views through the Engram HTTP API rather than importing storage code.

## Frontend use cases

Use the control-plane API for dashboards, execution lists, memory explorer views, influence inspection, and policy visibility.

The read model includes fields such as execution/memory counts, retrieval counts, exposed retrieval results, influenced decisions, changed actions, policy state, evidence-state counts, and source/provenance counters.

## Example

```ts
const overview = await fetch(`${baseUrl}/v1/control/overview`, {
  headers: { authorization: `Bearer ${sessionToken}` },
}).then((response) => response.json());

renderMetric("Executions", overview.executions);
renderMetric("Changed actions", overview.changedActions);
```

Use a user/session-safe authorization boundary. Do not expose the privileged deployment token in a public bundle.

## Important invariants

- counts are operational read-model data, not causal proof by themselves;
- `changedActions` means recorded `CHANGED_ACTION` influences, not automatic proof of benefit;
- evidence-state counts must preserve the underlying evidence labels;
- frontend should not query CockroachDB directly;
- policy bundle records are read-focused through the current frontend boundary.

## Access

Use the documented control-plane endpoints in `openapi.json` / `services/api`.

## Implementation/tests

- `packages/control-plane/src/types.ts`
- `packages/control-plane/src/store.ts`
- `packages/cockroach/src/control-plane.ts`
- `services/api/src/handler.ts`
- `tests/conformance/api-contract.test.ts`

**Evidence status:** TESTED for read-model/API contracts. Public AWS deployment remains UNVERIFIED.