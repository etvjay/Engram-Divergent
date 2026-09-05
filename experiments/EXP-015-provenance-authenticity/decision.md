# EXP-015 — Decision

Date: 2026-08-16
Status: **ACCEPTED**
Evidence: GitHub Actions Engram CI `31944577594`

## Decision

Accept claimed execution provenance as a runtime authority precondition for Operational Memory.

## Accepted invariants

- Retrieval relevance and confidence cannot authenticate provenance.
- If a memory declares source execution lineage, the declared sources must resolve to canonical executions.
- Every declared source execution must belong to the same Engram agent as the memory unless a future explicit shared-memory authorization model defines otherwise.
- Contradictory source-lineage declarations fail closed.
- Provenance validation occurs before recall exposure and is repeated before decision influence.
- A memory that was validly exposed does not gain permanent authority if its lineage later becomes invalid or unavailable.
- Legacy memories without declared source lineage remain readable, but absence of provenance must never be represented as verified provenance.

## Architectural consequence

Execution-memory provenance is not only an audit trail. It participates directly in whether a memory may become current action authority.

Long-horizon hardening belongs with the memory-specific threat model and storage-integrity work, especially roadmap issues #16 and #24. Cryptographic/tamper-evident provenance may strengthen this later, but the runtime must remain fail-closed even without cryptography whenever a memory explicitly claims source lineage.

## Boundary

EXP-015 proves deterministic runtime reconciliation against canonical store reads. Production database integrity, signatures/attestation, cross-tenant identity, import authorization and tamper resistance remain separately unverified.