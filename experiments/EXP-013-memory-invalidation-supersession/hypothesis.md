# EXP-013 — Hypothesis

Date: 2026-08-16

## Question

Can Engram preserve historically valid operational memories while preventing obsolete or explicitly superseded memories from influencing a later execution after the environment changes?

## Hypothesis

A memory that was valid under an earlier environment/tool version should remain stored as historical evidence but lose recall eligibility when configured invalidation rules detect environment or tool-major drift. Separately, a memory that is still context-compatible should be able to lose authority through explicit `SUPERSEDES` relationship evidence without being deleted or rewritten.

A newer current memory should remain eligible and may change the later application action with exact recall and counterfactual provenance.

## Expected causal chain

`historical lesson → environment/tool evolution → invalidation`

and independently:

`compatible lesson → explicit newer evidence → SUPERSEDES → old lesson loses authority`

followed by:

`current lesson → treatment recall → changed action vs same-context control → observed outcome`

## Invariants

1. Historical memories are not deleted to remove authority.
2. Environment/tool invalidation and explicit supersession remain distinguishable rejection causes.
3. Supersession is explicit evidence; it is never inferred solely from recency or vector similarity.
4. Rejected memories cannot be cited as influences from that retrieval.
5. A current eligible memory may influence only through an exposed retrieval.
6. `CHANGED_ACTION` requires a real or otherwise explicitly sourced counterfactual.

## Boundary

The upgrade workload is deterministic and SIMULATED. The experiment proves runtime eligibility/provenance behavior, not a live infrastructure upgrade.