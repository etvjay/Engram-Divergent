# TypeScript SDK — Frontend Usage

**Consumption mode:** `BROWSER_CONDITIONAL`

## What exists

`packages/sdk/src/index.ts` exposes `Engram`, `EngramExecution`, `EngramTransport`, `runtimeTransport`, `httpTransport`, and `EngramHttpError`.

For frontend applications, use **`httpTransport`**. `runtimeTransport` embeds `EngramRuntime` in-process and is not the normal browser boundary.

## Canonical usage

```ts
import { Engram, httpTransport } from "<engram-sdk-path>";

const engram = new Engram(httpTransport({
  baseUrl: ENGRAM_API_BASE_URL,
  // apiToken only when your deployment has a browser-safe user/session token.
}));

const run = await engram.startExecution({
  agentId: "ui-agent",
  workflowType: "example",
  intent: "Perform a task",
  context: {},
  constraints: {},
});

const recall = await run.recall({ query: "comparable prior executions" });
const trace = await run.trace();
```

## Execution-scoped methods

- `recall({ query, status? })`
- `recordDecision(...)`
- `observe(...)`
- `complete(...)`
- `trace()`

The application decides the action. Engram does not provide `run.decide()`.

## Multi-source memory admission

An admission signal may optionally declare `sourceExecutionIds` when the memory claim is supported by multiple executions—for example a `REPEATED_PATTERN` observed across several comparable runs.

```ts
await run.complete({
  status: "SUCCESS",
  summary: "The third comparable handoff confirmed the recurring clarification pattern.",
  evidenceState: "OBSERVED",
  admissionSignals: [{
    kind: "REPEATED_PATTERN",
    summary: "Minimal handoffs repeatedly cause executor clarification.",
    evidenceState: "OBSERVED",
    sourceExecutionIds: [runAId, runBId, run.executionId],
    details: {
      pattern: "MISSING_CONSTRAINTS_CAUSES_CLARIFICATION",
    },
  }],
});
```

Rules enforced by the runtime:

- omitted `sourceExecutionIds` preserves the historical single-source behavior;
- duplicate IDs are deduplicated;
- the execution admitting the memory must be included in an explicit source set;
- every source execution must exist;
- every source execution must belong to the same Engram agent as the admitting execution;
- invalid provenance rejects that admission signal rather than fabricating a multi-source memory.

Use this field only when the source executions actually support the memory claim. Do not manufacture a multi-source set in UI code merely to increase apparent confidence.

## Authentication

The current protected `/v1` API uses bearer authorization. **Do not embed the privileged MVP `ENGRAM_API_TOKEN` in a public static frontend.** Use a server-side/BFF/session boundary unless the token is explicitly designed for the end user.

Public endpoints currently include `/health` and `/v1/demo/run`.

## Important invariants

- recall does not imply influence;
- influence must reference memory actually exposed by the referenced retrieval;
- `CHANGED_ACTION` requires counterfactual evidence under the configured policy;
- do not invent counterfactuals in UI code;
- use API/server state as canonical, not local component state;
- multi-source provenance identifies evidence sources; it does not make the resulting memory automatically true or globally applicable.

## Implementation/tests

- `packages/sdk/src/index.ts`
- `packages/sdk/src/http.ts`
- `packages/runtime/src/types.ts`
- `packages/runtime/src/runtime.ts`
- `tests/sdk/sdk.test.ts`
- `tests/sdk/http-transport.test.ts`
- `tests/runtime/multi-source-admission.test.ts`
- `tests/e2e/repeated-handoff-pattern-memory.test.ts`

**Evidence status:** TESTED. Multi-source admission, runtime provenance validation, SDK/API/OpenAPI contract exposure, and the repeated-pattern causal example passed Engram CI `31937605893`. Published package registry consumption and public authenticated deployment remain UNVERIFIED.