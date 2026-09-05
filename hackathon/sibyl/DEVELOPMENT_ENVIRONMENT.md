# Development Environment

Status: `PROBED_BASE_GOLDEN_PASS_PRESSURE_CI_PENDING` for Sibyl integration.

## Existing Engram baseline
- Node.js 22
- npm
- TypeScript monorepo
- canonical checks: `npm install` then `npm run check`

## Sibyl toolchain lock
Verified from first-party Sibyl documentation/repository on 2026-08-24:

- direct SDK language: Python;
- package: `sibyl-memory-client`;
- public client: `MemoryClient.local(path, tenant_id=...)`;
- durable tiers used by this profile: WARM entities plus COLD journal audit events;
- retrieval API used by this profile: `search_entities(...)`;
- Python requirement: >=3.10 in the upstream package metadata;
- currently observed PyPI release: `0.6.1`;
- upstream GitHub `main` currently declares `0.7.0`, so release status must be revalidated before the Sep 1 build window and again before submission freeze.

Evaluated dependency pin:

```text
packages/sibyl/requirements.txt
sibyl-memory-client==0.6.1
```

## Runtime configuration

```bash
ENGRAM_SIBYL_DB=/absolute/path/to/memory.db
ENGRAM_SIBYL_TENANT=engram-hackathon
ENGRAM_SIBYL_PYTHON=python3
# optional if repository layout differs
ENGRAM_SIBYL_BRIDGE=/absolute/path/to/packages/sibyl/bridge.py
```

There is deliberately no Cockroach fallback flag in `SibylRuntimeStore`.

## Current commands

```bash
npm install
python -m pip install -r packages/sibyl/requirements.txt
npm run build
npm run test:sibyl
npm run demo:sibyl:seed
# process exits
npm run demo:sibyl:recall
npm run demo:sibyl:no-memory-control
npm run test:sibyl:deletion
```

`test:sibyl` is an explicit optional-integration command. The ordinary `test:all` suite skips this external-SDK test unless `ENGRAM_SIBYL_TEST_REQUIRED=1`, so canonical Engram development does not silently acquire a Python dependency. The Sibyl CI job always runs it in required mode.

## CI evidence and topology
The first clean Sibyl profile proof passed in GitHub Actions run `32749722101` at head `630e59d`.

A later generic CI run exposed two integration-hygiene issues (missing optional Python SDK in generic CI and an undeclared server-only package boundary). Both were fixed. Generic Engram CI then passed at head `5908305` in run `32750255631`.

The strengthened Sibyl proof is now a second job inside the canonical `.github/workflows/ci.yml`, rather than a standalone workflow. It provisions Node 22 + Python 3.12, installs the pinned SDK, runs the Sibyl pressure tests, then executes seed and recall as distinct Node processes, a no-memory control, and a deletion mutation.

## Toolchain probe gate
- [x] current Sibyl SDK/package/API verified from first-party docs;
- [x] local-first configuration path understood;
- [x] public write/read API preserves Engram IDs/structured metadata in the observed baseline test;
- [x] deletion/unavailable-Sibyl mutation is implementable and baseline-tested;
- [x] no Sibyl secret is required for the local-first core path;
- [x] baseline golden Sibyl integration passed in clean CI;
- [x] canonical Engram suite passed after integration-hygiene fixes;
- [ ] strengthened stale/tamper + separate-Node-process pressure job passes on the current head;
- [ ] SDK/version truth revalidated at Sep 1.

Do not promote the EBI state beyond the evidence actually recorded for the current head.
