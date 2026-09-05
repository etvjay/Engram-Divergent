# EXP-016 — Decision

Date: 2026-08-16
Status: **ACCEPTED**
Evidence: GitHub Actions Engram CI `31944737562`

## Decision

Accept same-agent ownership as a runtime authority invariant for the current Operational Memory model.

## Accepted invariants

- Storage-layer agent scoping is necessary but not sufficient.
- A memory exposed to an execution must have `memory.agentId === execution.agentId` under the current ownership model.
- Ownership is checked before recall exposure and revalidated before decision influence.
- Retrieval score, confidence, semantic relevance and context compatibility cannot override ownership mismatch.
- A previously exposed memory does not retain influence authority if its ownership no longer matches at decision time.
- Multi-agent participation does not implicitly create shared memory ownership.

## Architectural consequence

Engram now has defense-in-depth for per-agent memory ownership across storage queries and runtime authority checks.

This should become a primitive beneath roadmap #5 rather than being replaced by it. Future tenant/workspace identity and shared-memory authorization must extend the ownership model explicitly instead of weakening the current default isolation.

## Boundary

This experiment does not define human/service identities, tenants, workspaces, roles, ACLs or shared/team memory. Those remain long-horizon work in #5 and #10.