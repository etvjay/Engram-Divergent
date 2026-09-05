# EXP-018 — Setup

Date: 2026-08-16

## Implementation

Primary runtime surface:
- `packages/runtime/src/runtime.ts`

Run-backed counterfactuals (`CONTROL_RUN`, `SHADOW_RUN`, `REPLAY`) are checked before memory influence is accepted.

## Required comparison properties

- `comparisonExecutionId` is present.
- The comparison is not the influenced execution itself.
- The comparison execution exists.
- The comparison execution belongs to the same agent.
- The comparison execution is complete rather than `RUNNING` or `MEMORY_UNAVAILABLE`.

## Automated proof

Primary test:
- `tests/runtime/counterfactual-authenticity.test.ts`

Acceptance run:
- GitHub Actions Engram CI `31945075487`

## Cases

1. Missing comparison execution ID — reject.
2. Nonexistent comparison execution — reject.
3. Self-reference — reject.
4. Foreign-agent completed comparison — reject.
5. Same-agent but still-running comparison — reject.
6. Real, distinct, completed same-agent comparison — accept and persist the decision.