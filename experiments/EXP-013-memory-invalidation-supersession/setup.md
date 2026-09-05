# EXP-013 — Setup

Date: 2026-08-16

## Workload

A deterministic runtime-upgrade application owns the business decision between:

- `COMPAT_MODE` — baseline strategy; completes PARTIAL and requires rollback in the current environment.
- `STAGED_CURRENT` — current strategy; completes SUCCESS without rollback.

Engram does not choose the upgrade strategy. It recalls and filters Operational Memory, validates declared influence, and records provenance.

## Memory history

The test creates three memories for the same agent:

1. **Environment-obsolete memory**
   - created under `runtime-v1` / tool `1.8.0`;
   - historically valid compatibility guidance;
   - candidate remains stored;
   - current `runtime-v2` / tool `2.1.0` should reject it with environment/tool invalidation reasons.

2. **Still-compatible but superseded memory**
   - created under current `runtime-v2` / tool `2.1.0`;
   - initially suggests `COMPAT_MODE`;
   - remains structurally compatible with the current execution;
   - explicit relationship evidence marks it superseded by newer memory.

3. **Current memory**
   - created under current `runtime-v2` / tool `2.1.0`;
   - observed successful recovery evidence recommends `STAGED_CURRENT`;
   - explicitly `SUPERSEDES` memory #2.

## Runtime composition

- `EngramRuntime`
- `DEFAULT_RUNTIME_POLICIES`
  - `invalidateOnEnvironmentChange: true`
  - `invalidateOnToolMajorVersionChange: true`
- `RelationshipMemoryEligibilityAdvisor`
  - `supersededMemoryStages: ["RECALL", "INFLUENCE"]`

## Control

A same-context `runtime-v2` execution deliberately performs no memory recall and therefore uses `COMPAT_MODE`. It records that decision, completes `PARTIAL`, and requires rollback.

## Treatment

A same-context `runtime-v2` execution recalls all stored candidates.

Expected recall behavior:

- environment-obsolete memory rejected with `INVALIDATED_ENVIRONMENT_CHANGE` and `INVALIDATED_TOOL_MAJOR_VERSION_CHANGE`;
- current-environment superseded memory rejected with `MEMORY_SUPERSEDED`;
- current memory exposed.

The application then selects `STAGED_CURRENT` and declares the current memory as `CHANGED_ACTION` influence with the real control execution as `CONTROL_RUN` counterfactual. The treatment completes `SUCCESS` without rollback.

## Automated evidence

Primary tests:

- `tests/e2e/memory-invalidation-supersession.test.ts`
- `tests/e2e/memory-lifecycle-invalidation.test.ts`

Scenario fixture:

- `packages/scenarios/environment-evolution/src/index.ts`

Acceptance run:

- GitHub Actions Engram CI `31940295594`

The acceptance run executed both EXP-013 E2Es successfully and passed the experiment-registry conformance gate after the duplicate EXP-013 evidence directory was removed.