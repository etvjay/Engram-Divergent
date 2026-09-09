# Engram closed-loop execution-learning report

**Thesis:** execution memory changes what an agent does next, and the resulting outcome changes the memory that future agents receive.

## Executive reading

Engram is demonstrated locally through closed-loop tool recovery and cross-agent handoff, with provider/commerce continuity retained as a separate benchmark and external-evidence family. The strongest result is semantic and lifecycle-based: a memory-conditioned action produces an observed outcome, that outcome selects a durable update directive, and a later fresh execution receives the updated version rather than the obsolete artifact.

The result is not yet a live economic or causal provider claim. ACP job `77776` was created but not funded, so the authentic provider path stops before terminal outcome, generic formation, U0, A2, and U2.

## How many cycles?

The closed-loop runner was executed with 30 deterministic seeds. Each seed contributes observations for tool recovery and handoff, for 240 total observations: 180 tool observations and 60 handoff observations. Provider observations are not included in this dataset; provider continuity remains a separate benchmark/evidence family. This is enough to make the local distribution visible and to detect deterministic regressions. It is not independent stochastic replication because the environment and policy are deterministic.

For a stronger submission benchmark, the next local target should be 30 matched paired cycles per domain, per model, with held-out contexts and recorded utility components. The current provider causal benchmark already has retained n=10 repeated pairs for deterministic and Qwen tracks, but those are A0/A2 provider-selection pairs, not A5 post-evaluation cycles.

## Closed-loop benchmark table

| Arm | Observations | Mean utility | Success rate | Interpretation |
|---|---:|---:|---:|---|
| `A0_NO_MEMORY` | 30 | -1.00 | 0.00 | baseline without memory |
| `A1_RAW_HISTORY` | 30 | 0.85 | 1.00 | unstructured history control |
| `A2_INITIAL_ENGRAM_MEMORY` | 60 | 0.90 | 1.00 | initial eligible structured memory |
| `A3_IRRELEVANT_MEMORY` | 30 | 0.95 | 1.00 | valid but non-applicable memory |
| `A4_STALE_OR_CONTRADICTORY` | 30 | 0.00 | 0.00 | stale or contradictory state |
| `A5_EVALUATED_UPDATED_MEMORY` | 60 | 0.92 | 1.00 | fresh execution after evaluated update |

Derived comparisons:

- `DeltaU A2-A0 = 1.90`: initial structured memory outperformed the no-memory control in this local deterministic sequence.
- `DeltaU A5-A2 = 0.02`: evaluated-updated memory was slightly better than initial memory in the same sequence.
- Unauthorized attempts: `30`; unauthorized escapes: `0`.
- Harmful pair rate: `0.125`; beneficial pair rate: `0.750`.

These numbers establish a local benchmark result, not a general uplift theorem. The action and outcome simulator are deterministic and intentionally bounded.

## Use case 1: provider / commerce continuity

The provider case is economically meaningful because the intended path ends in an external ACP consequence. The local provider benchmark shows that structured memory can change provider terms and selection under a fixed mandate. The retained repeated results are:

| Model | Pairs | Mean DeltaU | Beneficial | Equal | Harmful | Unauthorized escapes |
|---|---:|---:|---:|---:|---:|---:|
| `deterministic-rules-v1` | 10 | 2.00 | 10 | 0 | 0 | 0 |
| `qwen2.5-7b-4k:latest` | 10 | 0.00 | 0 | 10 | 0 | 0 |

The canonical repeated provider bundles are now reviewable in Git:

- `evidence/canonical/benchmarks/provider-urgent/deterministic-10/`
- `evidence/canonical/benchmarks/provider-urgent/qwen-10/`

Each contains `manifest.json`, `pairs.jsonl`, `trials.jsonl`, and `aggregate.json`.

Cross-model continuity: `BLOCKED_EXTERNAL` after both the Node and bounded Python transport probes exceeded or encountered socket/timeout failure. No Qwen or Llama utility result is inferred.

The retained canary receipt is `evidence/canonical/analysis/latest/model-transport-canary.json`: Qwen timed out; Llama responded with schema-invalid output. No matched-run result or metric was added.

