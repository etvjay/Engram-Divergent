# EXP-001 Findings

## Automated result

SUPPORTED within the deterministic experiment boundary.

The current automated Engram suite demonstrates:

- memory-free baseline selects Route C;
- Route C encounters the simulated Venue C liquidity failure and compensates;
- the prior execution produces a persisted Operational Memory;
- the later comparable execution retrieves the memory;
- runtime policy controls whether the memory is exposed;
- the later decision explicitly references the recalled memory;
- the decision records `CHANGED_ACTION` and a CONTROL_RUN counterfactual;
- the treatment selects Route D rather than Route C;
- Route D succeeds in the deterministic simulator;
- the trace preserves the source execution, retrieval, influence, decision, counterfactual, and outcome relationship.

Latest relevant aggregate CI evidence at time of this finding: GitHub Actions Engram CI run `31922542963` succeeded with build and full test suite.

## What this supports

Engram can produce a controlled, reconstructable behavioral difference in which prior execution memory changes a later application decision under comparable context.

## What this does not support

This experiment does not prove:

- live external venue execution;
- general improvement across arbitrary workloads;
- that every recalled memory is useful;
- that a later success by itself proves the memory was beneficial;
- live CockroachDB Cloud persistence;
- live Bedrock invocation;
- live Managed MCP connectivity;
- live C-SPANN index selection.

Those claims require their own external evidence or evaluation records.

## Open external verification

`Engram Live Verification` is the canonical credentialed extension. Its artifact must distinguish:

- external venue execution: SIMULATED;
- vector-distance retrieval: VERIFIED only if the live query succeeds;
- C-SPANN cosine index usage: VERIFIED only if the natural EXPLAIN plan selects the expected agent-scoped cosine index;
- CockroachDB, Bedrock, and Managed MCP: VERIFIED only if actually exercised in the workflow.
