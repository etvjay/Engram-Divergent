# Engram Execution Memory Benchmark

Engram is evaluated as a **causal intervention on execution**, not as a memory-retrieval quiz.

The benchmark asks:

> Holding the model, task, tools, mandate, environment and available actions constant, does eligible execution memory change behavior in the right cases, improve downstream utility, remain inert in irrelevant cases, and stay inside authority boundaries?

## Core evaluation invariant

```text
STORED
  ≠ RECALLED
  ≠ ELIGIBLE
  ≠ INFLUENTIAL
  ≠ BEHAVIORALLY CONSEQUENTIAL
  ≠ BENEFICIAL
```

A benchmark result must identify which transitions occurred. Retrieval alone is not success.

## Treatment arms

Every benchmark scenario should support the following matched conditions.

| Arm | Condition | Purpose |
| --- | --- | --- |
| `A0_NO_MEMORY` | no eligible execution memory | control |
| `A1_RAW_HISTORY` | raw prior episode/history only | tests whether structured Engram memory adds value beyond context stuffing |
| `A2_ENGRAM` | eligible `MemorySlice` + `InfluenceGrant` | primary treatment |
| `A3_IRRELEVANT_MEMORY` | valid but non-applicable memory | tests disciplined non-influence |
| `A4_STALE_OR_CONTRADICTORY` | stale, conflicting or superseded experience | tests qualification, contradiction handling and memory lifecycle |

The primary causal comparison is `A2_ENGRAM - A0_NO_MEMORY`.

## Paired-run controls

For a causal pair, hold constant:

- model and model parameters;
- prompt/task family and constraints;
- available tools and capabilities;
- provider/action candidate set;
- environment version;
- mandate, budget and signer authority;
- evaluator and utility function.

The intended treatment difference is the presence and eligibility of Engram execution memory.

Cross-model experiments are separate portability tests. Do not use different models for the control and treatment of the same causal pair.

## Benchmark unit

A trial records:

```text
Task
  + Context
  + Constraints
  + Environment
  + Model
  + Memory Arm
       ↓
Decision
       ↓
Execution
       ↓
Outcome
       ↓
Utility
```

A complete Engram treatment trial should additionally retain:

```text
source Episode IDs
source ExecutionSlice IDs
ExecutionMemory ID
MemorySlice ID
InfluenceGrant ID
decision ID
external execution receipt(s)
outcome evidence
BehavioralMemoryEvaluation ID
```

## Primary metrics

### Causal utility uplift

```text
DeltaU = U(A2_ENGRAM) - U(A0_NO_MEMORY)
```

Utility is workload-specific and must expose its components. A provider-selection workload may include:

```text
U =
  success_value
  - cost_penalty
  - latency_penalty
  - verification_failure_penalty
  - retry_penalty
  - manual_intervention_penalty
  - policy_violation_penalty
```

Never report only the aggregate if component regressions are hidden by it.

### Memory formation

- attribution accuracy;
- applicability precision;
- overgeneralization rate;
- under-generalization rate;
- provenance completeness.

### Recall and eligibility

- relevant recall rate;
- eligibility precision;
- stale-memory rejection;
- contradiction resolution accuracy.

### Behavioral effect

- behavioral influence rate;
- consequential influence rate;
- beneficial influence rate;
- harmful influence rate;
- irrelevant-memory non-influence rate.

A changed explanation with the same action/terms is not a consequential behavioral change.

### Authority and disclosure

- unauthorized influence escape rate;
- mandate expansion attempts;
- unauthorized disclosure rate.

Hard target for successful benchmark evidence:

```text
unauthorized influence escapes = 0
unauthorized disclosure = 0
```

### Continuity

- fresh-process recall success;
- fresh-process behavioral influence;
- cross-agent transfer;
- cross-model transfer.

### Adaptation

Evaluate whether later evidence correctly causes:

- `STRENGTHEN`;
- `WEAKEN`;
- `QUALIFY`;
- `SUPERSEDE`;
- `INVALIDATE`;
- `NO_CHANGE`.

## Live execution track

The flagship live benchmark uses Virtuals ACP as the external agent-to-agent execution environment and Base as an observable economic consequence surface.

```text
Virtuals ACP events
      ↓
Episode
      ↓
ExecutionSlice
      ↓
Experience
      ↓
ExecutionMemory
      ↓
Sibyl
      ↓
fresh agent process
      ↓
MemorySlice + InfluenceGrant
      ↓
changed decision
      ↓
Virtuals ACP action
      ↓
Base economic consequence
      ↓
Outcome
      ↓
BehavioralMemoryEvaluation
```

Virtuals and Base are not memory backends. They provide external actions, outcomes and receipts against which Engram's influence can be measured.

## Model portability track

Use the same benchmark protocol with multiple agent models, for example local Qwen 2.5 and other hosted/local models.

For each model `M`, run matched arms:

```text
M × A0
M × A1
M × A2
M × A3
M × A4
```

Report model-specific `DeltaU`, harmful influence and authority violations before any cross-model aggregate.

The portability claim is not that Engram makes models equally capable. It is:

> execution experience can remain useful when the decision model or runtime changes.

## Fleet transfer track

Evaluate separately:

```text
same agent → fresh process
agent A → agent B, same model
agent A → agent B, different model
```

Transferred agents receive authorized `MemorySlice` objects and `InfluenceGrant`s, not unrestricted source histories.

## Required negative controls

A benchmark suite is incomplete without negative controls.

At minimum test:

1. irrelevant memory does not alter behavior;
2. stale/superseded memory cannot silently dominate newer evidence;
3. a memory cannot authorize effects outside its influence grant;
4. deletion/unavailability of Sibyl removes the cross-session Engram effect;
5. a mutated historical object with the same ID is rejected;
6. raw history is compared against structured Engram memory;
7. a behavior change that lowers utility is counted as harmful, not success.

## Evidence maturity

Results should state evidence status explicitly. Recommended states:

```text
SIMULATED_PASS
LOCAL_PASS
TESTNET_PASS
LIVE_PASS
PUBLIC_EVALUATOR_PASS
FAILED
BLOCKED
```

Do not upgrade a claim beyond the strongest retained evidence.

## Repository surfaces

- `BENCHMARK.md` — canonical benchmark contract;
- `packages/evaluation/src/benchmark.ts` — machine-readable trial/result schemas and metric calculations;
- `tests/primitives/benchmark-contract.test.ts` — benchmark invariants and negative controls;
- `benchmarks/` — scenario manifests and generated result/evidence conventions;
- live benchmark adapters remain under `packages/virtuals-acp/` and `packages/base-settlement/`.

## Headline benchmark question

> Did retained execution experience causally improve future execution, under the conditions where it should apply, without harming unrelated decisions or expanding authority?
