# EXP-020 — Setup

## Controlled setup

Use the real `EngramRuntime` with an in-memory conformance store that persists execution outcomes by execution ID. The store must expose the same outcome evidence lookup required by production runtime storage; CockroachDB receives a corresponding implementation backed by the `outcomes` table.

The experiment uses one agent and comparable workflow context so agent isolation and context compatibility do not confound the evidence-ceiling result.

## Primary adversarial case

1. Complete source execution A with outcome evidence `OBSERVED` and no admitted memory.
2. Start source/admitting execution B under the same agent.
3. Complete B with outcome evidence `VERIFIED`.
4. During B completion, submit a `VERIFIED` multi-source admission signal declaring `[A, B]` as `sourceExecutionIds`.
5. Assert that no memory is admitted and that the rejection identifies A as a supporting source whose evidence ceiling is weaker than the requested memory evidence.

This reproduces the authority-escalation path that EXP-017 alone cannot prevent.

## Positive controls

- A=`OBSERVED`, B=`VERIFIED`, requested memory=`OBSERVED` → admissible when all other rules pass.
- A=`VERIFIED`, B=`VERIFIED`, requested memory=`VERIFIED` → admissible.

## Fail-closed control

Declare an additional same-agent execution that has no persisted completed outcome. The runtime must reject the multi-source admission rather than treating missing evidence as strong enough.

## Regression controls

Retain and run the existing multi-source tests for:

- source-set deduplication;
- admitting execution membership;
- same-agent source ownership.

Run the full Engram CI suite after the focused test passes. Findings and architectural acceptance are written only after the branch evidence is green.
