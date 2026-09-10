# `@sibylengram/agent-surface`

Reusable, bounded Engram HTTP API boundary over the canonical `AgentSurface`.
The package owns transport concerns; domain behavior remains injected through
`surface` or `BehavioralMemoryStore`.

## Deployment modes

- **local-loopback (default):** intended for a same-machine consumer. Requests
  from non-loopback peers are rejected and no credentials are implied. Health
  reports `evidence: LOCAL_LOOPBACK`.
- **hosted-authenticated:** requires an injected `authenticate(context)`
  callback. If no authenticator is configured the server fails closed with
  `AUTHENTICATOR_REQUIRED`; denied requests return normalized `UNAUTHORIZED`.
  This package does not claim hosted deployment, TLS termination, identity
  issuance, or credential storage.

## Contract and routes

`openapi.json` is the OpenAPI 3.0.3 contract and `ROUTES` is the executable route
matrix. `tests/api/openapi-contract.test.ts` requires exact parity.

- `GET /v1/health`, `GET /v1/capabilities` — read
- `POST /v1/executions/complete` — write → `record_complete_execution`
- `POST /v1/memories/recall` — read → `recall_applicable_memory`
- `POST /v1/influence/requests` — write → `request_influence`
- `POST /v1/outcome-evaluations` — write → `submit_outcome_evaluation`
- `GET /v1/evaluations/{summary,arms,scorecard,memory-updates,authority,evidence}` — read

All POST requests require an `Idempotency-Key` (bounded token). A repeated key
with the same route and body replays the bounded response; reusing it with a
different body returns `409 IDEMPOTENCY_KEY_REUSED`. Keys are process-local and
must be backed by durable storage before multi-instance hosted deployment.

Bodies and responses are capped at 1 MiB. Upstream calls have a configurable
1–120 second timeout (10 seconds default). Every response includes `requestId`
and `x-request-id`; errors use a stable `{ error: { code, message }, requestId }`
taxonomy and do not expose upstream internals.

## Build and cold consumer verification

From the repository root:

```sh
npm run build
npm run test:api
```

The API tests include a cold loopback consumer that imports the compiled
`dist/packages/agent-surface/src/http.js` output rather than source files.
A build artifact or local tarball is not a registry release and does not prove
hosted/authenticated operation.

## Typed SDK quickstart

```ts
import { EngramClient } from "@sibylengram/agent-surface";
const client = new EngramClient({ surface });
const recorded = await client.recordCompleteExecution(input);
```

The public SDK exports `EngramClient`, `createEngramClient`, `CompleteExecutionInputSchema`, `EngramError`, `EngramRefusalError`, and the lifecycle request/response types. `surface` is supplied by the host application; credentials and raw Sibyl history remain outside this package.

### Full SDK lifecycle

1. Create a client with the application’s policy-bound `surface` adapter.
2. Record a completed execution with outcome and evidence references.
3. Recall the returned execution memory for a bounded consumer context.
4. Request influence with the returned grant and a proposed action.
5. Execute the application decision outside the SDK.
6. Submit the observed outcome to create the next memory version.
7. Query the read-only evaluation summary, arms, or scorecard.

SDK releases follow strict semver: 1.x exports and `EngramErrorCode` values are stable; additive changes are minor releases and breaking changes require a major release. Errors expose stable `code`, `retryable`, and `recovery` fields; only explicitly retryable failures should be retried.


`createMcpStdioServer({ store })` wraps an injected canonical
`BehavioralMemoryStore` (or an existing `AgentSurface`) with newline-delimited
JSON-RPC 2.0 over stdio. The executable entrypoint is:

```sh
npm run agent-surface:mcp
# after npm run build: ./node_modules/.bin/engram-mcp
```

Requests are capped at 256 KiB, responses at 1 MiB, and calls time out after 5
seconds by default. Tool `_meta.access` explicitly classifies each tool as
`read` or `write`; writes require consumer confirmation. Malformed JSON,
invalid arguments, unknown tools, oversized requests, and timeouts return
bounded structured errors. Startup reads no credentials. Hosted and
authenticated operation are explicitly unclaimed. The fresh consumer smoke
proof is `tests/integration/engram-mcp-stdio-smoke.test.ts`.
