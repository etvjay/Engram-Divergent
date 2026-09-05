# EXP-003 Findings

## Result

SUPPORTED within the deterministic evaluation boundary.

GitHub Actions Engram CI run `31922956931` completed successfully with the full suite containing `tests/evaluation/contradiction-harm.test.ts`.

## Case A — contradictory memories remain distinct

The evaluation model accepts a `CONTRADICTS` relationship only between distinct memory IDs and records independent relationship provenance: rationale, evidence state, method, and assessment time.

The relationship does not contain overwrite or deletion semantics. This preserves both historical memory identities while making the conflict explicit and queryable.

## Case B — controlled harmful effect remains evidence

A CONTROL_RUN evaluation with `effect: HARMFUL` and a negative effect score is accepted as explicit effect evidence. The corresponding quality assessment produces:

- interpretation: `NEGATIVE_EVIDENCE`;
- warning: `HARMFUL_EFFECT_RECORDED`.

The evaluation remains evidence about the memory. It is not translated into an implicit delete operation.

## Case C — later positive evidence does not erase harm

When the same memory has both controlled beneficial and harmful evaluations, the aggregate quality interpretation is `MIXED_EVIDENCE`.

This prevents a latest-result-wins model from rewriting the historical assessment record.

## What this supports

Engram can represent contradiction and harmful memory effects append-only:

`memory A + memory B + explicit relationship + independent effect evaluations`

rather than collapsing them into one mutable current conclusion.

## What this does not support

This experiment does not prove:

- that Engram can automatically discover every semantic contradiction;
- that a harmful memory should always be excluded from future recall;
- that contradiction resolution can be decided from vector similarity;
- that a single harmful effect makes a memory universally harmful;
- live CockroachDB persistence of these evaluation records.

Those remain policy/context/evaluation questions and, for persistence, require credentialed external verification.
