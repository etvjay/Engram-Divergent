# EXP-016 — Setup

Date: 2026-08-16

## Runtime surface

Primary implementation:
- `packages/runtime/src/runtime.ts`

Primary automated proof:
- `tests/runtime/agent-isolation-authority.test.ts`

Acceptance run:
- GitHub Actions Engram CI `31944737562`

## Adversarial store

The fixture deliberately violates the normal storage expectation by returning a top-ranked Operational Memory whose `agentId` differs from the current execution agent.

The memory remains otherwise attractive:
- high semantic/context/final scores;
- high confidence;
- allowed evidence state;
- matching workflow;
- matching environment and tool versions.

This isolates ownership as the reason for rejection.

## Cases

### Foreign memory returned by store
Current execution: `agent-a`.
Returned memory: `agent-b`.

Expected:
- no recall exposure;
- rejection contains `MEMORY_AGENT_MISMATCH`.

### Same-agent control
Current execution and memory are both owned by `agent-a`.

Expected:
- recall remains eligible.

### Ownership changes after recall
The memory is owned by `agent-a` during recall and is exposed. Before decision recording, the fixture changes its owner to `agent-b`.

Expected:
- influence fails with `MEMORY_AGENT_MISMATCH`;
- no decision is persisted;
- `INFLUENCE_REJECTED` is emitted.

## Boundary

The fixture is deterministic and intentionally adversarial. It proves the runtime does not rely solely on storage-layer scoping for agent ownership.