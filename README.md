# Engram Divergent

**Execution memory for autonomous agents, built on Sibyl.**

Engram Divergent preserves execution-derived memory across processes, recalls it under comparable future conditions, governs whether it may influence action, and records enough provenance to reconstruct what changed because of that memory.

Sibyl is the memory substrate. There is no alternate persistence backend in this repository.

## Core invariant

```text
STORED ≠ RECALLED ≠ ELIGIBLE ≠ INFLUENTIAL ≠ BEHAVIORALLY CONSEQUENTIAL ≠ BENEFICIAL
```

A memory is useful only when it survives across sessions, is recalled under the right context, is eligible to influence a later decision, produces a measurable behavioral difference from the no-memory control, improves execution utility, and remains attributable to its source execution evidence.

## Benchmark-first evaluation

Engram is evaluated as a **causal intervention on execution**, not as a memory-retrieval quiz.

The benchmark asks:

> Holding the model, task, tools, mandate, environment and available actions constant, does eligible execution memory change behavior in the right cases, improve downstream utility, remain inert in irrelevant cases, and stay inside authority boundaries?

Canonical benchmark surfaces:

- [`BENCHMARK.md`](./BENCHMARK.md) — benchmark protocol and falsification criteria;
- `packages/evaluation/src/benchmark.ts` — machine-readable trial/result schemas and causal comparison logic;
- `tests/primitives/benchmark-contract.test.ts` — benchmark pressure tests;
- `benchmarks/scenarios/provider-urgent.json` — first scenario manifest;
- `benchmarks/results/` — intended retained trial, pair and evidence bundles.

Matched benchmark arms:

```text
A0_NO_MEMORY
A1_RAW_HISTORY
A2_ENGRAM
A3_IRRELEVANT_MEMORY
A4_STALE_OR_CONTRADICTORY
```

The primary causal comparison is:

```text
DeltaU = U(A2_ENGRAM) - U(A0_NO_MEMORY)
```

A changed action is not automatically a win. Changed behavior with lower utility is counted as harmful. Memory that is recalled but irrelevant should produce no influence. Any authority/disclosure violation fails the benchmark gate.

Run the benchmark contract tests with:

```bash
npm run test:benchmark
```

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

## Behavioral memory primitives

Engram keeps the execution-memory lifecycle explicit:

```text
Event
  ↓
Trace
  ↓
ExecutionEpisode
  ↓
ExecutionSlice
  ↓
Experience
  ↓
CandidateMemory
  ↓
ExecutionMemory
  ↓
MemorySlice
  ↓
InfluenceGrant
  ↓
Decision
  ↓
Outcome
  ↓
BehavioralMemoryEvaluation
```

`MemorySlice` governs what a consumer may receive. `InfluenceGrant` separately governs what that memory is allowed to change. Learning may alter strategy inside an existing mandate; it may not silently expand the mandate.

## Sibyl integration

`packages/sibyl/src/runtime-store.ts` implements the existing runtime-store boundary over Sibyl.

`packages/sibyl/src/behavioral-store.ts` persists and reconstructs the behavioral-memory graph across process death.

`packages/sibyl/bridge.py` is the TypeScript → Python bridge to the Sibyl client.

Decision-critical state stored through Sibyl includes:

- executions;
- execution events;
- outcomes;
- operational memories;
- execution episodes;
- execution slices;
- experiences;
- candidate memories;
- execution memories;
- memory slices;
- influence grants;
- behavioral memory evaluations;
- recalls and exposed-memory state digests;
- decisions;
- runtime evaluation events.

The deletion test is intentionally fail-closed: if Sibyl is unavailable, the cross-session memory path fails rather than silently switching to another store.

## Flagship proof: experiential provider continuity

The primary scenario demonstrates that accumulated provider experience changes future authority.

Two requester-owned executions observe repeated Atlas SLA breaches. Engram forms a bounded relationship memory and persists it in Sibyl.

In a fresh process:

- **without memory:** Atlas is selected as the cheapest eligible provider;
- **urgent task with recalled memory:** delegation changes from Atlas to Beacon;
- **routine task with the same recalled memory:** Atlas remains eligible, but prepayment is reduced from 50% to 10% and milestone verification becomes mandatory.

This is not a universal reputation score or blacklist. It is agent-specific, task-specific experiential continuity.

## Two execution-memory use cases

Engram is execution memory that changes what an agent does next.

### Provider / commerce continuity

```text
Virtuals ACP execution
  → provider experience
  → durable Sibyl memory
  → bounded future provider/terms influence
```

Current evidence state: local ACP-to-Sibyl durable-learning path is `LOCAL_PASS`. The live A0 attempt created job `77776`, but funding failed at zero wallet balance before receipt; no terminal outcome or A0-derived memory exists. No A2 or Base action occurred.

