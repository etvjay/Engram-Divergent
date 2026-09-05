# EXP-012 — Decision

Date: 2026-08-16
Status: **ACCEPTED**
Evidence: GitHub Actions Engram CI `31937523867`

## Decision

Multi-source repeated-pattern memory is accepted as a canonical Engram execution-memory scenario and runtime capability.

## Accepted invariant

A derived memory whose claim depends on repetition across executions must be able to preserve the actual supporting execution set rather than collapsing provenance onto one run.

For EXP-012:

- source executions: three comparable `SUCCESS` handoffs;
- recurring consequence: two clarification rounds / 14 simulated minutes;
- memory type: `REPEATED_PATTERN`;
- source lineage: all three same-agent executions;
- memory-free control: repeats `MINIMAL_HANDOFF` and the clarification pattern;
- treatment: `CONSTRAINT_COMPLETE_HANDOFF`;
- treatment consequence: zero clarification rounds / 5 simulated minutes;
- treatment outcome: `SUCCESS`;
- counterfactual: real same-context `CONTROL_RUN`.

## Architectural consequence

`AdmissionSignal.sourceExecutionIds` is now the explicit runtime mechanism for multi-source memory provenance. An omitted source set preserves normal single-source admission. An explicit set must include the admitting execution, reference existing executions and remain within one Engram agent's ownership boundary.

Multiple source executions are provenance, not automatic proof, confidence inflation, consensus or cross-agent shared memory.

Application-specific pattern detection remains outside Engram runtime core: the application declares that a pattern has become significant; Engram validates and preserves its supporting execution lineage.

## Frontend/API consequence

Because multi-source admission is part of the SDK/HTTP completion contract, it is documented in the adjacent frontend-usage guides and `openapi.json`. UI clients can discover and display source lineage without reading runtime implementation files.

## Boundary

The handoff workload is **SIMULATED**. Live distributed-agent coordination and observed production latency improvements remain UNVERIFIED.