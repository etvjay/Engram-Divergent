# Local agent behavioral-memory test

Engram Divergent is model-agnostic. A local model such as Qwen 2.5 should propose actions; Engram owns execution-memory lineage, applicability, disclosure, and influence authority.

## Boundary

```text
local model
   |
   | AgentDecisionProposal
   v
Engram authorization
   |
   | validated action
   v
executor
   |
   | events + outcome
   v
Episode -> ExecutionSlice -> Experience -> ExecutionMemory -> Sibyl
```

The model does not need direct access to Sibyl. Give it only the `MemorySlice` selected for its current execution.

## Proposal shape

Use `packages/runtime/src/agent-decision.ts`.

```json
{
  "executionId": "<uuid>",
  "actor": {
    "runtime": "local-aws-agent",
    "model": "qwen2.5",
    "instanceId": "worker-1"
  },
  "decisionType": "PROVIDER_SELECTION",
  "proposedAction": {
    "providerId": "provider-b"
  },
  "reasoningSummary": "Prior comparable execution evidence makes provider-b preferable for this urgent task.",
  "memorySliceIds": ["<memory-slice-uuid>"],
  "requestedEffects": ["provider_selection"],
  "proposedAt": "2026-09-05T08:31:00Z"
}
```

Then validate the proposal with `assertAgentProposalAuthorizedByGrant(...)` before execution.

A model may request `provider_selection` when the influence grant allows it. If the same proposal attempts `increase_budget` and that effect is denied, Engram rejects the memory-derived authority even if the model argues for it.

## Behavioral comparison

Run two otherwise equivalent executions:

### Control

- same model
- same task
- same tools
- same constraints
- no eligible memory slice

Capture the proposed action and outcome.

### Treatment

- fresh model/runtime process if possible
- same model
- same task
- same tools
- same constraints
- Sibyl-backed memory slice + influence grant

Capture the proposed action and outcome.

The useful comparison is not whether the model mentions the memory. It is whether memory causes a bounded behavioral delta:

```text
control action != treatment action
                 or
control terms  != treatment terms
                 or
control policy != treatment policy
```

and whether the resulting outcome is beneficial, harmful, neutral, or still unknown.

## What to retain

For every run, retain:

- model/runtime identity
- task and constraints
- episode ID
- execution-slice IDs
- experience IDs
- execution-memory IDs
- memory-slice IDs
- influence-grant ID
- proposed action
- authorized action
- outcome
- behavioral memory evaluation

This makes Qwen, another local model, or a deterministic policy interchangeable at the reasoning layer while Engram remains responsible for execution-memory semantics.
