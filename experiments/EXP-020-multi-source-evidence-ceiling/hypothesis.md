# EXP-020 — Multi-Source Evidence Ceiling Integrity

## Hypothesis

When an Operational Memory declares multiple `sourceExecutionIds` as executions whose evidence supports the memory, the memory's claimed `evidenceState` must not exceed the weakest evidence state among those source executions' outcomes.

The existing EXP-017 invariant is necessary but insufficient for multi-source memory: it prevents a memory from exceeding the admitting execution's outcome evidence, but does not establish a ceiling from the other declared supporting executions.

## Current-behavior prediction

Given:

1. a prior same-agent execution whose outcome is `OBSERVED`;
2. a current same-agent execution whose outcome is `VERIFIED`;
3. a `VERIFIED` admission signal that declares both executions in `sourceExecutionIds`;

current admission logic will accept a `VERIFIED` memory because the admitting execution is `VERIFIED` and the prior source is checked for existence and ownership, but not for outcome evidence strength.

If that prediction is false, the experiment must record the actual enforcing mechanism rather than adding a duplicate invariant.

## Desired invariant

For every declared supporting source execution `S`:

`rank(memory.evidenceState) <= rank(outcome(S).evidenceState)`

The admitting execution remains covered by EXP-017. Additional declared sources must be checked against their persisted outcomes. Missing source-outcome evidence is not permission to elevate the memory; it must fail closed.

Because the existing contract defines `sourceExecutionIds` as executions whose evidence **supports this memory**, this experiment treats every declared source as materially supporting the claim. It does not introduce source weighting or contextual/non-material source roles.

## Falsification cases

The invariant is not accepted unless automated evidence shows that:

- `VERIFIED` memory over `[OBSERVED, VERIFIED]` supporting outcomes is rejected;
- `OBSERVED` memory over `[OBSERVED, VERIFIED]` is accepted when all other admission rules pass;
- `VERIFIED` memory over `[VERIFIED, VERIFIED]` is accepted;
- an additional source without a resolvable persisted outcome fails closed;
- existing source existence, same-agent and admitting-execution membership constraints remain intact.

## Boundaries

This experiment concerns deterministic evidence authority for declared multi-source provenance. It does not prove that an external observation deserves its evidence label, cryptographically attest source outcomes, define weighted source materiality, or establish production CockroachDB Cloud behavior. Those remain separate verification concerns.
