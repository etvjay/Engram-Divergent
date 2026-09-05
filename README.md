# Engram

**Execution memory for autonomous agents.**

> Engram gives autonomous agents memory for what they have done, not just what they know.

Engram is execution-memory infrastructure for autonomous systems. It preserves prior executions, derives operational memory from evidence, recalls that experience under comparable future conditions, governs whether it may influence action, and leaves enough provenance to reconstruct what changed because of it.

The application or agent remains the decision authority. Engram does **not** choose the business action.

## Sibyl Labs Hackathon evaluated profile

The `hackathon/sibyl-ebi` branch contains a dedicated evaluated profile for the Sibyl Labs Hackathon. Canonical Engram remains CockroachDB-backed; in this judged profile **Sibyl is the load-bearing execution-memory store and there is no Cockroach fallback for the decision-critical path**.

The hackathon profile is designed around the deletion test: remove Sibyl and the cross-session memory required to reproduce the claimed behavior disappears.

### Judge call map — write → read → influence → conflict → consequence → deletion

| Judge question | Critical path |
|---|---|
| Where is Sibyl wired into Engram? | `packages/sibyl/src/runtime-store.ts` implements `EngramRuntimeStore`; `packages/sibyl/bridge.py` calls the public Sibyl Python SDK. |
| Where is decision-critical memory written? | `SibylRuntimeStore.persistMemory(...)` → bridge `put` → Sibyl WARM entity `operational_memory`. |
| Where is it read in a later session? | `SibylRuntimeStore.searchMemory(...)` → bridge `search_memories`; Engram Runtime then applies recall eligibility before exposure. |
| How is recall distinguished from influence? | `packages/runtime/src/runtime.ts`: `recall(...)` creates a memory-state digest; `recordDecision(...)` validates retrieval provenance and influence policy before recording `CHANGED_ACTION` / `CONSTRAINED_ACTION`. |
| What prevents search rank from silently resolving contradictory memories? | `tests/integration/sibyl-competing-memories.test.ts`: both contradictory memories remain recall-visible through Sibyl; unresolved influence is rejected until explicit `SUPERSEDES` evidence resolves the relevant side. |
| Where is the flagship relationship-memory policy? | `packages/scenarios/provider-continuity/src/index.ts`. |
| Where is the Sibyl integration pressure suite? | `tests/integration/sibyl-memory-loop.test.ts`, `tests/integration/sibyl-provider-continuity.test.ts`, and `tests/integration/sibyl-competing-memories.test.ts`. |
| How do I see process-boundary recall? | `npm run demo:sibyl:provider:seed`, terminate that process, then run `npm run demo:sibyl:provider:urgent` or `npm run demo:sibyl:provider:routine` against the same Sibyl DB/tenant. |
| How does remembered experience become economic authority on Base? | `packages/base-settlement/src/index.ts` converts the Engram provider decision into `engram.base-settlement-intent/v1`; `tests/integration/base-settlement-authority.test.ts` proves urgent recipient and routine prepayment deltas. |
| How is a claimed Base settlement checked against the decision? | `packages/base-settlement/src/evidence.ts` verifies RPC chain, optional expected payer, Circle USDC token, recipient, exact amount and success; `npm run base:settlement:verify` performs live receipt verification. |
| Where is the Virtuals evidence boundary? | `packages/virtuals-acp/` normalizes ACP job history into Engram observations; `npm run virtuals:acp:ingest` is the live-ingest path. No live ACP job is claimed yet. |
| How is load-bearing deletion tested? | `npm run test:sibyl:deletion`; it removes the configured Sibyl runtime and must report degradation with no fallback. |
| How do I reproduce the complete evidence bundle? | After installing the pinned Sibyl dependency, run `npm run evidence:sibyl:capture`. It uses a fresh Sibyl DB/tenant, separate processes for the behavioral phases, and emits a commit/timestamp/version-stamped `manifest.json` with SHA-256 integrity metadata. |

### One-command evidence capture

Install the evaluated Sibyl dependency, then capture the full pre-submission proof:

```bash
python -m pip install -r packages/sibyl/requirements.txt
npm run evidence:sibyl:capture
```

