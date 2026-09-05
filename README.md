# Engram Divergent

**Execution memory for autonomous agents, built on Sibyl.**

Engram Divergent preserves execution-derived memory across processes, recalls it under comparable future conditions, governs whether it may influence action, and records enough provenance to reconstruct what changed because of that memory.

Sibyl is the memory substrate. There is no alternate persistence backend in this repository.

## Core invariant

```text
STORED ≠ RECALLED ≠ INFLUENTIAL ≠ BENEFICIAL
```

A memory is useful only when it survives across sessions, is recalled under the right context, is eligible to influence a later decision, produces a measurable behavioral difference from the no-memory control, and remains attributable to its source execution evidence.

## Architecture

```text
execution evidence
      ↓
Engram Runtime
  observe · complete · admit
      ↓
Sibyl
  persist · search · recall
      ↓
Engram Runtime
  eligibility · influence · provenance
      ↓
application / agent decision
      ↓
observable consequence
```

The application or agent remains final decision authority. Sibyl provides durable execution memory; Engram governs how that remembered experience becomes eligible influence.

## Sibyl integration

`packages/sibyl/src/runtime-store.ts` implements the complete runtime-store boundary over Sibyl.

`packages/sibyl/bridge.py` is the TypeScript → Python bridge to the Sibyl client.

Decision-critical state stored through Sibyl includes:

- executions;
- execution events;
- outcomes;
- operational memories;
- recalls and exposed-memory state digests;
- decisions;
- runtime evaluation events.

The deletion test is intentionally fail-closed: if Sibyl is unavailable, the cross-session memory path fails rather than silently switching to another store.

## Flagship proof: experiential provider continuity

The primary scenario demonstrates that accumulated provider experience changes future authority.

Two requester-owned executions observe repeated Atlas SLA breaches. Engram forms a bounded `REPEATED_PATTERN` relationship memory and persists it in Sibyl.

In a fresh process:

- **without memory:** Atlas is selected as the cheapest eligible provider;
- **urgent task with recalled memory:** delegation changes from Atlas to Beacon;
- **routine task with the same recalled memory:** Atlas remains eligible, but prepayment is reduced from 50% to 10% and milestone verification becomes mandatory.

This is not a universal reputation score or blacklist. It is agent-specific, task-specific experiential continuity.

## Pressure tests

The Sibyl path is tested for:

- fresh-process persistence → recall → changed action;
- expired memory retrieved but blocked from exposure;
- post-recall memory mutation rejected by state-digest binding;
- contradictory memories remaining recall-visible while influence is rejected until explicit supersession;
- deletion of the Sibyl runtime causing fail-closed degradation;
- multi-execution provider experience changing or constraining a future decision.

Run:

```bash
python -m pip install -r packages/sibyl/requirements.txt
npm install
npm run test:sibyl
```

## Fresh-session demo

Use one Sibyl DB and tenant across separate processes:

```bash
export ENGRAM_SIBYL_DB="$PWD/.sibyl/engram-divergent.db"
export ENGRAM_SIBYL_TENANT="engram-divergent-demo"

npm run demo:sibyl:seed
npm run demo:sibyl:recall
npm run demo:sibyl:no-memory-control
```

Provider continuity:

```bash
npm run demo:sibyl:provider:seed
npm run demo:sibyl:provider:urgent
npm run demo:sibyl:provider:routine
```

Load-bearing deletion mutation:

```bash
npm run test:sibyl:deletion
```

## Evidence capture

```bash
npm run evidence:sibyl:capture
```

The evidence bundle records the tested git SHA, runtime versions, separate-process outputs, Sibyl database digest, contradiction/expiry/tamper/deletion results, and retained artifact hashes.

## Downstream consequence adapters

Sibyl remains the only memory backend. Two downstream integrations exist to demonstrate that recalled memory can affect external economic behavior:

- `packages/virtuals-acp/` — normalizes Virtuals ACP execution evidence into Engram observations;
- `packages/base-settlement/` — derives and verifies a Base Sepolia settlement intent from a memory-conditioned provider decision.

These are evidence/consequence surfaces, not memory stores.

Local partner-conformance commands:

```bash
npm run test:virtuals
npm run test:base
```

## Repository map

```text
packages/
  core/                 protocol and provenance types
  memory-core/          operational-memory domain and scoring
  policy/               admission / retrieval / influence policy contracts
  runtime/              recall, admission, influence and provenance logic
  evaluation/           contradiction / supersession semantics
  sibyl/                sole durable runtime store
  scenarios/
    provider-continuity/
  virtuals-acp/         optional execution-evidence adapter
  base-settlement/      optional consequence adapter

scripts/
  sibyl-demo.ts
  sibyl-provider-demo.ts
  sibyl-evidence-capture.ts
  virtuals-acp-ingest.ts
  base-settlement-verify.ts

tests/
  integration/sibyl-*.test.ts
  scenarios/provider-continuity-memory.test.ts
```

## Quick start

Requirements:

- Node.js 22+
- Python 3.10+
- Sibyl Python client

```bash
git clone https://github.com/etvjay/Engram-Divergent.git
cd Engram-Divergent
python -m pip install -r packages/sibyl/requirements.txt
npm install
npm run check
```

For the evaluated path, configure only Sibyl:

```bash
cp .env.example .env
```

The core claim is deliberately narrow:

> Prior execution evidence persists in Sibyl, survives process death, is recalled later, and can causally change or constrain a future action with explicit provenance.