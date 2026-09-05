# EXP-018 — Decision

Date: 2026-08-16
Status: **ACCEPTED**
Evidence: GitHub Actions Engram CI `31945075487`

## Decision

Accept run-backed counterfactual authenticity as a runtime authority invariant.

## Accepted invariants

- `CONTROL_RUN`, `SHADOW_RUN` and `REPLAY` counterfactuals require an explicit comparison execution ID.
- The comparison execution must exist.
- An execution cannot be its own counterfactual comparison.
- The comparison execution must belong to the same Engram agent under the current ownership model.
- The comparison must be complete rather than `RUNNING` or `MEMORY_UNAVAILABLE`.
- Invalid counterfactual evidence cannot support memory influence or decision persistence.

## Architectural consequence

A `CHANGED_ACTION` claim backed by a run now carries stronger runtime-verifiable provenance than a caller-supplied label and UUID alone.

This is a foundation for roadmap #26. Future controlled replay should add controlled-variable equivalence, isolation, policy/environment freezing and explicit outcome comparison without weakening the existence/ownership/completion checks established here.

## Boundary

EXP-018 authenticates the referenced comparison execution, not full experimental equivalence. Application-declared counterfactuals remain a distinct, weaker evidence source.