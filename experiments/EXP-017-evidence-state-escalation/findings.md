# EXP-017 — Findings

Date: 2026-08-16
Evidence run: GitHub Actions Engram CI `31944907415`
Result: **PASS**

## Findings

1. An `OBSERVED` execution outcome could not produce a `VERIFIED` Operational Memory through a stronger admission-signal label.
2. The escalation attempt was rejected with `MEMORY_EVIDENCE_EXCEEDS_EXECUTION_EVIDENCE`.
3. The rejected signal persisted no memory and emitted `MEMORY_NOT_ADMITTED`.
4. Equal evidence (`OBSERVED` → `OBSERVED`) remained admissible.
5. Conservative evidence (`VERIFIED` → `OBSERVED`) remained admissible.
6. The execution outcome is preserved independently even if the derived memory signal is rejected.

## Interpretation

Evidence state is now monotonic in the safe direction during memory derivation: derivation may preserve or lower evidence strength, but cannot raise it beyond the admitting execution.

This prevents a direct client-controlled route from turning observed execution evidence into verified memory evidence.

## Boundary

The evidence ceiling currently uses the execution that admits the memory. For multi-source memories, Engram still needs a first-class way to inspect source outcome evidence before it can conservatively calculate a ceiling across all contributing executions. That is separate future work rather than something inferred from source count.