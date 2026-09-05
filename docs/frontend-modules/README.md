# Engram Frontend Module Catalog

This directory is the canonical discovery surface for frontend builders.

Do **not** infer capabilities by searching source folders first. Start with `registry.json`, then open the adjacent usage guide for the module you want to consume.

## Consumption modes

- `BROWSER_SAFE` — may be bundled directly in frontend code.
- `BROWSER_CONDITIONAL` — browser-compatible code exists, but deployment/auth assumptions must be satisfied.
- `API_ONLY` — consume through Engram HTTP endpoints; do not import server implementation into the frontend.
- `SERVER_ONLY` — not exposed for browser use.

## Current frontend-relevant surfaces

The registry currently covers:

- Engram HTTP API;
- OpenAPI contract;
- TypeScript SDK + HTTP transport;
- protocol schemas;
- Execution Episode schema;
- memory policy contracts;
- control-plane read model;
- evaluation model;
- deterministic public demo surface.

## Required workflow for every contributor

When adding or materially changing a frontend-consumable module:

1. implement/test the module;
2. create/update `<module>/frontend-usage/README.md`;
3. add/update its entry in `registry.json`;
4. state browser/API/server safety explicitly;
5. include a minimal integration example;
6. run repository checks.

`AGENTS.md` and `CONTRIBUTING.md` make this rule mandatory for models and teammates.

## Security

Never move privileged server credentials into a browser simply because a module has an HTTP client. In the current MVP, the single privileged `ENGRAM_API_TOKEN` is not appropriate for embedding in a public static web bundle. Public frontend access should use public endpoints or a server-side/BFF boundary until a proper user/session authorization model exists.
