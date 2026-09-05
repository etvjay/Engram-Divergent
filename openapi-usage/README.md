# Engram OpenAPI Contract — Frontend Usage

**Consumption mode:** `BROWSER_SAFE`

## What exists

`openapi.json` is the machine-readable HTTP contract for the Engram API.

Use it to:

- inspect available routes and response shapes;
- generate typed clients;
- validate frontend assumptions against backend contracts;
- derive mock fixtures without reading server implementation.

The `AdmissionSignal` schema includes optional `sourceExecutionIds` for memories supported by multiple executions, such as a `REPEATED_PATTERN` observed across several same-agent runs.

## Example

A frontend toolchain may generate a client from `openapi.json` and bind it to an environment-specific Engram API base URL.

```bash
npx openapi-typescript openapi.json -o src/generated/engram-api.d.ts
```

A generated `AdmissionSignal` client type should expose the multi-source provenance field:

```ts
const signal = {
  kind: "REPEATED_PATTERN",
  summary: "Comparable executions repeatedly required clarification.",
  evidenceState: "OBSERVED",
  sourceExecutionIds: [runAId, runBId, currentRunId],
};
```

The runtime requires explicit source sets to include the admitting execution and to reference existing executions owned by the same Engram agent. Multiple source IDs are provenance, not automatic proof or a confidence multiplier.

The generated types describe transport shapes only; bind requests to the appropriate API base URL and authorization boundary in your application.

Do not hardcode production credentials into generated code.

## Current important routes

- `GET /health`
- `POST /v1/demo/run`
- execution start/recall/decision/observation/complete/trace routes;
- control-plane read routes;
- evaluation read routes;
- MCP inspection/status routes.

Refer to the JSON file itself for canonical operation schemas.

## Important invariants

- the OpenAPI contract describes transport shape, not product semantics by itself;
- protected routes still require an appropriate server/session authorization strategy;
- generated clients must not introduce a second set of memory semantics;
- API and SDK should continue to mirror the same runtime authority;
- `sourceExecutionIds` preserves source lineage and must not be presented as if source count alone proves a memory true.

## Implementation/tests

- `openapi.json`
- `services/api/src/handler.ts`
- `packages/runtime/src/types.ts`
- `packages/runtime/src/runtime.ts`
- `tests/conformance/api-contract.test.ts`
- `tests/runtime/multi-source-admission.test.ts`

**Evidence status:** IMPLEMENTED for multi-source admission; API contract behavior is TESTED once the exact-head aggregate CI containing the new conformance/runtime tests succeeds. Public deployment remains UNVERIFIED.