# EXP-015 — Hypothesis

Date: 2026-08-16

## Question

Can Engram prevent a plausible, high-scoring Operational Memory from gaining current action authority when that memory claims execution provenance that cannot be reconciled with canonical execution history?

## Hypothesis

If an Operational Memory declares source execution lineage, Engram should fail closed before recall exposure and again before decision influence when any declared source is missing, belongs to another agent, is structurally malformed, or contradicts the memory's other lineage fields.

A valid same-agent lineage should remain eligible when all other retrieval/influence rules pass.

## Why this matters

Admission-time source validation is insufficient by itself. Persisted data may be imported, migrated, corrupted, externally written, restored from backup, or become inconsistent after an integrity failure. Retrieval score, semantic relevance and confidence cannot authenticate provenance.

The durable invariant should therefore be:

> Claimed provenance is evidence only while it remains reconcilable with canonical source executions.

## Expected result

- Valid same-agent source lineage remains recall-visible.
- A nonexistent claimed source is rejected.
- A claimed source owned by another agent is rejected.
- Contradictory `sourceExecutionId` / `sourceExecutionIds` declarations are rejected.
- A memory exposed under valid lineage is rejected at influence time if that lineage can no longer be resolved.
- Legacy memories that declare no source lineage remain readable for backward compatibility; absence of a claim is not silently upgraded into verified provenance.

## Boundary

This experiment tests runtime provenance-integrity semantics against deterministic in-memory fixtures. It does not prove tamper-proof storage, cryptographic attestation, database-level foreign-key integrity for imported data, or cross-tenant authorization.