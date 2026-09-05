# EXP-017 — Decision

Date: 2026-08-16
Status: **ACCEPTED**
Evidence: GitHub Actions Engram CI `31944907415`

## Decision

Accept the admitting execution evidence state as an upper bound for newly derived Operational Memory evidence.

## Accepted invariants

- Clients cannot strengthen memory evidence merely by supplying a stronger admission-signal label.
- Derived memory evidence may equal or be weaker than the admitting execution evidence.
- Evidence ordering is explicit: `UNKNOWN < PROPOSED < INFERRED < SIMULATED < OBSERVED < VERIFIED`.
- An evidence-escalation attempt fails closed and persists no memory.
- Memory rejection does not erase the execution outcome that supplied the actual evidence.

## Architectural consequence

Evidence-state integrity is now enforced during runtime admission rather than relying on caller discipline.

Future multi-source evidence aggregation must extend this conservatively using actual source-outcome evidence. Source multiplicity alone must never raise evidence state.

This work is an implemented foundation for roadmap #16's evidence-state escalation threat.

## Boundary

Cryptographic verification, trusted attestors, source-outcome evidence aggregation and tenant-authorized evidence assessment remain outside EXP-017.