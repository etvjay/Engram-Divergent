# EXP-001 — Memory-Caused Decision

## Hypothesis

Under the same execution intent, environment, constraints, route policy, and simulated liquidity state, a prior execution memory describing the failure of Venue C will cause a later agent decision to choose Route D instead of the memory-free baseline Route C.

## Independent variable

Availability of the admitted Operational Memory produced from the prior compensated execution.

- CONTROL: no relevant execution memory is exposed to the decision.
- TREATMENT: the prior admitted memory is retrieved, passes runtime policy, is exposed, and is explicitly referenced by the later decision.

## Dependent variables

1. Selected route.
2. Recorded `MemoryInfluence` relationship.
3. Counterfactual action attached to `CHANGED_ACTION`.
4. Simulated external outcome.
5. Reconstructability of the memory-to-action trace.

## Expected result

- CONTROL selects Route C (`A → B → C`).
- Route C encounters `LIQUIDITY_UNAVAILABLE` at C and is compensated.
- The compensated execution produces an Operational Memory warning against depending on C in comparable thin-liquidity executions.
- TREATMENT retrieves that memory and selects Route D (`A → B → D`).
- TREATMENT succeeds in the deterministic simulator.
- The later decision records `CHANGED_ACTION` with the prior memory and a control-run counterfactual pointing to Route C.

## Falsification conditions

The hypothesis is not supported if any of the following occurs:

- CONTROL and TREATMENT do not have comparable task/environment/constraints.
- TREATMENT chooses Route D without the prior memory being persisted and recalled.
- The memory is retrieved but not exposed after policy filtering.
- The later decision does not explicitly reference the recalled memory.
- Route selection is unchanged from the memory-free baseline.
- The counterfactual cannot be reconstructed.
- The external outcome is presented as live rather than SIMULATED.

## Evidence boundary

This experiment is designed to prove a controlled behavioral difference in Engram's execution-memory runtime. It does not claim anthropomorphic learning and does not claim that the external multi-venue workload is live.
