# Contributing to Engram

## Frontend-consumable modules

Any module or surface that a frontend can directly import, call, render, inspect, or reuse must ship with an adjacent usage guide and a central registry entry.

### Required adjacent folder

Create or update:

`<module>/frontend-usage/README.md`

For root-level artifacts use `<artifact>-usage/README.md`.

The guide must document exports/routes, browser-safety, inputs, outputs, authentication, environment assumptions, an integration example, invariants, evidence status, implementation paths, and tests.

### Required registry entry

Update:

`docs/frontend-modules/registry.json`

This registry is the canonical inventory for frontend builders. A missing registry entry means the module is not considered exposed for frontend integration.

### Every package/service must be classified

Every top-level `packages/*` and `services/*` directory must appear in exactly one boundary inventory:

- frontend-consumable modules: `docs/frontend-modules/registry.json`;
- non-browser modules: `docs/frontend-modules/server-only.json` with the reason and sanctioned frontend boundary.

A new unclassified package/service fails repository conformance. Do not leave frontend builders guessing whether an undocumented module exists or is intentionally private.

### Security classification

Frontend entries use one of:

- `BROWSER_SAFE` — may be bundled directly into a browser application;
- `BROWSER_CONDITIONAL` — browser-compatible code exists, but deployment/authentication constraints apply;
- `API_ONLY` — frontend must consume it through the Engram HTTP API;
- `SERVER_ONLY` — never expose directly to a browser.

Never place database credentials, AWS credentials, MCP credentials, or the privileged MVP `ENGRAM_API_TOKEN` in a public browser bundle.

### Definition of Done

A frontend-consumable surface is incomplete until:

1. implementation exists;
2. adjacent usage documentation exists;
3. registry entry exists;
4. relevant tests exist;
5. `npm run check` passes.

Any top-level package/service is incomplete until its frontend boundary is classified.
