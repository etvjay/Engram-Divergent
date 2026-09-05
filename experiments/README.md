# Engram Experiment Registry

Experiment IDs are unique repository-wide. Before creating a new experiment directory, claim the next unused ID here. Do not create a second directory with an existing `EXP-###` prefix.

| ID | Canonical experiment | Primary question |
|---|---|---|
| EXP-001 | `EXP-001-memory-caused-decision` | Can persisted execution memory materially change a later comparable action? |
| EXP-002 | `EXP-002-bad-memory` | Can stale/ineligible memory be retrieved yet prevented from unsafe exposure or influence? |
| EXP-003 | `EXP-003-contradiction-and-harm` | Can contradiction and harmful-effect evidence remain append-only without latest-result-wins semantics? |
| EXP-004 | `EXP-004-competing-eligible-memories` | Can competing explicit memories remain visible while optional eligibility rules fail closed on unresolved contradiction? |
| EXP-005 | `EXP-005-deployment-recovery-memory` | Can failure/recovery memory change a later comparable software-deployment strategy under a real control execution? |
| EXP-006 | `EXP-006-incident-recovery-memory` | Can Engram preserve harmful recovery consequences and change a later comparable incident-recovery sequence? |
| EXP-007 | `EXP-007-coding-regression` | Can prior reverted coding regression change a later comparable coding strategy without overgeneralizing across contexts? |
| EXP-008 | `EXP-008-competing-memory-provenance` | Does a later influence reference the exact retrieval that exposed the memory when multiple recalls compete? |
| EXP-009 | `EXP-009-human-correction-safety` | Can an explicit human correction become durable operational memory and change a later comparable autonomous action before repeated intervention is required? |
| EXP-010 | `EXP-010-costly-success-memory` | Can a successful but materially expensive execution become operational memory and change a later comparable strategy without being mislabeled as failure? |
| EXP-011 | `EXP-011-multi-agent-coordination` | Can a coordinator remember a prior multi-worker race and change later coordination without introducing implicit cross-agent memory sharing? |
| EXP-012 | `EXP-012-repeated-handoff-pattern` | Can multiple successful executions jointly support a repeated-pattern memory whose exact source lineage changes a later comparable handoff? |
| EXP-013 | `EXP-013-memory-invalidation-supersession` | Can historically valid but obsolete or explicitly superseded memory lose current action authority without deleting history? |
| EXP-014 | `EXP-014-context-completeness-authority` | Can version-bound memory fail closed when a future execution omits the environment/tool metadata required to establish compatibility? |
| EXP-015 | `EXP-015-provenance-authenticity` | Can a memory that claims source execution provenance be prevented from exposure or influence when that lineage is missing, foreign-agent, contradictory or no longer resolvable? |
| EXP-016 | `EXP-016-runtime-agent-isolation-authority` | Can the runtime reject foreign-agent memory even when a storage adapter incorrectly returns or later mutates it? |
| EXP-017 | `EXP-017-evidence-state-escalation` | Can derived Operational Memory be prevented from claiming stronger evidence than the execution outcome that admitted it? |
| EXP-018 | `EXP-018-counterfactual-authenticity` | Can run-backed counterfactual evidence be prevented from using missing, fabricated, self-referential, foreign-agent or incomplete comparison executions? |
| EXP-019 | `EXP-019-recall-influence-state-integrity` | Can a later decision be prevented from claiming influence when the authority-relevant state behind a recalled memory ID changed after exposure? |
| EXP-020 | `EXP-020-multi-source-evidence-ceiling` | Can multi-source Operational Memory be prevented from claiming stronger evidence than the weakest execution outcome in its declared supporting source set? |

## Evidence discipline

Every accepted experiment should contain `hypothesis.md`, `setup.md`, `findings.md`, and `decision.md`. Findings and decision must not be written as accepted before the relevant automated or external evidence has actually passed.

Scenario/application logic remains outside Engram runtime semantics. Prefer a concrete memory-free control execution when claiming `CHANGED_ACTION`; use inferred counterfactuals only when a real control, shadow run, or replay is not available and label the weaker evidence explicitly.

Experiment execution may be SIMULATED while memory/runtime/storage evidence is classified independently. Never promote a live-cloud or production-integration claim from deterministic scenario CI alone.

## Next ID

The next unclaimed experiment ID is `EXP-021`.

EXP-020 is the final scheduled foundational experiment. Do not claim EXP-021 merely to extend the sequence; a new foundational experiment should be opened only if CockroachDB live verification or another concrete proof surface exposes a genuinely unresolved invariant.