The capture fails on a dirty source tree by default so the manifest's git SHA actually identifies the tested source. For non-submission diagnostics only, `ENGRAM_EVIDENCE_ALLOW_DIRTY=1` may override that guard.

The generated evidence bundle binds:

- exact UTC capture time and git SHA;
- repository URL and clean-tree state;
- Node, npm, Python and `sibyl-memory-client` versions;
- dependency-manifest SHA-256 digests;
- separate-process route and provider outputs;
- contradiction, expiry, tamper and deletion pressure results;
- the final Sibyl SQLite database digest;
- SHA-256 digests for retained stdout/stderr files.

The manually dispatched `.github/workflows/sibyl-evidence-capture.yml` runs the same command on a clean GitHub-hosted runner and uploads the bundle as an artifact. A successful CI or local capture is still `LOCAL_PASS` unless the surrounding run qualifies for a stronger evidence state.

### How memory made this possible

The flagship profile models experiential continuity between a requester agent and service providers.

Two prior requester-owned executions observe Atlas breaching an urgent `data_fetch` SLA. Engram admits a provenance-linked multi-execution `REPEATED_PATTERN` relationship memory and Sibyl persists it. In a fresh session:

- without memory, the cheapest eligible provider is Atlas;
- for **urgent** work, recalled relationship memory changes delegation from Atlas to Beacon and records `CHANGED_ACTION`;
- for **routine** work, Atlas is not globally blacklisted: it remains selected, but prepayment falls from 50% to 10% and milestone verification is required, recorded as `CONSTRAINED_ACTION`.

The claim is therefore not “Atlas has a low reputation.” It is: **this agent's attributable experience with Atlas changes the authority Atlas receives in the matching future context.**

### Causal partner path — Virtuals → Sibyl → Base

The evaluated partner architecture is deliberately relational rather than additive:

```text
Virtuals/provider execution evidence
      ↓
Engram observation
      ↓
Sibyl relationship memory
      ↓
fresh Engram recall + decision
      ↓
Base settlement authority
```

Virtuals supplies real external economic-execution evidence when a live ACP job is eventually exercised. Sibyl is the load-bearing memory substrate. Base is the economic consequence layer downstream of the remembered decision.

For Base local conformance:

- urgent memory changes the settlement recipient from Atlas to Beacon;
- routine memory keeps Atlas but changes initial authorized prepayment from `4.000000 USDC` to `0.800000 USDC` and requires milestone verification;
- serialized settlement intents are schema-validated and internally amount-consistent;
- receipt verification fails on the wrong RPC chain, expected payer, token, recipient, amount, or reverted transaction.

Run:

```bash
npm run test:base
```

For an already executed Base Sepolia transaction, verification is non-custodial and read-only:

```bash
ENGRAM_BASE_RPC_URL='<BASE_SEPOLIA_RPC>' \
  npm run base:settlement:verify -- \
  --intent <intent.json> \
  --tx-hash <0x...> \
  --payer <REQUESTER_WALLET>
```

**Evidence boundary:** Base and Virtuals are currently `LOCAL_CONFORMANCE_PASS / LIVE_UNVERIFIED`. No real Base Sepolia settlement and no authenticated ACP job are claimed by this pre-window branch. Local tests do not earn either partner multiplier.

### Prior Work declaration

Engram's protocol, runtime, execution-memory semantics, CockroachDB production profile, SDK/API/MCP surfaces, causal influence model, and earlier scenarios existed before the Sibyl Labs Hackathon build window.

The Sibyl EBI adapter, pressure harness, provider-continuity work, Virtuals adapter and Base settlement-conformance path currently present on this branch were also implemented before the official **September 1–10, 2026** build window. If retained for submission, they must be declared as prior work rather than represented as hackathon-window implementation. Final submission evidence must identify the work performed during the official window and regenerate the required fresh-session/deletion/partner proof there.

Current pre-window evidence is recorded under [`hackathon/sibyl/`](hackathon/sibyl/) and must not be confused with final submission evidence.

## Governing invariant

