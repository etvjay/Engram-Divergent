# EXP-016 — Hypothesis

Date: 2026-08-16

## Question

Can Engram enforce agent-owned memory authority at the runtime layer even when a storage adapter incorrectly returns a memory owned by another agent?

## Hypothesis

A storage query being agent-scoped is necessary but not sufficient defense-in-depth. Before recall exposure and again before decision influence, Engram should require the Operational Memory's `agentId` to match the current execution's `agentId`.

A foreign-agent memory must fail closed even if it is highly ranked, semantically relevant, context-compatible and returned by the store itself.

## Expected result

- A top-ranked foreign-agent memory is rejected with `MEMORY_AGENT_MISMATCH` before exposure.
- The equivalent same-agent memory remains eligible when all other rules pass.
- A memory that matched ownership during recall but no longer matches at decision time is rejected before influence.
- A rejected influence persists no decision and emits `INFLUENCE_REJECTED`.

## Why this matters

Storage adapters, migrations, imports, corrupted indexes, direct writes and future persistence implementations can violate assumptions made by the query layer. Agent isolation is important enough to be checked at the semantic authority boundary as well as in the database query.

## Boundary

This experiment proves runtime defense-in-depth for the current single-agent ownership model. It does not implement tenant/workspace RBAC, authenticated principals, row-level database security, shared/team memory authorization, or live cross-tenant isolation.