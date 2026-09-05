# Evidence Ledger

Allowed states:
`UNVERIFIED | SIMULATED_PASS | LOCAL_PASS | FORK_PASS | TESTNET_PASS | LIVE_PASS | PUBLIC_EVALUATOR_PASS | PRODUCTION_PASS | FAILED | BLOCKED`

## Current claim ledger

| Claim / gate | State | Evidence | Negative mutation | Notes |
|---|---|---|---|---|
| Sibyl persists decision-critical memory | LOCAL_PASS | GitHub Actions run `33264580330`, job `99132270544`, branch head `bd02738a57ebb4bde1bdc68bc5ff475b1bbdad64`: SDK 0.6.1 installed; route/provider/conflict memories persisted through Sibyl | missing Sibyl runtime | Pre-build-window evidence; must be re-run during official window |
| Fresh session/process recalls prior memory | LOCAL_PASS | run `33264580330`: separate seed and recall processes; route and provider relationship memory recalled in later processes; conflict test uses a fresh `SibylRuntimeStore` | terminate source process / unavailable Sibyl | Stronger than fresh-object-only proof |
| Recalled memory changes action | LOCAL_PASS | run `33264580330`: route `A-B-C -> A-B-D`; urgent provider `atlas -> beacon`; explicit `CHANGED_ACTION` traces | no-memory control | Paired behavioral deltas, not retrieval-only |
| Recalled memory constrains authority without global blacklist | LOCAL_PASS | run `33264580330`: fresh routine provider process keeps Atlas while prepay falls `5000 -> 1000` bps and milestone verification becomes required | routine-context control | Demonstrates contextual relationship posture rather than global reputation |
| Multi-execution experience becomes bounded relationship memory | LOCAL_PASS | run `33264580330`: two historical Atlas breach executions plus admitting execution produced `CONTEXT_GUARDED` relationship memory | single-failure fixture / cross-task fixture | Requires attributable lineage, not one bad event |
| Urgent provider experience changes outcome | LOCAL_PASS | run `33264580330`: no-memory Atlas path returns deterministic `SLA_BREACH`; memory-conditioned Beacon path returns `SUCCESS` | no-memory provider control | Application fixture, not a live provider-network claim |
| Deleting/unavailable Sibyl breaks/degrades core function | LOCAL_PASS | run `33264580330`: deletion CLI emitted degradation with no fallback | remove/disable Sibyl runtime | VETO |
| Engram provenance remains reconstructable | LOCAL_PASS | run `33264580330`: recall IDs, memory IDs, memory-state digests, counterfactuals, accepted influence and evaluation events remain in traces | post-recall memory tamper | Preserves recall-to-action lineage |
| Expired Sibyl memory is retrieved but blocked before exposure | LOCAL_PASS | run `33264580330`, `npm run test:sibyl` | expired memory fixture | Retrieval != legitimate influence |
| Post-recall memory tamper is rejected | LOCAL_PASS | run `33264580330`, `npm run test:sibyl` | overwrite memory after digest exposure | Protects recall-to-decision state integrity |
| Conflicting memory remains non-silently adjudicated | LOCAL_PASS | run `33264580330`, job `99132270544`: contradictory memories remain recall-visible, unresolved influence is rejected, explicit `SUPERSEDES` resolves the relevant side | unresolved `CONTRADICTS` pair | Ranking cannot silently become authority |
| Expanded Sibyl pressure suite | LOCAL_PASS | run `33264580330`, job `99132270544`: 3 test files / 7 tests passed, followed by route/provider/deletion process-boundary proof | expiry, tamper, contradiction, deletion, single-failure/cross-task controls | Repeatable on hosted runner |
| Self-verifying evidence capture path | LOCAL_PASS | run `33264580330`, job `99132270544`: exact evidence capture and manifest check passed | dirty source / unexpected untracked file; failed precursor run `33232299952` | Capture records git/source state, runtime/dependency digests, output hashes and final Sibyl DB digest |
| Base settlement authority follows Engram memory-conditioned decision | LOCAL_PASS | run `33264580330`, check job `99132270601`: urgent memory changes recipient Atlas -> Beacon; routine changes authorized prepay `4.000000 -> 0.800000 USDC` | no-memory decision / malformed address | Local causal-model evidence, not a live Base transaction |
| Fresh Sibyl decision emits exact Base authority artifact | LOCAL_PASS | run `33264580330`, Sibyl job `99132270544`: fresh routine recall wrote serialized Base intent; follow-up gate parsed it as Atlas + `800000` atomic USDC + milestone verification + retrieval provenance | omit provider addresses / malformed artifact | Closes manual translation gap between memory-conditioned decision and settlement artifact |
| Base serialized intent is internally bound | LOCAL_PASS | run `33264580330`, check job `99132270601`: strict schema fixes network/token/provider/address/provenance and rejects inconsistent atomic/decimal values | malformed schema, wrong chain, inconsistent amount | Removes unsafe JSON-cast ambiguity |
| Base receipt verification fails closed | LOCAL_PASS | run `33264580330`, check job `99132270601`: rejects wrong RPC chain, payer, recipient, amount, token and reverted transaction | chain/payer/recipient/amount/token/status mutations | Live verifier independently calls `eth_chainId` |
| Canonical Engram suite remains green with Sibyl + Base evaluated profiles | LOCAL_PASS | run `33264580330`, check job `99132270601`; SAM run `33264580331` | canonical test suite | Strongest tested code head `bd02738a57ebb4bde1bdc68bc5ff475b1bbdad64` |
| Root README exposes judged memory and partner call map | LOCAL_PASS | branch README exposes Sibyl write/read/influence/conflict/deletion/evidence, Base intent/verifier and Virtuals evidence boundary | cold reviewer navigation | Human under-two-minute timing remains pending; not `PUBLIC_EVALUATOR_PASS` |
| Hackathon-window rerun of core proof | UNVERIFIED | — | clean clone + fresh DB | Pre-window proof cannot substitute for final event-window evidence |
| Base integration does real product work onchain | UNVERIFIED | decision-derived intent + hardened verifier + live runbook exist; no real Base Sepolia settlement yet | remove Base action / mismatch settlement | `BASE-001` remains unearned |
| Virtuals integration does real product work | UNVERIFIED | adapter/conformance/live-ingest path implemented; no authenticated ACP job yet | remove Virtuals interaction | partner multiplier remains unclaimed |

