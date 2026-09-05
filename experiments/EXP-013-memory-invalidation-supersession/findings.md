# EXP-013 — Findings

Date: 2026-08-16
Evidence run: GitHub Actions Engram CI `31940295594`
Result: **PASS**

## Findings

1. Historical memories remained persisted and inspectable; no invalidation path deleted or rewrote them.
2. The `runtime-v1` / tool `1.8.0` lesson appeared as a retrieval candidate under the later `runtime-v2` / tool `2.1.0` execution but was rejected before exposure.
3. The obsolete environment memory carried distinct rejection reasons:
   - `INVALIDATED_ENVIRONMENT_CHANGE`
   - `INVALIDATED_TOOL_MAJOR_VERSION_CHANGE`
4. A separate `runtime-v2` lesson remained environment/tool compatible but was explicitly marked as superseded by newer observed recovery evidence.
5. The relationship-aware eligibility advisor rejected that compatible-but-superseded memory with `MEMORY_SUPERSEDED`.
6. The newer current memory remained eligible and was the only memory exposed in treatment recall.
7. The memory-free same-context control explicitly recorded the `COMPAT_MODE` action, completed `PARTIAL`, and required rollback.
8. The treatment used the exposed current memory to change the application strategy to `STAGED_CURRENT`.
9. Engram recorded the current memory as `CHANGED_ACTION` influence with the real completed control execution as `CONTROL_RUN` counterfactual evidence.
10. Treatment completed `SUCCESS` without rollback.
11. A second lifecycle E2E independently exercised the underlying environment/tool invalidation plus relationship-aware supersession composition.
12. The clean acceptance head passed experiment-registry conformance with one canonical EXP-013 evidence directory.

## Interpretation

Engram can separate **historical validity** from **current authority**.

Two distinct lifecycle mechanisms were proven:

- contextual invalidation caused by environment/tool evolution;
- explicit supersession caused by newer assessed relationship evidence.

Neither mechanism requires destructive history mutation. This is important because an old memory may remain valuable for audit, explanation, comparison, rollback analysis or future reassessment even after it should no longer govern current execution.

The stronger control establishes that `CONTROL_RUN` is not merely a recall-only baseline: it is an observed execution with its own decision and outcome. That gives the later changed-action claim materially stronger causal provenance.

## Boundary

The runtime-upgrade workload is deterministic and **SIMULATED**. EXP-013 does not prove live infrastructure upgrade safety, automated semantic detection of supersession, or a complete production memory-lifecycle control plane.