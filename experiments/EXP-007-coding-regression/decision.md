# EXP-007 — Decision

Date: 2026-08-16
Status: **ACCEPTED**
Evidence:
- workload/negative-control CI `31935273665`
- full runtime E2E CI `31935526015`

## Decision

Autonomous coding is accepted as a canonical Engram execution-memory acceptance scenario.

It validates that prior execution experience can change an application's **work methodology**, not only a route or provider selection:

`regression + revert → operational memory → comparable recall → changed coding methodology → observed outcome difference`

## Required causal form

The canonical proof uses the full runtime lifecycle:

1. source execution has no relevant memory and fails under `PATCH_FIRST`;
2. Engram observes the regression/revert and admits Operational Memory;
3. a same-context control omits recall and reproduces the failure;
4. treatment recalls the source memory;
5. the coding application changes to `REGRESSION_TEST_THEN_PATCH`;
6. Engram records exact retrieval provenance, `CHANGED_ACTION`, and the real control execution as counterfactual evidence;
7. treatment outcome is observed as successful.

## Applicability rule

High retrieval score is insufficient when subsystem or behavior class differs. Operational applicability must remain separate from semantic similarity.

## Architectural consequence

Coding-specific strategy remains application/scenario logic. Engram records execution evidence, admits/retrieves memory, governs influence eligibility, and preserves provenance; it does not prescribe test-first development.

## Boundary

The coding workload is **SIMULATED**. Live repository-writing coding-agent integration remains externally unverified.
