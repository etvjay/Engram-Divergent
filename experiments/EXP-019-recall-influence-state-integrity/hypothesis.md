# EXP-019 — Recall-to-Influence Memory State Integrity

## Hypothesis

A decision must not be allowed to claim influence from a recalled Operational Memory when the authority-relevant state behind that memory ID has changed since exposure.

The current memory ID and retrieval ID are insufficient to prove state continuity. The retrieval edge must bind the exact exposed memory state so the runtime can establish:

`memory recalled at state X -> influence may only be claimed from state X`

rather than:

`memory ID recalled -> any later state behind that ID may influence`.

## Required invariant

For every accepted influence with an associated recall, the persisted recall must contain a versioned digest of the authority-relevant Operational Memory state. At influence time the runtime recomputes that digest from the current memory and requires equality.

If the persisted recall has no state binding, or if the current state no longer matches, influence fails closed and no decision is persisted.

## Authority-relevant fields

The binding covers the memory identity and all current fields that can materially change meaning or action authority:

- `id`
- `agentId`
- `memoryType`
- `summary`
- `structuredContext`
- `confidence`
- `evidenceState`
- `validFrom`
- `validUntil`
- `environmentVersion`
- `toolVersion`
- `policyVersion`

## Non-goals

This experiment does not claim that every external fact referenced by a memory is immutable, nor does it replace lifecycle, provenance, ownership, evidence-state, or counterfactual checks. It binds the Operational Memory state actually exposed by recall and composes with those existing authority checks.
