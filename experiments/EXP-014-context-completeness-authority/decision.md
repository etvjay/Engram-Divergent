# EXP-014 — Decision

Date: 2026-08-16
Status: **ACCEPTED**
Evidence: GitHub Actions Engram CI `31943569578`

## Decision

Accept **context completeness** as part of memory authority.

When an Operational Memory is explicitly bound to an environment or tool version and the active policy uses that dimension for invalidation, a future execution must provide the corresponding comparison metadata before that memory may be exposed.

## Accepted invariants

- Missing required comparison context is UNKNOWN compatibility, not compatibility.
- A high retrieval score cannot override missing environment/tool comparison evidence.
- A high confidence score cannot override missing environment/tool comparison evidence.
- Version-bound memory fails closed before recall exposure when comparison metadata is absent.
- Supplying sufficient compatible metadata may restore eligibility without mutating the memory.
- Supplying incompatible metadata continues to use the existing invalidation reasons.
- This rule does not require environment/tool metadata for memories that are not bound to those dimensions.
- Application/business action selection remains outside Engram.

## Architectural consequence

Context is not merely retrieval input. Some context fields are **authority predicates**: without enough information to evaluate them, Engram cannot safely conclude that historical experience remains applicable.

Long-horizon lifecycle and policy surfaces should therefore make missing comparison context inspectable rather than silently collapsing UNKNOWN into eligible.

## Boundary

This experiment is TESTED through deterministic runtime CI. Live applications may still provide inaccurate or semantically weak version identifiers; provenance and context authenticity remain separate concerns.