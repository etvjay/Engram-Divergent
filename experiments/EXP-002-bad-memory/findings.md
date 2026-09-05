# EXP-002 Findings

## Result

SUPPORTED within the deterministic runtime boundary.

The automated adversarial suite demonstrates two independent gates beyond semantic retrieval score.

### Case A — stale high-score memory

A memory with a high candidate score is rejected before exposure when it is expired and incompatible with the current environment/tool versions.

Observed runtime behavior in `tests/runtime/bad-memory.test.ts`:

- candidate score remains high;
- exposed candidate set is empty;
- rejection contains `MEMORY_EXPIRED`;
- rejection contains `INVALIDATED_ENVIRONMENT_CHANGE`;
- rejection contains `INVALIDATED_TOOL_MAJOR_VERSION_CHANGE`;
- runtime records `RECALL_FILTERED`.

This supports the claim that retrieval relevance does not override validity/invalidation policy.

### Case B — recalled low-confidence memory

A current memory may pass recall eligibility and be exposed, but influence is independently rejected when confidence is below the active influence threshold.

Observed runtime behavior:

- memory is recalled and exposed;
- application attempts `SUPPORTED_ACTION` influence;
- runtime rejects with `CONFIDENCE_BELOW_THRESHOLD`;
- no decision is persisted by the adversarial store;
- runtime records `INFLUENCE_REJECTED`.

This supports the claim that exposure does not grant authority to influence a decision.

## Falsification check

None of the experiment's falsification conditions occurred in the automated cases:

- stale memory was not exposed;
- low-confidence memory was not accepted as influence;
- rejected influence was not persisted as a decision-memory relation;
- rejection produced an evaluation trace;
- historical memory remained present rather than being destructively overwritten.

## What this supports

Within the tested runtime policy:

`candidate retrieval != exposure != influence`

Each transition is independently gated, and a high semantic score cannot bypass expiry/version/confidence constraints.

## What this does not support

This experiment does not prove:

- that the default thresholds are optimal for every workload;
- that Engram can automatically identify every harmful or misleading memory;
- that semantic contradiction can be inferred from vector similarity;
- that version changes always imply semantic invalidation;
- that these cases have been exercised against a live CockroachDB deployment.

Those are separate policy/evaluation questions and require workload-specific evidence.
