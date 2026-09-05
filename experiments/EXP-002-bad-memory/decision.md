# EXP-002 Decision

## Decision

ACCEPT the current runtime separation between candidate retrieval, memory exposure, and decision influence as a core Engram invariant.

## Consequences

1. Retrieval score is never sufficient authority for memory influence.
2. Expiry/environment/tool invalidation is evaluated before exposure.
3. Influence policy is evaluated again at decision recording time.
4. Rejected memories remain in historical storage; current-context rejection does not rewrite history.
5. Rejected recall/influence attempts remain reconstructable through runtime evaluation events.
6. Policy thresholds remain versioned and workload-specific rather than being treated as universal constants.

## Follow-up experiments

- explicit contradictory-memory relationships and resolution behavior;
- superseded memory under unchanged environment version;
- repeated harmful-memory effects measured through controlled evaluation records;
- live CockroachDB policy/retrieval reconstruction with multiple competing memories.

## Product rule

**Relevance is not authority. Recall is not influence.**
