# EXP-017 — Hypothesis

Date: 2026-08-16

## Question

Can Engram prevent an admission signal from assigning an Operational Memory a stronger evidence state than the execution outcome that produced and admitted that memory?

## Hypothesis

Derived Operational Memory should never gain stronger evidence merely because a client labels its admission signal more strongly.

For the admitting execution:

`memory.evidenceState <= execution outcome evidenceState`

under the ordered evidence lattice:

`UNKNOWN < PROPOSED < INFERRED < SIMULATED < OBSERVED < VERIFIED`

## Expected result

- `OBSERVED` execution + `VERIFIED` admission signal is rejected with `MEMORY_EVIDENCE_EXCEEDS_EXECUTION_EVIDENCE`.
- `OBSERVED` execution + `OBSERVED` memory remains admissible.
- `VERIFIED` execution + `OBSERVED` memory remains admissible because conservative derivation is permitted.
- Rejected escalation produces no persisted memory and emits `MEMORY_NOT_ADMITTED`.

## Boundary

This experiment constrains evidence escalation relative to the execution currently admitting the memory. It does not yet calculate a ceiling across every source execution in a multi-source memory, because source outcome evidence is not currently first-class on `RuntimeExecutionRecord`.