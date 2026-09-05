# EXP-018 — Findings

Date: 2026-08-16
Evidence run: GitHub Actions Engram CI `31945075487`
Result: **PASS**

## Findings

1. A `CONTROL_RUN` counterfactual without `comparisonExecutionId` was rejected.
2. An arbitrary/nonexistent comparison UUID was rejected.
3. The influenced execution could not cite itself as its own counterfactual control.
4. A completed comparison owned by another agent was rejected.
5. A same-agent comparison that was still running was rejected.
6. A real, distinct, completed same-agent control execution was accepted and the changed-action decision was persisted.
7. Invalid counterfactuals produced no decision persistence.

## Interpretation

A run-backed counterfactual now has to identify a real comparison execution with basic authority and lifecycle integrity. A syntactically valid UUID or a `CONTROL_RUN` label is no longer sufficient causal evidence.

This strengthens the earlier experiment discipline around real control runs and moves it into the runtime itself.

## Boundary

EXP-018 does not yet prove comparability of every controlled variable. Two executions can both be real while still differing materially in context. Controlled-variable equivalence, shadow isolation and replay reproducibility remain roadmap #26 work.