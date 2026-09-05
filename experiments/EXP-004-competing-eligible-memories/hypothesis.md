# EXP-004 — Competing Eligible Memories

## Hypothesis

When two otherwise eligible Operational Memories have an explicit unresolved `CONTRADICTS` relationship, Engram should preserve recall visibility but fail closed at **decision influence** until relationship evidence resolves the contradiction.

This is a policy hypothesis, not a protocol axiom. The experiment compares it against a surface-only policy before any default is selected.

## Policies under comparison

### Control — surface-only conflict

- both memories satisfy normal retrieval/influence policy;
- contradiction is exposed through evaluation metadata;
- relationship state does not change runtime eligibility.

Expected: either memory can still be declared influential if the application explicitly references a valid recall.

### Treatment — fail-closed conflict influence

- both memories may still be retrieved/exposed so the application can see the conflict;
- at `INFLUENCE` stage, an explicit unresolved contradiction adds `UNRESOLVED_MEMORY_CONTRADICTION`;
- neither contradictory memory can be accepted as influential while the conflict is unresolved.

Expected: influence is rejected and no decision-memory edge is persisted.

## Resolution case

If explicit relationship evidence later records a directional `SUPERSEDES` relationship that resolves the contradiction:

- the contradiction is no longer unresolved;
- policy may separately choose whether superseded memories are influence-eligible;
- the runtime must not infer a winner from recency, score, or embedding similarity.

## Falsification conditions

The treatment fails if:

- contradiction blocks recall rather than influence despite the configured stage;
- a contradictory memory is accepted as influential while the advisor reports an unresolved conflict;
- the application can bypass the advisor through a cold runtime invocation;
- relationship evaluation is imported directly into runtime core instead of being supplied through an explicit optional contract;
- semantic similarity creates a conflict without a persisted relationship.

## Principle under test

**Conflicting experience should remain visible, but unresolved conflict should not silently become action authority.**
