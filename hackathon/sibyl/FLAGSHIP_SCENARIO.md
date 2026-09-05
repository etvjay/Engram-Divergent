# Flagship Scenario — Experiential Provider Continuity

Status: `PRE_WINDOW_IMPLEMENTATION / AWAITING_CI`

## Thesis
An autonomous agent should not treat every provider interaction as if it were the first one, nor should one bad interaction become a permanent global blacklist.

Engram turns repeated, attributable execution experience into a bounded **relationship posture** that can change future provider selection and contract authority in the matching context.

This is not a generic reputation score.

```text
provider interaction
  -> execution evidence
  -> repeated attributable pattern
  -> Engram admission
  -> Sibyl persistent relationship memory
  -> fresh-session recall
  -> context-specific provider/terms decision
  -> changed economic/coordination behavior
```

## Actors
- `requester-agent` — owns the relationship memory and future decision.
- `atlas` — cheapest provider; has two observed urgent `data_fetch` SLA breaches in requester-owned executions.
- `beacon` — slightly more expensive provider; next eligible option for urgent work.

## Historical experience
Two independent urgent data-fetch executions with Atlas breach the latency SLA.

A third execution explicitly evaluates those observations and admits a multi-source `REPEATED_PATTERN` memory with provenance to all three executions.

The memory carries:
- provider: `atlas`;
- task type: `data_fetch`;
- failure class: `SLA_BREACH`;
- breach count: 2;
- relationship posture: `CONTEXT_GUARDED`;
- source execution IDs;
- evidence state and confidence.

## Fresh-session consequences

### Urgent task
Without memory:
- Atlas is cheapest eligible provider;
- requester selects Atlas;
- deterministic fixture breaches SLA.

With recalled relationship memory:
- Atlas becomes ineligible for this urgent task;
- requester selects Beacon;
- decision records `CHANGED_ACTION` with Atlas as counterfactual.

### Routine task
The same memory does **not** blacklist Atlas globally.

Atlas remains selectable because price still matters, but Engram changes authority terms:
- prepayment falls from 50% to 10%;
- milestone verification becomes required.

This demonstrates that memory changes the **shape of the relationship**, not merely a ranking.

## Why this is stronger than reputation
A reputation system asks: `How good is Atlas?`

This scenario asks:

> `Given what this agent itself has experienced with Atlas, for this task class and consequence level, what authority should Atlas receive now?`

The answer is contextual and provenance-bound.

## Non-negotiable controls
1. One failure alone must not create relationship posture.
2. Experience from another task type must not transfer solely because retrieval score is high.
3. Expired memory must not be exposed.
4. Memory changed after recall must fail influence via state-digest mismatch.
5. Removing Sibyl must remove the cross-session relationship state; no fallback may preserve equivalent behavior.

## Partner path, not yet implemented
If later justified:
- Virtuals ACP can instantiate Atlas/Beacon as actual agent-service providers and produce the provider-job events.
- Base can make the changed terms economically consequential, e.g. different staged payment/prepayment behavior.

Neither partner is required for the core proof and neither should be added decoratively.

## Submission evidence requirement
All current implementation before Sep 1, 2026 is prior work. The final submission must regenerate:
- historical interactions;
- relationship-memory admission;
- fresh-session recall;
- provider/terms behavioral delta;
- deletion mutation;
inside the official build window and preserve the exact commit/run/video evidence.
