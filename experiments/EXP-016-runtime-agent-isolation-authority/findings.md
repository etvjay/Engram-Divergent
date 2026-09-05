# EXP-016 — Findings

Date: 2026-08-16
Evidence run: GitHub Actions Engram CI `31944737562`
Result: **PASS**

## Findings

1. An adversarial/mis-scoped store returned a foreign-agent Operational Memory as its top retrieval result.
2. Engram rejected that memory before recall exposure with `MEMORY_AGENT_MISMATCH`.
3. Retrieval relevance, confidence and matching environment/tool metadata did not override the ownership mismatch.
4. The equivalent memory was recall-eligible when its `agentId` matched the current execution agent.
5. Memory ownership was checked again immediately before influence.
6. When ownership changed after recall, Engram rejected the influence, persisted no decision and emitted `INFLUENCE_REJECTED`.

## Interpretation

Agent scoping is now defense-in-depth rather than a storage-only assumption.

The persistence/search layer should continue to query memory by agent. EXP-016 adds an independent semantic check where memory becomes visible or authoritative, so a mis-scoped store result cannot silently become agent memory.

This also preserves the boundary established by EXP-011: participation by another agent in an execution does not imply shared memory ownership.

## Boundary

The test is deterministic and **SIMULATED**. It does not prove multi-tenant authentication, tenant/workspace authorization, database row-level security, service-principal identity or explicit team/shared-memory ACL semantics.