# Public Demo Surface — Frontend Usage

**Consumption mode:** `API_ONLY`

## What exists

The demo service provides Engram's deterministic causal proof workload. The public API exposes it through:

`POST /v1/demo/run`

The canonical runtime demo follows:

`Run A → operational memory → Run B`

where prior execution memory changes a later application action and the trace preserves the relationship.

The demo result now includes `runtimeReconstructedAfterRecall` and `evidenceBoundary.runtimeReconstruction`. The normal public demo does not request a reconstruction and reports `NOT_REQUESTED`; server-side verification can inject a fresh runtime after the persisted Run B recall and before the influenced decision, in which case the result reports the reconstruction explicitly.

## Frontend use cases

Use this endpoint for demo screens, onboarding, judge walkthroughs, and visual explanations of memory-caused behavior without requiring an authenticated production workflow.

```ts
const result = await fetch(`${baseUrl}/v1/demo/run`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({}),
}).then(r => r.json());

console.log(result.runtimeReconstructedAfterRecall); // false for the normal public demo
```

## Important invariants

- external venue/workload execution is SIMULATED;
- the demo is evidence for Engram runtime semantics, not live market execution;
- UI should distinguish source execution, admitted memory, later recall, influence, counterfactual, and observed outcome;
- `runtimeReconstructedAfterRecall` is evidence metadata, not proof of a live deployment by itself;
- only the credentialed live verifier may promote runtime reconstruction against CockroachDB to LIVE VERIFIED;
- never label mere prompt inclusion as causal memory proof.

## Safety

This surface is `API_ONLY`. Do not import server runtime, CockroachDB, Bedrock, or credential-bearing modules into browser bundles. The browser should consume the serialized demo result through the HTTP API.

## Implementation/tests

- `services/demo/src/run-runtime-demo.ts`
- `services/demo/src/runtime-policy.ts`
- `services/demo/src/create-demo-runtime.ts`
- `tests/e2e/demo-orchestration.test.ts`
- `tests/runtime/recall-influence-state-integrity.test.ts`

**Evidence status:** TESTED for deterministic runtime behavior. External workload remains SIMULATED; CockroachDB reconstruction remains LIVE VERIFIED only after the credentialed verification workflow succeeds.