# <Module Name> — Frontend Usage

**Consumption mode:** `<BROWSER_SAFE | BROWSER_CONDITIONAL | API_ONLY | SERVER_ONLY>`

## What exists

State exactly what the module exposes today. Name canonical files, exports, schemas, routes, or generated artifacts. Do not document planned surfaces as if implemented.

## Canonical integration

State the sanctioned import path or HTTP route. If frontend code must go through an API/BFF instead of importing the implementation, say so explicitly.

## Inputs and outputs

Document the minimum important request/input fields and the response/output shapes the frontend must understand.

## Example

```ts
// Minimal real integration example.
```

## Authentication and environment

State tokens, sessions, base URLs, environment variables, CORS/runtime assumptions, and which credentials must never enter a browser bundle.

## Important invariants

List semantic rules the frontend must preserve. Examples: recall != influence; UNKNOWN stays UNKNOWN; application owns action selection; controlled evidence != observational evidence.

## Failure/empty states

State important error codes, unavailable states, empty lists, UNKNOWN evidence, or partial data the UI must represent instead of guessing around.

## Implementation/tests

- `<implementation path>`
- `<contract/schema path>`
- `<test path>`

**Evidence status:** `<IMPLEMENTED | TESTED | LIVE VERIFIED | SIMULATED | UNVERIFIED>`

## Change rule

If exports, routes, schemas, auth assumptions, consumption mode, or semantic invariants change, update this guide and `docs/frontend-modules/registry.json` in the same change.