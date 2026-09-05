# EXP-012 — Setup

## Automated proofs

- `packages/scenarios/handoff-pattern/src/index.ts`
- `tests/scenarios/handoff-pattern-memory.test.ts`
- `tests/runtime/multi-source-admission.test.ts`
- `tests/e2e/repeated-handoff-pattern-memory.test.ts`

## Scenario

A `handoff-coordinator` delegates change plans to an executor. Constraints are implicit.

### Source executions A, B and C

Each source execution chooses:

`MINIMAL_HANDOFF`

Each execution still completes `SUCCESS`, but requires two clarification rounds and 14 simulated minutes of coordination latency before an accepted output is produced.

After the third comparable execution, the application declares a `REPEATED_PATTERN` signal with:

- pattern: `MISSING_CONSTRAINTS_CAUSES_CLARIFICATION`;
- baseline strategy: `MINIMAL_HANDOFF`;
- recommended strategy: `CONSTRAINT_COMPLETE_HANDOFF`;
- explicit `sourceExecutionIds` containing A, B and C.

Engram validates that the explicit source set includes the admitting execution and that every source exists under the same Engram agent before persisting the memory.

### Memory-free control

A separate same-context execution deliberately omits recall and repeats `MINIMAL_HANDOFF`, again completing `SUCCESS` with two clarification rounds and 14 minutes latency.

### Treatment

Treatment recalls the multi-source pattern memory and selects:

`CONSTRAINT_COMPLETE_HANDOFF`

The treatment still completes `SUCCESS`, but needs zero clarification rounds and 5 simulated minutes.

The decision records:

- the exact memory ID;
- the exact retrieval ID;
- `CHANGED_ACTION`;
- `CONTROL_RUN` counterfactual evidence referencing the actual control execution.

## Negative controls

Scenario-level tests ensure the pattern does not become authority solely because of a high retrieval score when:

- the role pair changes;
- artifact class changes with that role pair;
- current constraints are already explicit.

## Evidence classification

- handoff workload: SIMULATED;
- source/control/treatment outcomes: deterministic test evidence;
- multi-source runtime/provenance behavior: TESTED by Engram CI `31937523867`;
- live inter-agent coordination latency: UNVERIFIED.