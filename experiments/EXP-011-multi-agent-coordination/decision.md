# EXP-011 — Decision

Date: 2026-08-16
Status: **ACCEPTED**
Evidence: GitHub Actions Engram CI `31937169717`

## Decision

Coordinator-owned multi-agent coordination memory is accepted as a canonical Engram execution-memory scenario.

## Accepted invariant

A multi-agent interaction may become Operational Memory for the agent that owned the consequential coordination decision, without implicitly granting worker agents access to that memory.

For EXP-011:

- memory owner: `coordinator-agent`;
- worker identities: execution evidence/details;
- memory-free strategy: `PARALLEL_UNLEASED`;
- observed consequence: `CONCURRENT_WRITE_CONFLICT` and `PARTIAL` outcome;
- treatment strategy: `LEASED_SERIALIZATION`;
- treatment outcome: `SUCCESS`;
- counterfactual: real same-context `CONTROL_RUN`.

## Architectural consequence

Engram does not need to introduce cross-agent shared memory merely to support multi-agent applications. A coordinator can remember its own prior coordination executions and use that experience to alter future dispatch. Shared/team memory, if introduced later, requires an explicit identity, authorization and provenance design rather than being inferred from worker participation.

Workload-specific leasing/serialization remains application logic outside the Engram runtime.

## Boundary

The coordination workload is **SIMULATED**. Live worker agents, distributed locks/leases and cross-agent memory authorization remain UNVERIFIED.