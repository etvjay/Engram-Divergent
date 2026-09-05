# EXP-003 — Contradiction and Harm

## Hypothesis

Engram should preserve conflicting execution memories and harmful effect evidence without rewriting history. Contradiction is an explicit relationship between distinct memories; harmful usefulness evidence is an evaluation result, not an instruction to delete the memory.

## Attack cases

### A. Contradictory memories

An older Operational Memory warns against a condition. A later independently supported memory records a conflicting operational lesson.

Expected behavior:

- both memory identities remain addressable;
- an explicit `CONTRADICTS` relationship connects them;
- the relationship has its own rationale, evidence state, method, and assessment time;
- neither memory is silently overwritten by the other.

### B. Controlled harmful effect

A memory influences a treatment decision and the treatment outcome is worse than a comparable memory-free control.

Expected behavior:

- a `MemoryEvaluation` records `effect: HARMFUL`;
- the evaluation records the control/treatment evidence method;
- usefulness assessment becomes `NEGATIVE_EVIDENCE`;
- `HARMFUL_EFFECT_RECORDED` remains visible as a warning;
- the memory remains historical evidence rather than being silently deleted.

### C. Mixed historical evidence

The same memory has one controlled harmful evaluation and one controlled beneficial evaluation.

Expected behavior: assessment is `MIXED_EVIDENCE`, not whichever result happened most recently.

## Falsification conditions

The hypothesis fails if Engram:

- replaces one contradictory memory with another;
- infers contradiction only from semantic/vector similarity;
- converts a harmful effect directly into deletion;
- lets a later positive evaluation erase prior harmful evidence;
- labels mixed controlled results as unambiguously beneficial or harmful.

## Principle under test

Operational memory is evidence-bearing history plus current policy/evaluation, not a mutable bag of latest conclusions.