## Current flagship interpretation
The strongest current memory claim is not `the agent remembers Atlas is bad`.

It is:

> Multiple attributable executions become an agent-specific, task-specific relationship posture. In a fresh session that posture can change delegation entirely for urgent work, or narrow payment/verification authority for routine work, while preserving the same provider relationship.

This is evidence-bounded experiential continuity, not a universal reputation score.

The adversarial corollary is equally important:

> Retrieval rank is not adjudication. If two persisted memories explicitly contradict each other, Engram may expose both but refuses to let either silently become authority until relationship evidence resolves the conflict.

The economic consequence is now directly connected at local conformance level:

> The fresh Sibyl-backed routine decision itself can emit the Base settlement artifact authorizing only `0.800000 USDC` upfront to Atlas, with retrieval provenance retained. There is no manual re-entry of the remembered decision between memory and settlement intent.

A claimed Base receipt is accepted only when serialized intent, RPC chain, payer when bound, token, recipient, amount and success state agree.

## Evidence-history note
Run `32753747711` remains an earlier pre-window baseline for the original six-test profile.

Head `8f616545...` / run `33221823993` added the Sibyl-backed contradiction gate.

The first exact capture-smoke run on head `45806957...`, CI `33232299952`, surfaced an evidence-harness failure after product/Sibyl phases passed: generated `package-lock.json` was treated as unexpected dirtiness. This is retained as harness-debug evidence, not hidden.

Head `afb3ac37...` / run `33232373531` corrected and proved the self-verifying evidence-capture path.

Head `266d3c38...` / run `33264157362` added first Base settlement-authority/receipt local conformance while preserving Sibyl.

Head `b6ffe6fc...` / run `33264345953` hardened Base serialized-intent, chain and payer verification.

The current strongest tested pre-window code baseline is `bd02738a57ebb4bde1bdc68bc5ff475b1bbdad64`:
- Engram CI `33264580330`: SUCCESS
- canonical check job `99132270601`: SUCCESS
- Sibyl profile job `99132270544`: SUCCESS
- fresh routine decision -> Base serialized-intent gate: SUCCESS
- deletion + exact evidence-capture smoke + manifest check: SUCCESS
- Engram SAM Build `33264580331`: SUCCESS

Later documentation commits record this evidence but do not strengthen it.

Every promotion above `LOCAL_PASS` must point to the exact hackathon-window artifact/run that supports it.

No claim may be promoted above the smallest state actually supported by evidence.
