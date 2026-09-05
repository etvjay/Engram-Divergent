# EXP-018 — Hypothesis

Date: 2026-08-16

## Question

Can Engram prevent a `CHANGED_ACTION` influence from presenting a fabricated, self-referential, foreign-agent or incomplete execution as `CONTROL_RUN`, `SHADOW_RUN` or `REPLAY` counterfactual evidence?

## Hypothesis

Run-backed counterfactual sources should require a comparison execution that is:
- explicitly identified;
- resolvable in canonical execution state;
- distinct from the influenced execution;
- owned by the same Engram agent under the current ownership model;
- completed rather than still `RUNNING` or `MEMORY_UNAVAILABLE`.

## Expected result

Invalid comparison executions fail closed before decision persistence. A real distinct completed same-agent control execution remains valid.

## Boundary

This experiment authenticates the existence/basic authority of the comparison execution. It does not prove that control and treatment are perfectly equivalent in context, policy, environment, constraints or external side effects; that belongs to controlled shadow/replay evaluation.