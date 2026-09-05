# EXP-011 — Hypothesis

Date: 2026-08-16

## Question

Can a coordinator preserve a prior multi-worker coordination failure as its own Operational Memory and use that memory to change a later comparable dispatch strategy without introducing implicit cross-agent memory sharing?

## Hypothesis

When a coordinator dispatches multiple workers against the same mutable target without a lease and observes a write conflict, the resulting coordination experience can be admitted under the coordinator agent. Under comparable future context, the same coordinator can recall that memory and change from `PARALLEL_UNLEASED` to `LEASED_SERIALIZATION`.

## Expected causal chain

`coordinator dispatch → worker race → coordinator-owned memory → memory-free coordinator control → treatment recall → changed coordination strategy → both worker contributions preserved`

## Isolation invariant

Worker identities are execution evidence, not independent memory principals in this experiment. Retrieval remains scoped to `coordinator-agent`; EXP-011 does not introduce shared/team memory or worker-to-worker memory leakage.

## Negative controls

A high-scoring race memory must not constrain:

- workers operating on independent artifacts/distinct targets;
- a materially different workflow that happens to contain similar conflict language.

## Boundary

Worker execution and contention are deterministic and SIMULATED. The experiment tests Engram runtime/provenance semantics, not a live multi-agent scheduler.