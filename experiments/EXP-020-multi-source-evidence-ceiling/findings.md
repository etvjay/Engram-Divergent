# EXP-020 — Findings

**Status: ACCEPTED**

## Red evidence

The pre-implementation adversarial run reproduced the predicted authority escalation.

- Engram CI run: `31948342358`
- Adversarial commit: `5a1dfacce1b59f5a116c45c4962607ca9627de17`
- Result: **FAILURE**, as expected for the red phase.
- An `OBSERVED` historical supporting execution plus a `VERIFIED` admitting execution was able to admit a `VERIFIED` multi-source memory before the fix.

This proved EXP-017's admitting-execution ceiling did not cover additional declared supporting executions.

## Green evidence

- EXP-020 scoped acceptance run: `31948369159`, attempt 3 — **SUCCESS**.
- Full `npm run check` passed before the workflow was allowed to commit the runtime/Cockroach change.
- The mixed-source escalation regression passes: `VERIFIED` over `[OBSERVED, VERIFIED]` is rejected.
- Conservative positive control passes: `OBSERVED` over `[OBSERVED, VERIFIED]` is accepted.
- Strong positive control passes: `VERIFIED` over `[VERIFIED, VERIFIED]` is accepted.
- Missing persisted outcome evidence for a historical declared source fails closed.
- Existing source deduplication, admitting-execution membership, same-agent provenance and repeated-handoff behavior remain green.
- CockroachDB runtime storage resolves historical source evidence from the canonical `outcomes.evidence_state` record.

## Finding

`sourceExecutionIds` already means executions whose evidence supports a memory. Therefore each declared source is an authority-bearing dependency, not a confidence-inflating citation. A derived multi-source memory cannot soundly claim an evidence rank stronger than any declared supporting source outcome.

The effective evidence ceiling is consequently the minimum evidence rank across the declared supporting source outcomes. The current admitting execution remains independently bounded by EXP-017; historical sources are revalidated from persisted outcome evidence.

## Boundary

This proves deterministic evidence-state authority for declared supporting sources. It does not prove that an external source deserves its evidence label, cryptographically attest outcome truth, define weighted/non-material source roles, or establish live CockroachDB Cloud behavior. Those require separate live verification and, if needed, a future explicit source-role contract.