### Tool / workflow recovery

```text
tool failure
  → execution experience
  → durable Sibyl memory
  → future tool/retry/fallback influence
```

The local tool-recovery fixture demonstrates scoped applicability and fresh-process survival. Its evidence state is `LOCAL_PASS`. It does not involve Virtuals, money, or Base.

### Agent / fleet handoff

```text
Agent A execution lesson
  → durable Sibyl memory
  → fresh Agent B process
  → scoped MemorySlice + InfluenceGrant
  → bounded strategy change without transferred authority
```

Agent B receives bounded claims and applicability, not Agent A's raw history, credentials, mandate, or signer authority. The handoff proof is `LOCAL_PASS`.

### Closed-loop execution learning

The local longitudinal evaluation covers tool recovery and cross-agent handoff. It does not contain provider observations; provider continuity is evaluated through its separate retained benchmark and ACP evidence family.

- tool recovery: `180` observations
- agent handoff: `60` observations
- provider observations in this longitudinal dataset: `0`
- `evidence/canonical/longitudinal/latest/summary.json`
- `A0_NO_MEMORY`, `A1_RAW_HISTORY`, `A2_INITIAL_ENGRAM_MEMORY`, `A3_IRRELEVANT_MEMORY`, `A4_STALE_OR_CONTRADICTORY`, `A5_EVALUATED_UPDATED_MEMORY`
- 240 observations across 30 deterministic seeds
- `DeltaU A2-A0 = 1.90`
- `DeltaU A5-A2 = 0.02`
- success rate: `0.75`
- unauthorized attempts: `3`
- unauthorized escapes: `0`
- harmful pair rate: `0.125`
- beneficial pair rate: `0.75`

These are local/simulated observations, not live provider uplift. A5 is measured after an observed memory-conditioned outcome and versioned update. Prior memory records remain immutable; superseded and invalidated versions are not eligible for influence.

The cold-agent MCP boundary is:

```text
record_complete_execution
→ recall_applicable_memory
→ request_influence
→ submit_outcome_evaluation
→ new durable memory version
```

It exposes bounded claims and grants only; raw Sibyl history is not exposed. Run the stdio surface with `npm run agent-surface:mcp`.

### Typed developer SDK

The typed SDK wraps the same bounded agent surface without duplicating memory or authorization semantics:

```ts
import { EngramClient } from "./packages/agent-surface/src/sdk.js";
import { SibylBehavioralMemoryStore } from "./packages/sibyl/src/behavioral-store.js";

const engram = new EngramClient({ store: new SibylBehavioralMemoryStore() });
await engram.recordCompleteExecution({ execution, events, outcome, evidenceRefs });
const recalled = await engram.recallApplicableMemory({ executionMemoryId, consumerAgentId, consumerExecutionId, context });
const authorized = await engram.requestInfluence({ consumerAgentId, influenceGrantId, proposal });
await engram.submitOutcomeEvaluation({ evaluation });
const scorecard = await engram.getUseCaseScorecard();
```

The cold-developer integration test is `tests/integration/sibyl-agent-sdk.test.ts` and runs with:

```bash
npm run test:sdk
```

- fresh-process persistence → recall → changed action;
- full episode → slice → experience → memory → grant → evaluation lineage reconstruction;
- expired memory retrieved but blocked from exposure;
- post-recall memory mutation rejected by state-digest binding;
- contradictory memories remaining recall-visible while influence is rejected until explicit supersession;
- deletion of the Sibyl runtime causing fail-closed degradation;
- multi-execution provider experience changing or constraining a future decision;
- disclosure remaining separate from influence authority;
- unauthorized model-proposed effects being rejected;
- benchmark causal pairs rejecting model/task/environment/mandate drift;
- harmful memory-conditioned changes remaining visible as harmful outcomes.

Run:

```bash
python -m pip install -r packages/sibyl/requirements.txt
npm install
npm run check
```

## Unified three-use-case demo

The replay-only demo consumes canonical evidence and performs no new ACP, signer, Base, or funding action:

```bash
npm run demo:engram
```

It reports `REPLAYED_CANONICAL_LIVE_EVIDENCE` for the provider track, `LOCAL_PASS` for tool recovery, and `LOCAL_PASS` for agent handoff. The machine-readable summary is written to `evidence/canonical/demo/latest/summary.json`.

For system-level integration review:

