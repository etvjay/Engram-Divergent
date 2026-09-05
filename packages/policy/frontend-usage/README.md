# Memory Policy Contracts — Frontend Usage

**Consumption mode:** `BROWSER_SAFE`

## What exists

`packages/policy/src/contracts.ts` exposes versioned schemas/types for:

- admission policy;
- retrieval policy;
- influence policy;
- expiry policy;
- policy bundles;
- policy scopes.

These are the canonical structures for rendering and validating policy configuration in UI surfaces.

```ts
import { MemoryPolicyBundleSchema } from "<engram-policy-path>";

const bundle = MemoryPolicyBundleSchema.parse(payload);
```

## What the frontend may do

- render active/draft/retired policy definitions received from the API;
- build policy editors/forms against the schema;
- explain admission/retrieval/influence/expiry rules;
- show the policy bundle/version frozen to an execution.

## What the frontend must not assume

- a policy bundle directly chooses workload actions;
- changing the currently active policy retroactively changes an in-flight execution;
- retrieval score alone grants influence authority.

Policy governs whether memory may be admitted, exposed, influence a decision, or expire. The application still decides workload action.

## Current admission signal vocabulary

Includes `UNEXPECTED_FAILURE`, `SUCCESSFUL_RECOVERY`, `POLICY_VIOLATION`, `HUMAN_CORRECTION`, `SAFETY_INTERVENTION`, `SIGNIFICANT_COST`, `NOVEL_CONDITION`, and `REPEATED_PATTERN`.

## Implementation/tests

- `packages/policy/src/contracts.ts`
- `packages/policy/src/registry.ts`
- `tests/runtime/frozen-policy.test.ts`

**Evidence status:** TESTED for contracts/runtime policy behavior. Policy-management UI writes are not implied by this module.