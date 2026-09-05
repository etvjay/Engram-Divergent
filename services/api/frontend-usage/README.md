# Engram HTTP API — Frontend Usage

**Consumption mode:** `API_ONLY`

## What exists

`services/api/src/handler.ts` exposes the canonical HTTP boundary for execution lifecycle, trace reconstruction, control-plane reads, evaluation reads, demo execution and MCP inspection/status surfaces.

Use `openapi.json` as the route/schema contract rather than guessing endpoint shapes from the handler.

## Frontend integration

Typical flow:

```ts
const run = await fetch(`${baseUrl}/v1/executions`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${sessionToken}`,
  },
  body: JSON.stringify({
    agentId: "agent-1",
    workflowType: "research",
    intent: "Investigate topic",
    context: {},
    constraints: {},
  }),
}).then(r => r.json());

const trace = await fetch(`${baseUrl}/v1/executions/${run.executionId}/trace`, {
  headers: { authorization: `Bearer ${sessionToken}` },
}).then(r => r.json());
```

## Completing with multi-source admission evidence

`POST /v1/executions/{id}/complete` accepts admission signals. An admission signal may include `sourceExecutionIds` when its claim is supported by multiple same-agent executions.

```ts
await fetch(`${baseUrl}/v1/executions/${currentExecutionId}/complete`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${sessionToken}`,
  },
  body: JSON.stringify({
    status: "SUCCESS",
    summary: "Third comparable run confirmed the repeated pattern.",
    evidenceState: "OBSERVED",
    admissionSignals: [{
      kind: "REPEATED_PATTERN",
      summary: "Minimal handoffs repeatedly cause executor clarification.",
      evidenceState: "OBSERVED",
      sourceExecutionIds: [runAId, runBId, currentExecutionId],
      details: {
        pattern: "MISSING_CONSTRAINTS_CAUSES_CLARIFICATION",
      },
    }],
  }),
});
```

Runtime rules for an explicit source set:

- duplicate execution IDs are deduplicated;
- the execution being completed must be included;
- every source execution must exist and belong to the same Engram agent;
- an invalid source set rejects the memory admission signal;
- omitting the field preserves normal single-source admission.

`sourceExecutionIds` is provenance, not a confidence multiplier. Frontends should display source lineage without implying that multiple sources automatically make a derived memory true.

## Public surfaces

- `GET /health`
- `POST /v1/demo/run`

All other `/v1` routes are protected in the MVP.

## Security

Do not expose `ENGRAM_API_TOKEN` in a public static frontend. The current single bearer token is a deployment guard, not user/session RBAC.

## Important invariants

- the frontend/application owns action selection;
- trace/read endpoints reconstruct server-side evidence;
- control-plane/evaluation state should be rendered as evidence, not silently converted into truth claims;
- external demo execution remains SIMULATED;
- multi-source admission must retain exact source execution IDs rather than collapsing a pattern claim onto one convenient run.

## Canonical contract/tests

- `openapi.json`
- `services/api/src/handler.ts`
- `services/api/src/auth.ts`
- `packages/runtime/src/types.ts`
- `packages/runtime/src/runtime.ts`
- `tests/conformance/api-contract.test.ts`
- `tests/security/api-inspection-auth.test.ts`
- `tests/runtime/multi-source-admission.test.ts`
- `tests/e2e/repeated-handoff-pattern-memory.test.ts`

**Evidence status:** TESTED. Multi-source admission, runtime provenance validation, the HTTP/OpenAPI contract, and the repeated-pattern causal example passed Engram CI `31937605893`. Public AWS deployment remains UNVERIFIED.