The deterministic provider track is a protocol sanity check, not model evidence. The Qwen repeated provider track recorded zero mean DeltaU and zero beneficial pairs. That negative result is retained and matters: memory plumbing did not automatically make the model choose a better provider.

The authentic ACP track is currently partial. Qwen selected Hermes and job `77776` was created at `0.01 USDC`, but the wallet had zero USDC. Therefore no terminal outcome entered Engram, no authentic memory was admitted, and no live provider benefit can be claimed.

## Use case 2: tool / workflow recovery

Tool recovery is the clearest closed-loop local case:

```text
Tool A rate limit
→ failure utility
→ admitted recovery memory
→ Tool B bounded fallback
→ success
→ lower-load Tool A rehabilitation
→ QUALIFY update
→ fresh comparable recall
```

What Engram provided was not a permanent blacklist. The memory was applicable to the high-load context, inert in the lower-load context, and retained as a qualified version after the lower-load success. That distinction is the core product behavior: experience is scoped, evaluated, and revised rather than copied forward as an unconditional rule.

## Use case 3: cross-agent / fleet handoff

The handoff case demonstrates that durable experience is not wholesale history sharing:

```text
Agent A experience
→ bounded MemorySlice to Agent B
→ Agent B action and outcome
→ versioned evaluation
→ fresh Agent C receives current version
```

Agent B received claims and applicability, not raw events, credentials, mandate, or signer authority. After B produced a beneficial outcome, the updated memory version became current. The obsolete version was no longer eligible for influence. This is selective experience propagation, not shared agent memory.

## What the evaluation skill says this proves

| Evaluation gate | Status | Evidence |
|---|---|---|
| Correctness of lifecycle transitions | `SEMANTICALLY_PROVEN` | six directives and fail-closed version eligibility tests |
| Durable persistence | `LOCALLY_PROVEN` | fresh Sibyl store/process tests |
| Behavioral consequence | `LOCALLY_PROVEN` | A2 and A5 actions/utilities differ from A0 |
| Benefit | `LOCALLY_PROVEN`, deterministic only | A2-A0 and A5-A2 utility comparisons |
| Authority containment | `LOCALLY_PROVEN` | unauthorized escapes remain zero |
| Cross-agent continuity | `LOCALLY_PROVEN` | A → B → evaluated version → C |
| Cross-model continuity | `BLOCKED` | Ollama socket closure under full prompt |
| Authentic external execution | `PARTIAL` | ACP decision and job creation only |
| Live provider causal uplift | `UNVERIFIED` | funding/terminal/U2 absent |

## Multi-renderer analysis bundle

The same canonical observations have also been processed through pandas, SciPy, matplotlib, seaborn, Plotly, and Vega-Lite-compatible output generation:

- `evidence/canonical/analysis/latest/arm-metrics.csv`
- `evidence/canonical/analysis/latest/paired-a5-vs-a2.csv`
- `evidence/canonical/analysis/latest/provider-benchmark-metrics.csv`
- `evidence/canonical/analysis/latest/utility-by-arm.png`
- `evidence/canonical/analysis/latest/provider-delta-u.png`
- `evidence/canonical/analysis/latest/engram-analysis.html`
- `evidence/canonical/analysis/latest/utility-by-arm.vega-lite.json`
- `evidence/canonical/analysis/latest/dashboard-import.csv`

Tableau and Power BI are import-ready only. No external dashboard connector or readback is configured, so no Tableau/Power BI dashboard claim is made.

Reproduction instructions and pinned analysis dependencies are in [`analysis/README.md`](../analysis/README.md).


## Bottom line

Engram has provided a working local mechanism for experience-conditioned execution and demonstrated memory revision after consequence. It has not yet provided evidence that a live provider workflow becomes more profitable, faster, or more reliable after Engram learning. The next meaningful external cycle is not another local plumbing cycle. It is funding and completing job `77776` on the authorized network, or establishing a separately authorized testnet contract, then measuring terminal U0, authentic formation, A2, and U2 without changing the utility definition after the fact.
