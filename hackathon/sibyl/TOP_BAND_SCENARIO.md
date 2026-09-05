# Top-Band Scenario — Experiential Provider Continuity

## Thesis
An autonomous requester should not merely remember that a provider was good or bad. It should preserve bounded evidence from its own prior interactions, derive a relationship posture only when provenance is sufficient, and let that posture change future delegation or authority contextually.

This is not a global reputation score.

```text
reputation
  = a claim about a provider

experiential continuity
  = prior requester-owned executions
    -> evidence
    -> bounded relationship memory
    -> context-specific future policy
    -> changed provider / terms / authority
```

## Flagship story
Provider `atlas` is the cheapest eligible data-fetch provider. Provider `beacon` is slightly more expensive.

### Historical execution 1
- requester selects Atlas for an urgent data fetch;
- Atlas returns useful work but breaches the latency SLA;
- requester records observed execution evidence;
- no relationship conclusion is admitted yet.

### Historical execution 2
- a later comparable urgent task again uses Atlas;
- Atlas again breaches the SLA;
- second independent execution is observed.

### Relationship-state admission
A third admitting execution evaluates the repeated pattern. Engram admits one `REPEATED_PATTERN` memory only with multi-source provenance linking both prior breach executions plus the admitting execution.

Derived bounded state:

```text
providerId: atlas
memoryPrimitive: EXPERIENTIAL_RELATIONSHIP
relationshipPosture: CONTEXT_GUARDED
taskType: data_fetch
failureType: SLA_BREACH
breachCount: 2
```

The memory does **not** say "Atlas is bad." It says that this requester has enough observed history to guard a particular class of future interaction.

## Fresh-session consequence A — urgent task
Without memory:

```text
cheapest eligible provider -> Atlas
standard terms
```

With recalled relationship memory:

```text
Atlas is excluded for this urgent task
next eligible provider -> Beacon
```

Required proof:
- same offers;
- same task constraints;
- only memory condition changes;
- control selects Atlas;
- treatment selects Beacon;
- decision records `CHANGED_ACTION` and counterfactual Atlas selection.

## Fresh-session consequence B — routine task
The same memory must not become a permanent blacklist.

Without memory:

```text
Atlas
50% prepay
no milestone verification
```

With relationship memory:

```text
Atlas remains selected
10% prepay
milestone verification required
```

This demonstrates contextual authority narrowing rather than blanket exclusion.

## Why multiple executions matter
One bad interaction must not establish relationship state.

The scenario therefore requires:
- at least two independent source execution IDs;
- same requester/agent authority;
- compatible workflow/task class;
- observed evidence;
- repeated pattern admission;
- reconstructable source lineage.

## Negative controls
The build should fail or remain baseline when:
1. only one breach exists;
2. memory belongs to another requester;
3. memory concerns another task type;
4. memory is expired;
5. memory changes after recall;
6. source lineage is missing or contradictory;
7. Sibyl is unavailable;
8. no applicable provider alternative exists — in this case terms may narrow, but the system must not invent a provider.

## Sibyl deletion test
Sibyl is the only persistence/recall substrate in the evaluated profile. Delete or disable Sibyl and the fresh process cannot reconstruct the relationship memory; provider selection therefore reverts to the memory-free baseline.

## Product meaning
The agent is not learning a universal truth about Atlas. It is maintaining a bounded private history of what Atlas has meant **to this agent under specific conditions**, and carrying that experience into future economic behavior.

That is the intended Experiential Continuity primitive:

```text
Event
-> Evidence
-> Memory
-> Experience
-> Legitimate State Delta
-> Relationship Posture
-> Decision
-> Action
-> New Event
```

## Partner attachment point
Only after this core is green:
- Virtuals ACP can provide the real agent/provider job relationship;
- Base can provide the economically consequential payment/escrow/prepayment action.

Partner integrations should exercise the remembered relationship decision. They must not replace or decorate it.
