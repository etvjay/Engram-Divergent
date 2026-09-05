# EXP-004 Setup

## Architecture under test

The runtime receives an optional `MemoryEligibilityAdvisor` contract. Runtime core knows only that an advisor may return additional eligibility reasons at a named stage; it does not know what contradiction, supersession, or harmful evaluation means.

An evaluation-layer adapter may use persisted `MemoryRelationship` records to implement a specific policy.

## Test memories

- Memory A and Memory B belong to the same agent and are otherwise eligible under the same workflow/environment/tool/confidence policy.
- both are returned by recall candidate generation;
- evaluation state explicitly records `A CONTRADICTS B`;
- no supersession relationship initially exists.

## Control policy

No eligibility advisor is configured.

Expected:

1. A and B can be recalled/exposed if normal runtime policy accepts them.
2. A valid application influence referencing an exposed memory can be accepted.
3. The evaluation/control plane still reports the unresolved contradiction separately.

## Treatment policy

Configure the relationship advisor to block `UNRESOLVED_MEMORY_CONTRADICTION` at `INFLUENCE`, not `RECALL`.

Expected:

1. A and B remain recall-visible.
2. influence using A or B is rejected;
3. runtime writes `INFLUENCE_REJECTED`;
4. no decision-memory edge is persisted;
5. the rejection survives cold runtime reconstruction because the advisor queries persisted relationship state at decision time.

## Resolution case

Add explicit `B SUPERSEDES A` evidence.

Expected relationship assessment:

- A is `supersededBy B`;
- A/B is no longer an unresolved contradiction.

Whether A should also be blocked because it is superseded is deliberately a separate advisor configuration, not an implicit consequence of resolving contradiction.

## Automated proof target

`tests/runtime/competing-memories.test.ts`
