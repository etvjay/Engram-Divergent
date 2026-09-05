# EXP-002 Setup

## Runtime under test

`EngramRuntime` with `DEFAULT_RUNTIME_POLICIES` and a deterministic adversarial store.

## Case A — stale memory

Memory:

- evidence state: OBSERVED
- confidence: 0.95
- final retrieval score: 0.95
- `validUntil`: before the test execution
- memory environment: `prod-v1`
- execution environment: `prod-v2`
- memory tool: `1.9.0`
- execution tool: `2.0.0`

Expected rejection reasons include:

- `MEMORY_EXPIRED`
- `INVALIDATED_ENVIRONMENT_CHANGE`
- `INVALIDATED_TOOL_MAJOR_VERSION_CHANGE`

Expected persisted exposure set: empty.

## Case B — low-confidence influence

Memory:

- evidence state: OBSERVED
- confidence: 0.20
- current environment/tool versions
- retrieval score high enough to pass retrieval policy

Procedure:

1. Recall the memory.
2. Confirm it is exposed.
3. Attempt to record a decision with the memory as `SUPPORTED_ACTION` influence.
4. Expect runtime influence validation to reject the operation with `CONFIDENCE_BELOW_THRESHOLD`.
5. Confirm no runtime decision is persisted by the adversarial store.
6. Confirm `INFLUENCE_REJECTED` is emitted.

## Automated proof

`tests/runtime/bad-memory.test.ts`

## Evidence boundary

This experiment proves policy separation in the deterministic runtime. It does not claim that the production policy thresholds are universally correct for every workload; those thresholds are versioned configuration and should be tuned/evaluated per workload.
