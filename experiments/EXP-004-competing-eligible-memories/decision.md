# EXP-004 Decision

## Decision

ACCEPT **fail closed at influence, remain visible at recall** as the recommended Engram policy profile for unresolved explicit memory contradiction in autonomous/safety-sensitive workloads.

This is **not** a protocol default. It remains an opt-in `MemoryEligibilityAdvisor` composition.

## Accepted architecture

1. Runtime core owns the timing of eligibility checks.
2. Runtime core does not understand contradiction, harm, supersession, or evaluation-store schemas.
3. External advisors may add rejection reasons at `RECALL` and/or `INFLUENCE` stages.
4. The relationship advisor consumes only explicit assessed relationships.
5. Unresolved contradiction may be configured to block influence without hiding memories from recall.
6. Superseded-memory blocking is an independent policy switch.

## Recommended profile

For autonomous execution:

```text
unresolvedContradictionStages = [INFLUENCE]
```

Optional stricter deployments may also configure:

```text
supersededMemoryStages = [INFLUENCE]
```

but EXP-004 does not require that second rule.

## Why not block recall?

Hiding contradictory memories would remove information precisely when the agent/operator needs to understand uncertainty. Engram's role is to preserve execution experience and constrain unjustified action authority, not erase inconvenient evidence.

## Why not make this universal?

Some analytical or human-supervised applications may want to inspect and explicitly choose among unresolved memories. The protocol should expose the evidence boundary; workload policy determines whether unresolved conflict blocks action.

## Product rule

**Conflict stays visible. Unresolved conflict does not earn action authority by default in safety-sensitive policy profiles.**
