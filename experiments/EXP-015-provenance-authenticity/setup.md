# EXP-015 — Setup

Date: 2026-08-16

## Runtime surface

Primary implementation:
- `packages/runtime/src/runtime.ts`

Primary automated proof:
- `tests/runtime/provenance-authenticity-memory.test.ts`

Acceptance run:
- GitHub Actions Engram CI `31944577594`

## Fixture

A high-confidence `REPEATED_PATTERN` Operational Memory is returned as a top-ranked retrieval candidate for the same workflow, environment and tool version.

The memory may declare:
- `sourceExecutionId`
- `sourceExecutionIds`

The runtime reconciles those declared IDs against canonical executions through `EngramRuntimeStore.getExecution()`.

## Cases

### Valid lineage
Two real source executions exist and are owned by the same Engram agent as the memory.

Expected: the memory remains eligible for recall.

### Missing source
The memory claims a UUID that does not resolve to an execution.

Expected rejection reason:
- `MEMORY_SOURCE_EXECUTION_NOT_FOUND:<id>`

### Foreign-agent source
The memory claims an execution owned by another Engram agent.

Expected rejection reason:
- `MEMORY_SOURCE_AGENT_MISMATCH:<id>`

### Contradictory lineage declaration
`sourceExecutionId` is not contained in the explicitly declared `sourceExecutionIds` set.

Expected rejection reason:
- `MEMORY_SOURCE_LINEAGE_CONTRADICTORY`

### Recall-to-influence integrity change
The source resolves successfully during recall, so the memory is exposed. Before decision recording, the canonical source becomes unavailable in the fixture.

Expected:
- influence is rejected;
- no decision is persisted;
- runtime emits `INFLUENCE_REJECTED`;
- the rejection contains `MEMORY_SOURCE_EXECUTION_NOT_FOUND:<id>`.

## Compatibility boundary

Memories that declare no source lineage remain readable. EXP-015 prevents Engram from treating a claimed-but-invalid provenance graph as trustworthy; it does not retroactively manufacture provenance for legacy objects.