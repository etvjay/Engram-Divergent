# EXP-003 Setup

## Automated proof

`tests/evaluation/contradiction-harm.test.ts`

## Case A — explicit contradiction

Create two distinct memory IDs and an evaluator-assessed relationship:

- relation: `CONTRADICTS`
- evidence state: `OBSERVED`
- method: `EVALUATOR`
- rationale: later observed execution supports a lesson conflicting with the older one

Assertions:

- left and right memory IDs remain distinct;
- relationship parses as `CONTRADICTS`;
- no overwrite/delete operation is part of the relationship model.

## Case B — controlled harmful effect

Create a `MemoryEvaluation` with:

- method: `CONTROL_RUN`
- effect: `HARMFUL`
- effect score: -0.8
- comparable control variables recorded
- explicit rationale that treatment was worse than the memory-free baseline

Feed corresponding aggregate metrics into Engram quality assessment.

Assertions:

- effect remains `HARMFUL`;
- interpretation is `NEGATIVE_EVIDENCE`;
- warning includes `HARMFUL_EFFECT_RECORDED`;
- evaluation metadata does not imply deletion.

## Case C — mixed evidence

Construct metrics with one controlled beneficial and one controlled harmful evaluation for the same memory.

Assertion: interpretation is `MIXED_EVIDENCE`, preserving both historical effects.

## Evidence boundary

This experiment tests Engram's evaluation/relationship semantics deterministically. It does not automatically decide which contradictory memory should govern a future execution; that remains a retrieval/policy/context decision and must preserve the relationship/evaluation evidence.
