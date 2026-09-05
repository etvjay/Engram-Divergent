# EXP-012 — Hypothesis

Date: 2026-08-16

## Question

Can Engram represent a repeated operational pattern honestly as memory supported by multiple prior executions, rather than attributing repetition to one convenient run, and can that memory change a later comparable action?

## Hypothesis

Three comparable successful planner-to-executor handoffs that each require the same clarification pattern can jointly support a `REPEATED_PATTERN` Operational Memory. The memory must preserve all three source execution IDs. Under comparable future context, treatment may use that memory to switch from `MINIMAL_HANDOFF` to `CONSTRAINT_COMPLETE_HANDOFF`, while a real memory-free control continues to reproduce the clarification pattern.

## Expected causal chain

`successful run A + successful run B + successful run C → multi-source REPEATED_PATTERN memory → memory-free control → treatment recall → changed handoff strategy → lower coordination latency`

## Invariants

1. All three source executions remain `SUCCESS`; repetition is not mislabeled as failure.
2. The memory source set contains the actual supporting executions A, B and C.
3. The admitting execution is one member of the explicit source set.
4. All sources belong to the same Engram agent.
5. Source count is provenance, not a confidence multiplier or automatic proof.
6. The memory-free control establishes the counterfactual baseline.
7. Treatment `CHANGED_ACTION` references the exact retrieval that exposed the pattern memory.
8. Role-pair/artifact/constraint scope must match; high retrieval score alone is insufficient.

## Boundary

The handoff workload and timing model are deterministic and SIMULATED. This experiment proves runtime/provenance semantics, not live agent handoff latency.