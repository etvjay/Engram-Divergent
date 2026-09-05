# Judge Call Map — Engram × Sibyl

This file is intentionally short. It answers: **where is Sibyl load-bearing, and where does recalled memory change behavior?**

## 1. Sibyl adapter

`packages/sibyl/src/runtime-store.ts`

This implements Engram's `EngramRuntimeStore` contract for the evaluated profile.

Critical methods:
- `persistMemory(...)` — writes Engram operational memory to Sibyl;
- `searchMemory(...)` — retrieves decision-critical memory from Sibyl;
- `getMemory(...)` — resolves the current authority-relevant memory state;
- `getRecalls(...)` / `updateRecallExposure(...)` — preserve recall provenance and exposed memory-state digests;
- `recordRuntimeDecision(...)` — persists the decision that references memory;
- `getTrace(...)` — reconstructs execution -> recall -> influence evidence.

There is no Cockroach fallback in `SibylRuntimeStore`.

## 2. Public Sibyl SDK bridge

`packages/sibyl/bridge.py`

The TypeScript runtime reaches Sibyl through the public Python `MemoryClient` API. The bridge does not query Sibyl's SQLite tables directly.

Dependency lock:

`packages/sibyl/requirements.txt`

## 3. Engram semantic authority

`packages/runtime/src/runtime.ts`

Critical flow:
- `complete(...)` evaluates admission and calls `store.persistMemory(...)`;
- `recall(...)` calls `store.searchMemory(...)`, then applies Engram eligibility policy;
- `recordDecision(...)` verifies that claimed influential memory was actually recalled and still matches its exposed state digest;
- `validateMemorySourceLineage(...)` checks source execution provenance;
- `validateCounterfactualComparison(...)` and influence policy prevent unsupported causal claims.

Sibyl owns persistence/recall. Engram owns whether memory may legitimately influence behavior.

## 4. Deterministic deletion/control proof

`tests/integration/sibyl-memory-loop.test.ts`

Proves:
- persistent memory crosses fresh runtime/store boundaries;
- expired memory is not exposed;
- memory changed after recall cannot influence the decision;
- unavailable Sibyl fails closed.

Demo:

`scripts/sibyl-demo.ts`

Commands:

```bash
npm run demo:sibyl:seed
npm run demo:sibyl:recall
npm run demo:sibyl:no-memory-control
npm run test:sibyl:deletion
```

## 5. Headline experiential-continuity scenario

Policy primitive:

`packages/scenarios/provider-continuity/src/index.ts`

Sibyl-backed integration:

`tests/integration/sibyl-provider-continuity.test.ts`

Evaluator demo:

`scripts/sibyl-provider-demo.ts`

Commands:

```bash
npm run demo:sibyl:provider:seed
npm run demo:sibyl:provider:urgent
npm run demo:sibyl:provider:routine
```

Expected causal behavior:

```text
historical Atlas breach #1
historical Atlas breach #2
        |
        v
Engram multi-source REPEATED_PATTERN admission
        |
        v
Sibyl relationship memory
        |
        +--> fresh urgent task
        |      control: Atlas
        |      memory:  Beacon
        |
        +--> fresh routine task
               control: Atlas / 50% prepay / no checkpoint
               memory:  Atlas / 10% prepay / milestone verification
```

The same memory therefore changes behavior contextually rather than becoming a blanket reputation label.

## 6. Mandatory CI

`.github/workflows/ci.yml`

The `sibyl-profile` job provisions Python + the pinned Sibyl SDK, builds Engram, runs both Sibyl integration suites, executes fresh-process deterministic demos, executes the provider-continuity demos, and then runs the deletion mutation.

## 7. Prior work boundary

Everything on this branch created before the official Sep 1 build window is pre-window work and must be declared as Prior Work where the submission rules require it. Hackathon-window evidence must be regenerated from the then-current commit; this document is not itself submission proof.
