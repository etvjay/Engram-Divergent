# EXP-011 — Findings

Date: 2026-08-16
Evidence run: GitHub Actions Engram CI `31937169717`
Result: **PASS**

## Findings

1. With no applicable memory, the coordinator selected `PARALLEL_UNLEASED`.
2. Under same-target shared-mutable contention, the simulated workers produced one committed contribution and one `CONCURRENT_WRITE_CONFLICT`, yielding a `PARTIAL` source outcome.
3. Engram admitted the observed coordination failure as Operational Memory owned by `coordinator-agent`.
4. A same-context control deliberately omitted recall and reproduced the conflict.
5. Treatment recall exposed the coordinator-owned memory and the application changed strategy to `LEASED_SERIALIZATION`.
6. Engram recorded exact retrieval provenance, `CHANGED_ACTION`, and the real control execution as `CONTROL_RUN` counterfactual evidence.
7. Treatment completed `SUCCESS` with both worker contributions committed.
8. High-scoring memory did not force serialization for independent artifacts/distinct targets.
9. Similar conflict evidence from another workflow did not become coordination authority solely because it scored highly.

## Interpretation

Engram can support multi-agent systems without immediately requiring a shared-memory primitive. Coordination experience can belong to the agent that owns the coordination decision. Worker identities and results remain source evidence while recall stays within the coordinator's memory scope.

The causal form is:

`coordinator action → multi-worker consequence → coordinator memory → comparable recall → changed coordinator action`

This preserves current agent isolation while still allowing operational experience about multi-agent interactions to shape future coordination.

## Boundary

The workers, mutable artifact, lease and conflict are deterministic and **SIMULATED**. EXP-011 does not prove cross-agent shared memory or a live distributed coordination layer.