Engram is complete only when a prior execution persisted in its configured operational-memory substrate is retrieved under comparable future context, explicitly influences a later application/agent decision, causes an observable change from the memory-free baseline, and leaves enough provenance to reconstruct that relationship.

```text
source execution
      ↓
operational memory
      ↓
future recall
      ↓
application decision references memory
      ↓
action differs from baseline/control
      ↓
outcome observed
```

Retrieval alone is not influence. Prompt inclusion alone is not causal proof.

## What Engram includes

- versioned `ExecutionEpisode` protocol;
- stateless Engram Runtime for execution lifecycle and memory semantics;
- policy-controlled admission, retrieval, influence, expiry and invalidation;
- explicit recall → influence → counterfactual provenance;
- CockroachDB-backed execution, memory, vector and evaluation state;
- agent-scoped cosine vector retrieval;
- Amazon Bedrock Titan embedding provider;
- CockroachDB Cloud Managed MCP provenance inspection;
- TypeScript SDK and Python HTTP SDK;
- HTTP API;
- semantic Engram MCP server;
- OpenAI Agents, LangGraph and custom adapter surfaces;
- read-focused control-plane backend;
- evidence-safe memory evaluation and controlled experiments.

See [`docs/architecture.md`](docs/architecture.md) for the system model.

## First demo proof

The original deterministic demo is deliberately small:

1. Run A has no relevant memory.
2. The application selects Route C.
3. Route C encounters `LIQUIDITY_UNAVAILABLE`.
4. Recovery is observed and Engram admits an operational lesson.
5. A comparable Run B recalls that lesson.
6. The application selects Route D instead and records the memory as `CHANGED_ACTION`.
7. Run B succeeds.
8. Engram preserves the memory-to-action trace.

The external multi-venue executor is **SIMULATED**. That boundary is intentional and independent from persistence, retrieval, provenance and cloud-integration evidence.

## Stronger acceptance scenarios

Engram is also tested outside the initial venue workload:

- **experiential provider continuity** — repeated requester-owned provider executions become bounded relationship posture that can change urgent delegation or constrain routine payment/verification authority;
- **software deployment recovery** — prior migration failure/recovery changes a later comparable deployment strategy with a real memory-free control execution;
- **autonomous coding regression** — prior reverted regression changes a later comparable coding methodology from patch-first to regression-test-first;
- **incident recovery** — prior recovery that restored the primary service but caused a harmful secondary consequence changes the later mitigation sequence;
- **bad memory** — stale or incompatible memory can be retrieved yet blocked before exposure/influence;
- **competing memories** — contradictory evidence remains visible without implicit overwrite/adjudication;
- **competing recall provenance** — a valid memory paired with the wrong retrieval is rejected.

Canonical experiment records live under [`experiments/`](experiments/) and are registry-checked in CI.

## Architecture

```text
Control Plane
  executions · memories · policies · evaluations
        |
Integration Surfaces
  TypeScript SDK · Python SDK · HTTP API · Engram MCP · adapters
        |
Engram Runtime
  recall · admission · eligibility · influence · provenance
        |
Execution Model
  episodes · decisions · observations · outcomes · counterfactuals
        |
Evidence + Storage
  CockroachDB · VECTOR/C-SPANN · evaluations · lineage
        |
External Integrations
  Amazon Bedrock · CockroachDB Cloud Managed MCP
```

Canonical lifecycle:

```text
context → recall → application decides → authorize → execute → observe → recover → remember
```

## Quick start

Requirements:

- Node.js 22
- npm

```bash
git clone https://github.com/etvjay/Engram.git
cd Engram
npm install
npm run check
```

`npm run check` builds the project and runs the full deterministic/conformance test suite. Credential-gated CockroachDB integration bodies are not equivalent to live verification when `DATABASE_URL` is absent.

### Environment

Copy the template and fill only the integrations you intend to exercise:

```bash
cp .env.example .env
```

Never commit API keys, database credentials or `ENGRAM_API_TOKEN`.

## CockroachDB

Apply the complete ordered migration chain:

```bash
DATABASE_URL='postgresql://...' npm run migrate
```

Run the credential-gated integration suite:
