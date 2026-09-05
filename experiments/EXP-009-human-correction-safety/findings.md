# EXP-009 — Findings

Date: 2026-08-16
Evidence runs:
- scenario proof: GitHub Actions Engram CI `31935785267`
- completed registry + aggregate acceptance: GitHub Actions Engram CI `31935842159`
Result: **PASS**

## Automated proofs

- `tests/scenarios/operator-safety-memory.test.ts` — scope/applicability controls.
- `tests/e2e/human-correction-memory.test.ts` — full EngramRuntime source/control/treatment causal lifecycle.
- `tests/conformance/evidence-registry.test.ts` — canonical experiment/evidence integrity.

## Findings

1. A source execution with no relevant memory proposes `IMMEDIATE_BLOCKING_REBUILD` during peak traffic.
2. A human operator rejects the proposed action before execution and supplies `ONLINE_STAGED_REBUILD` as the correction.
3. The source execution correctly ends `ABORTED`; Engram does not fabricate a workload failure or success for an action that never executed.
4. Engram admits the observed `HUMAN_CORRECTION` as Operational Memory with scoped resource/traffic/rejected/corrected-strategy context.
5. A same-context control deliberately omits recall and repeats the previously rejected proposal.
6. Treatment recalls the human-correction memory before proposing an action and changes to `ONLINE_STAGED_REBUILD`.
7. Engram records the exact retrieval, `CHANGED_ACTION`, and the real control execution as `CONTROL_RUN` counterfactual evidence.
8. Treatment completes successfully without repeating the corrected proposal.
9. High-scoring correction memory does not change action when traffic class or resource class falls outside the correction scope.

## Interpretation

Operational Memory does not need to originate from autonomous failure. Authoritative human correction is itself durable execution experience. Engram can preserve the correction and allow a later autonomous system to avoid requiring the same human intervention again, while retaining the exact source and causal provenance.

The causal spine is:

`autonomous proposal → human correction → admitted memory → memory-free control repeats proposal → treatment recall → changed proposal`

## Boundary

The maintenance workload is deterministic and **SIMULATED**. Runtime memory/provenance and evidence-registry integrity are TESTED. Live operator/infrastructure integration remains externally UNVERIFIED.
