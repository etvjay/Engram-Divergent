# EXP-017 — Setup

Date: 2026-08-16

## Implementation

- `packages/runtime/src/policy.ts`
  - evidence ordering is explicit;
  - admission evaluation accepts the admitting execution evidence state;
  - stronger memory evidence is rejected with `MEMORY_EVIDENCE_EXCEEDS_EXECUTION_EVIDENCE`.
- `packages/runtime/src/runtime.ts`
  - `complete()` passes the execution outcome evidence state into admission evaluation.

## Automated proof

Primary test:
- `tests/runtime/evidence-state-escalation.test.ts`

Acceptance run:
- GitHub Actions Engram CI `31944907415`

## Cases

1. `OBSERVED` outcome → `VERIFIED` memory signal: rejected.
2. `OBSERVED` outcome → `OBSERVED` memory signal: admitted.
3. `VERIFIED` outcome → `OBSERVED` memory signal: admitted.

## Evidence discipline

The test verifies both persisted memory state and rejection evaluation events. The outcome itself remains recorded even when the derived memory signal is rejected.