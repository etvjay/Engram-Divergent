# Engram Modules That Are Not Frontend Imports

These modules exist, but frontend code should not import them directly. This list prevents frontend builders from mistaking "not in the frontend registry" for "does not exist."

| Module | Classification | Frontend boundary |
|---|---|---|
| `packages/runtime` | SERVER_ONLY | Use SDK/HTTP API. Runtime is the semantic authority behind surfaces. |
| `packages/cockroach` | SERVER_ONLY | Use HTTP/control-plane/evaluation APIs. Never connect a browser directly to CockroachDB. |
| `packages/bedrock` | SERVER_ONLY | Embeddings are invoked server-side with AWS credentials. |
| `packages/cockroach-mcp` | SERVER_ONLY | Managed MCP credentials and DB inspection remain server-side. |
| `packages/mcp-server` | SERVER_ONLY | Agent/tool integration surface, not a browser SDK. |
| `packages/adapters` | SERVER_ONLY / FRAMEWORK INTEGRATION | OpenAI Agents/LangGraph telemetry adapters feed Execution Episodes; frontend consumes resulting API data. |
| `packages/python` | NON_BROWSER SDK | Python execution-scoped client; frontend equivalent is TypeScript SDK/HTTP API. |
| `packages/memory-core` | INTERNAL DOMAIN | Foundational domain/repository interfaces; use public protocol/SDK/API surfaces. |
| `packages/execution-simulator` | INTERNAL DEMO | Deterministic workload simulation; consume public demo results through `/v1/demo/run`. |
| `packages/scenarios` | INTERNAL EXPERIMENT WORKLOADS | Scenario fixtures prove generality; they are not product UI APIs. |
| `services/runtime` | SERVER_ONLY | Runtime construction/wiring, database/policy dependencies. |
| `services/verification` | SERVER_ONLY | Credentialed live evidence generation. |

## Rule

If one of these modules later becomes intentionally frontend-consumable, the contributor must:

1. create its adjacent `frontend-usage/README.md`;
2. add it to `registry.json` with the correct consumption mode;
3. document the new security/runtime boundary;
4. add tests proving the exposed contract.

Until that happens, treat the classifications above as the canonical integration boundary.