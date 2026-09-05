# EXP-012 — Findings

Date: 2026-08-16
Evidence run: GitHub Actions Engram CI `31937523867`
Result: **PASS**

## Findings

1. Three comparable source handoffs each completed `SUCCESS` with accepted output while repeatedly requiring two clarification rounds.
2. Engram admitted a `REPEATED_PATTERN` memory only after the third execution supplied an explicit source set containing all three supporting runs.
3. The runtime persisted the deduplicated source execution set and exposed it in the memory's structured provenance context.
4. Independent runtime tests rejected an explicit source set that omitted the admitting execution.
5. Independent runtime tests rejected a source execution owned by another Engram agent.
6. A same-context memory-free control repeated `MINIMAL_HANDOFF`, two clarification rounds and 14 simulated minutes while still completing `SUCCESS`.
7. Treatment recalled the multi-source pattern memory and changed the application strategy to `CONSTRAINT_COMPLETE_HANDOFF`.
8. The changed decision referenced the exact retrieval that exposed the memory and used the actual control execution as `CONTROL_RUN` counterfactual evidence.
9. Treatment remained `SUCCESS` with accepted output while reducing clarification rounds from 2 to 0 and simulated coordination latency from 14 to 5 minutes.
10. High-scoring pattern memory did not control a different role/artifact context or a handoff whose constraints were already explicit.

## Interpretation

Engram can now represent repeated experience without pretending that one execution proves a pattern. Multi-source lineage is part of the memory's evidence provenance, while the derived Operational Memory remains an interpretation rather than raw truth.

This establishes a new causal form:

`multiple successful executions → repeated-pattern memory → comparable recall → changed later action`

It also separates **outcome quality** from **workflow friction**: all source runs succeeded, yet the repeated coordination cost was still operationally meaningful enough to remember.

## Boundary

The handoff workload and timing model are deterministic and **SIMULATED**. Source multiplicity does not itself increase epistemic truth or confidence; it records which executions support the pattern claim. Live multi-agent handoff timing remains UNVERIFIED.