- [`SYSTEM_INTEGRATION_GAPS.md`](./SYSTEM_INTEGRATION_GAPS.md) — composed/disconnected surfaces and P0–P3 gaps;
- [`SYSTEM_WHOLENESS_RECEIPT.json`](./SYSTEM_WHOLENESS_RECEIPT.json) — canonical integration receipt;
- [`DEMO.md`](./DEMO.md) — short replay narrative;
- [`EVIDENCE.md`](./EVIDENCE.md) — reviewer evidence index;
- [`docs/ENGRAM_CLOSED_LOOP_ANALYSIS.md`](./docs/ENGRAM_CLOSED_LOOP_ANALYSIS.md) - three-use-case narrative, benchmark tables, evaluation interpretation, and limits;
- [`evidence/canonical/longitudinal/latest/arm-summary.csv`](./evidence/canonical/longitudinal/latest/arm-summary.csv) - per-arm benchmark table;
- [`evidence/canonical/longitudinal/latest/utility-by-arm.svg`](./evidence/canonical/longitudinal/latest/utility-by-arm.svg) - utility visualization;
- [`evidence/canonical/analysis/latest/engram-analysis.html`](./evidence/canonical/analysis/latest/engram-analysis.html) - Plotly interactive analysis;
- [`evidence/canonical/analysis/latest/utility-by-arm.png`](./evidence/canonical/analysis/latest/utility-by-arm.png) - static utility figure;
- [`evidence/canonical/analysis/latest/utility-by-arm.vega-lite.json`](./evidence/canonical/analysis/latest/utility-by-arm.vega-lite.json) - Vega-Lite surface spec;
- [`analysis/README.md`](./analysis/README.md) - pinned analysis environment and reproduction instructions;
- [`CLAIM_MATRIX.md`](./CLAIM_MATRIX.md) - evidence-bounded claims.

## Fresh-session demos

Use one Sibyl DB and tenant across separate processes:

```bash
export ENGRAM_SIBYL_DB="$PWD/.sibyl/engram-divergent.db"
export ENGRAM_SIBYL_TENANT="engram-divergent-demo"

npm run demo:sibyl:seed
npm run demo:sibyl:recall
npm run demo:sibyl:no-memory-control
```

Behavioral graph persistence across process death:

```bash
npm run demo:sibyl:behavioral:seed
npm run demo:sibyl:behavioral:load -- --memory-id <EXECUTION_MEMORY_ID>
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

Benchmark result bundles should additionally retain the benchmark arm, matched pair ID, model/config digest, task/environment/capability/mandate digests, exposed utility components, external execution receipt references, and evidence maturity.

## Live execution and model portability

The intended live benchmark track is:

```text
Virtuals ACP
      ↓
real execution events
      ↓
Engram episode / experience / memory formation
      ↓
Sibyl
      ↓
fresh agent process
      ↓
MemorySlice + InfluenceGrant
      ↓
changed Virtuals ACP action
      ↓
Base economic consequence
      ↓
outcome + evaluation
```

Virtuals ACP is the external agent-to-agent execution environment. Base is the economic consequence/receipt surface. Neither is a memory backend.

Preparation is deliberately separate from authorization and execution. The frozen A0 bundle is created with:

```bash
npm run virtuals:acp:prepare
```

It writes `evidence/virtuals/live-preparation/<timestamp>/` with the verified candidate snapshot, deterministic A0 contract, prospective ACP requests, and authorization requirements. Preparation does not create or fund a job, invoke a signer, or call Base. A2 is only a treatment protocol until authentic admitted A0 memory exists.


Do not compare different models inside one causal control/treatment pair. Cross-model runs measure portability, not the primary Engram causal effect.

## Downstream consequence adapters

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
BENCHMARK.md             canonical causal benchmark contract

benchmarks/
  README.md
  scenarios/
    provider-urgent.json
  results/               retained benchmark outputs/evidence

packages/
  core/                 protocol and provenance types
  experience/           episodes, execution slices, experiences and lineage
  memory-core/          memory domain, candidate/admitted memory, slices and grants
  policy/               admission / retrieval / influence policy contracts
  runtime/              recall, admission, influence and provenance logic
  evaluation/           behavioral evaluation + benchmark contracts
  sibyl/                sole durable runtime and behavioral graph store
  scenarios/
    provider-continuity/
    tool-recovery/
  virtuals-acp/         execution-evidence adapter
  base-settlement/      consequence adapter

scripts/
  sibyl-demo.ts
  sibyl-provider-demo.ts
  sibyl-behavioral-graph-demo.ts
  sibyl-evidence-capture.ts
  virtuals-acp-ingest.ts
  acp-live-prepare.ts
  tool-recovery-process-a.ts
  tool-recovery-process-b.ts
  base-settlement-verify.ts

tests/
  primitives/
    behavioral-memory-lineage.test.ts
    benchmark-contract.test.ts
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

> Retained execution experience can survive process death, become bounded eligible influence in a later execution, and be causally evaluated against a matched no-memory control without silently expanding authority.
