# EXP-004 Findings

## Result

SUPPORTED in the deterministic runtime/evaluation boundary.

`tests/runtime/competing-memories.test.ts` passed in Engram CI run 31923190792. The aggregate run later failed in an unrelated stale API-auth conformance suite; the EXP-004 test itself completed successfully.

## Control — surface-only relationship evidence

With the explicit contradiction present in the evaluation store but no `MemoryEligibilityAdvisor` configured:

- both otherwise eligible memories were recalled;
- both remained exposed;
- the application could record a valid `SUPPORTED_ACTION` influence using one recalled memory.

This confirms that relationship evidence does not silently affect runtime behavior unless an explicit eligibility policy consumes it.

## Treatment — fail closed at influence only

With `RelationshipMemoryEligibilityAdvisor` configured for:

`unresolvedContradictionStages = ["INFLUENCE"]`

observed behavior was:

- both contradictory memories remained recall-visible;
- attempted influence using one unresolved contradictory memory was rejected with `UNRESOLVED_MEMORY_CONTRADICTION`;
- runtime recorded `INFLUENCE_REJECTED`;
- no treatment decision was persisted.

This supports the hypothesis that Engram can preserve conflicting experience for inspection/reasoning while withholding action authority from unresolved conflict.

## Explicit resolution

After adding directional evidence:

`Memory B SUPERSEDES Memory A`

- the A/B contradiction was no longer unresolved for B;
- B remained recall-visible;
- B could again be accepted as `SUPPORTED_ACTION` influence under the treatment policy.

The experiment did **not** automatically block A merely because A became superseded. Blocking superseded memory remains a separate advisor configuration and policy decision.

## Architectural result

The runtime did not import evaluation relationship semantics. Runtime core only invokes the optional generic eligibility contract:

`stage + execution + memory -> additional rejection reasons`

The evaluation layer adapts explicit relationship evidence into those reasons.

This preserves the intended dependency direction:

`runtime core <- eligibility contract <- evaluation relationship adapter`

rather than coupling runtime behavior directly to a specific evaluation store or conflict ontology.

## What this supports

For safety-sensitive or autonomous action workloads, a reasonable policy profile is:

- unresolved contradiction remains visible at recall;
- unresolved contradiction fails closed at influence;
- explicit evidence is required before conflict is considered resolved.

## What this does not support

This experiment does not establish that every Engram deployment should use this profile. Low-risk analytical workloads may intentionally choose surface-only behavior. It also does not establish that `SUPERSEDES` alone proves factual truth; it proves only that explicit relationship evidence can resolve the runtime's unresolved-conflict state under a configured policy.
