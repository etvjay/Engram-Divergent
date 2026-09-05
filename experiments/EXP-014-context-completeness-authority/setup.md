# EXP-014 — Setup

Date: 2026-08-16

## Subject memory

The experiment uses one Operational Memory owned by `release-agent`:

- memory type: `SUCCESSFUL_RECOVERY`
- evidence state: `OBSERVED`
- confidence: `0.96`
- environment: `prod-v2`
- tool version: `2.4.0`
- high retrieval score: `0.99`

The memory recommends a staged rollout after a prior v2 migration-lock incident.

## Policy under test

The default runtime expiry policy enables:

- `invalidateOnEnvironmentChange: true`
- `invalidateOnToolMajorVersionChange: true`

EXP-014 extends recall eligibility so these version-bound memories also fail closed if the future execution omits the corresponding metadata needed for comparison.

New machine-readable rejection reasons:

- `EXECUTION_ENVIRONMENT_UNSPECIFIED`
- `EXECUTION_TOOL_VERSION_UNSPECIFIED`

Existing incompatibility reasons remain unchanged:

- `INVALIDATED_ENVIRONMENT_CHANGE`
- `INVALIDATED_TOOL_MAJOR_VERSION_CHANGE`

## Cases

### Case A — comparison context missing

Execution omits both `environmentVersion` and `toolVersion`.

Expected:
- memory is retrieved as a candidate;
- memory is rejected before exposure;
- rejection includes both missing-context reasons;
- recall emits `RECALL_FILTERED` evidence.

### Case B — sufficient compatible context

Execution declares:
- environment `prod-v2`
- tool `2.9.1`

Expected:
- same memory passes eligibility;
- same memory is exposed.

The tool patch version differs but major version remains compatible under the current policy.

### Case C — explicit incompatibility

Execution declares:
- environment `prod-v3`
- tool `3.0.0`

Expected:
- same memory is rejected before exposure;
- existing environment/tool-major invalidation reasons are preserved.

## Automated evidence

Primary test:
- `tests/runtime/context-completeness-memory.test.ts`

Policy implementation:
- `packages/runtime/src/policy.ts`

Acceptance run:
- GitHub Actions Engram CI `31943569578`

The run passed 43 test files / 109 tests, with the credential-gated integration tests remaining separately skipped.