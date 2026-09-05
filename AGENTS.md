# Engram Agent Instructions

These rules apply to every coding agent, model, and automated contributor working in this repository.

## Frontend-consumable module rule

Whenever you create or materially expand a module, endpoint, schema, SDK surface, read model, helper, or data contract that can be consumed or reused by a frontend, you **must** create or update an adjacent `frontend-usage/README.md` in the same module directory.

Examples:

- `packages/sdk/frontend-usage/README.md`
- `packages/control-plane/frontend-usage/README.md`
- `services/api/frontend-usage/README.md`

For root-level consumable artifacts, use an adjacent `<artifact>-usage/README.md`, e.g. `openapi-usage/README.md` for `openapi.json`.

Every usage guide must state:

1. what the module exposes;
2. whether it is safe to import into a browser bundle, server-only, or API-only;
3. canonical import path or HTTP route;
4. required inputs and important outputs;
5. authentication and environment assumptions;
6. a minimal integration example;
7. important invariants and unsafe assumptions to avoid;
8. current evidence status: IMPLEMENTED / TESTED / LIVE VERIFIED / SIMULATED / UNVERIFIED;
9. links/paths to the implementation and relevant tests.

Also update `docs/frontend-modules/registry.json` whenever a frontend-consumable module is added, removed, renamed, or changes consumption mode.

## Every module must declare a boundary

Every top-level `packages/*` and `services/*` module must be classified. There is no silent/unclassified state.

- If frontend-consumable: add the adjacent usage guide and `docs/frontend-modules/registry.json` entry.
- If not frontend-consumable: add or maintain its entry in `docs/frontend-modules/server-only.json` with a concrete reason and sanctioned frontend boundary.

Repository conformance tests enumerate top-level packages/services and fail when a module is unclassified.

Do not make frontend developers infer module existence by searching implementation internals. The frontend registry, adjacent usage guides, and server-only registry are the canonical discovery surface.

A frontend-consumable module is not Definition-of-Done until its usage documentation and registry entry exist and repository conformance tests pass.

## Architectural boundary

Document the real boundary. Do not mark server-side storage, database clients, privileged MCP clients, AWS credentials, or privileged bearer tokens as browser-safe. If a frontend reaches a server-side module through the Engram HTTP API, say so explicitly.
