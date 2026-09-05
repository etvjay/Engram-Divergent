# Protocol Contracts — Frontend Usage

**Consumption mode:** `BROWSER_SAFE`

## What exists

`packages/core/src/protocol.ts` exposes the canonical protocol vocabulary and Zod schemas for:

- evidence states;
- memory influence types;
- counterfactual sources and objects;
- provenance references;
- recall references, including the persisted `memoryStateDigest` binding;
- memory influences;
- memory recall objects.

## Frontend use cases

Use these schemas/types when rendering trace state, validating API payloads, formatting evidence badges, or building provenance views.

```ts
import {
  EvidenceStateSchema,
  MemoryInfluenceSchema,
  MemoryRecallSchema,
} from "<engram-core-path>";

const recall = MemoryRecallSchema.parse(payload);
const stateBinding = recall.candidates[0]?.memoryStateDigest;
```

## Memory-state binding

New recall exposures carry a versioned `memoryStateDigest` that identifies the authority-relevant Operational Memory state that was actually exposed. The runtime validates that binding again before accepting a later influence.

Historical v1 recall records may parse without a digest for backward readability, but absence of the binding must not be presented as proof of recall-to-influence state continuity. A current influence attempt using an unbound persisted recall fails closed.

The digest is provenance metadata. Frontends must not recompute it, treat it as a secret, or infer that matching digests prove the memory is true or beneficial.

## Important invariants

- `VERIFIED`, `OBSERVED`, `SIMULATED`, `INFERRED`, `PROPOSED`, and `UNKNOWN` are distinct evidence states;
- recall is not influence;
- memory identity is not sufficient proof of recalled-state continuity;
- `memoryStateDigest` binds the exposed state, but does not replace provenance, ownership, lifecycle, evidence, or policy checks;
- a memory influence is an explicit provenance object;
- `CONTROL_RUN`, `SHADOW_RUN`, `REPLAY`, and application-declared counterfactuals must not be visually conflated;
- UI labels should preserve `UNKNOWN` rather than invent certainty.

## Implementation/tests

- `packages/core/src/protocol.ts`
- `packages/core/src/validate.ts`
- `packages/runtime/src/memory-state.ts`
- `packages/runtime/src/runtime.ts`
- `tests/runtime/recall-influence-state-integrity.test.ts`
- `tests/runtime/memory-state-digest.test.ts`

**Evidence status:** TESTED — EXP-019 accepted by Engram CI `31947418007`.