# EXP-013 — Decision

Date: 2026-08-16
Status: **ACCEPTED**
Evidence: GitHub Actions Engram CI `31940295594`

## Decision

Accept memory invalidation and explicit supersession as distinct, composable mechanisms for removing current action authority without removing historical evidence.

## Accepted invariants

- Memory history is append-preserving; invalidation does not mean deletion.
- Environment/tool evolution may make a previously valid memory ineligible.
- Explicit `SUPERSEDES` evidence may make a still-compatible memory ineligible.
- Supersession is not inferred from recency, retrieval score or vector similarity alone.
- Recall must preserve machine-readable rejection reasons.
- A rejected memory from a retrieval cannot be used as valid influence provenance.
- A current eligible memory may change application behavior with explicit retrieval and counterfactual provenance.
- `CONTROL_RUN` evidence for a changed-action claim should reference a real observed execution whenever available, not a recall-only baseline.

## Architectural consequence

Engram must treat **historical truth/evidence** and **current operational authority** as different dimensions.

The current runtime already contains important pieces of this lifecycle model through expiry/invalidation policy plus relationship-aware eligibility. Long-horizon work should make that lifecycle inspectable and first-class in the control plane rather than replacing these semantics with destructive mutation.

Tracked in roadmap issue #3.

## Boundary

The workload is **SIMULATED**. A complete lifecycle state machine, administrative lifecycle actions, production reactivation semantics and live infrastructure evidence remain future work.