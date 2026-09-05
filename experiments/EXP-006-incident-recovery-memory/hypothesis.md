# EXP-006 — Incident Recovery Memory

## Hypothesis

Engram can preserve not only whether an incident mitigation restored a primary service, but also the downstream consequence and recovery quality of that mitigation. Under a later comparable incident, recalling that execution experience can change the application's mitigation sequence and avoid repeating the secondary failure.

Acceptance requires:

1. source incident begins without relevant memory;
2. baseline `RESTART_ALL` restores the fleet but causes `THUNDERING_HERD`, prolonged customer impact, and a `PARTIAL` outcome;
3. Engram admits memory containing the secondary consequence, not merely the primary recovery;
4. a same-context control with recall excluded repeats `RESTART_ALL` and the degraded recovery;
5. treatment recall exposes the source memory;
6. the application changes to `ISOLATE_DRAIN_STAGED_RESTART`;
7. Engram records `CHANGED_ACTION` through the exact recall and references the concrete control execution as `CONTROL_RUN` evidence;
8. treatment reaches `SUCCESS` with contained customer impact and shorter time to recovery.

## Non-claims

Engram does not choose incident mitigations or infer that restart-all is globally unsafe. Incident execution is deterministic experiment logic, not a live production incident-management integration.
