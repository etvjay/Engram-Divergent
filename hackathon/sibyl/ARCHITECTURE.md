# Architecture — Engram × Sibyl Hackathon Profile

## Architectural decision
Do **not** rewrite canonical Engram around Sibyl. Introduce a hackathon storage profile where Sibyl is the sole decision-critical persistence/recall substrate and Engram keeps its execution-memory semantics.

```text
Application / Agent
        |
        v
Engram Runtime
- admission
- eligibility
- influence
- provenance
- invalidation/expiry
- counterfactual evaluation
        |
        v
SibylRuntimeStore : EngramRuntimeStore
        |
        +--> WARM entities
        |    executions
        |    outcomes
        |    operational memories
        |    recalls
        |    decisions
        |    evaluation records
        |
        +--> COLD journal
             adapter write/audit events
        |
        v
Sibyl MemoryClient.local(...)
        |
        v
fresh-process recall
        |
        v
application decision + observable changed action
```

## Why the full runtime-store boundary
The earlier narrow `ExecutionMemoryStore` proposal was rejected after auditing Engram's runtime. Engram already has a clean `EngramRuntimeStore` interface. Recall provenance, exposed-memory digests, decisions, evaluation records and source-lineage checks all depend on that store surface.

Using Sibyl only for `persistMemory/searchMemory/getMemory` while retaining CockroachDB recall bookkeeping would create a split authority surface and weaken the deletion test. The evaluated profile therefore implements the existing full runtime-store contract as `SibylRuntimeStore`.

## Boundary

### Engram owns
- what qualifies as an execution episode;
- when an observation may become operational memory;
- whether recalled memory is eligible to influence action;
- explicit influence recording;
- provenance from source execution to later decision;
- recalled-memory state digests;
- counterfactual comparison;
- expiry/invalidation/conflict semantics.

### Sibyl owns in the judged profile
- durable storage required to reconstruct the execution-memory trace;
- decision-critical operational memories;
- recall records and exposed-memory bindings;
- execution/outcome/decision/evaluation records needed by the evaluated profile;
- cross-process retrieval.

### Application owns
- final business/action decision;
- external action execution.

## Public-SDK rule
The adapter uses `sibyl_memory_client.MemoryClient` only. Direct access to Sibyl's SQLite schema is forbidden in the evaluated path because it would bypass the integration surface being judged.

## Forbidden architecture

```text
Engram -> CockroachDB equivalent decision memory
      \-> Sibyl mirror
```

If CockroachDB can independently reconstruct the claimed fresh-session behavior in the evaluated profile, Sibyl is decorative and the gate is at risk.

## Current implementation

```text
packages/sibyl/bridge.py
  MemoryClient.local(...)
  set_entity / get_entity / list_entities
  search_entities
  write_event

packages/sibyl/src/runtime-store.ts
  class SibylRuntimeStore implements EngramRuntimeStore
```

The Python bridge exists because the current first-party Sibyl SDK is Python while Engram's runtime is TypeScript. The bridge is deliberately thin and JSON-only; memory semantics remain in Engram and persistence semantics remain in Sibyl.

## Minimum causal acceptance
1. Run A executes with no relevant memory.
2. Failure/recovery evidence is observed.
3. Engram admits an operational memory and persists it through `SibylRuntimeStore`.
4. The first runtime/store instance is discarded.
5. Fresh Run B starts against the same Sibyl database.
6. Sibyl recalls the memory.
7. Engram eligibility permits influence.
8. Application records memory influence and chooses a different action.
9. Outcome and trace are reconstructable from Sibyl-backed state.
10. A no-memory control demonstrates the action difference.
11. Removing the Sibyl runtime makes the evaluated profile fail closed; there is no equivalent memory fallback.

## Production boundary
This profile proves storage portability and load-bearing cross-session behavior. It does not replace the canonical Engram production persistence decision unless separately adopted after the hackathon.
