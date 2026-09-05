# Memory Evaluation Model — Frontend Usage

**Consumption mode:** `API_ONLY`

## What exists

`packages/evaluation` defines Engram's evidence-safe evaluation layer, including:

- explicit memory evaluations;
- counterfactual experiment records;
- memory relationships such as `CONTRADICTS`, `QUALIFIES`, and `SUPERSEDES`;
- usefulness metrics;
- quality diagnostics;
- staleness analysis;
- optional contradiction-aware eligibility advice.

## Frontend use cases

Consume evaluation data through the Engram HTTP API to render:

- whether a memory has controlled or observational evidence;
- beneficial/harmful/neutral/unknown explicit assessments;
- relationship graphs;
- quality warnings;
- staleness reasons;
- counterfactual experiment evidence.

## Example

```ts
const evaluations = await fetch(`${baseUrl}/v1/evaluations/memories/${memoryId}`, {
  headers: { authorization: `Bearer ${sessionToken}` },
}).then((response) => response.json());

for (const evaluation of evaluations.items ?? evaluations) {
  renderEvaluation({
    method: evaluation.method,
    effect: evaluation.effect,
    evidenceState: evaluation.evidenceState,
  });
}
```

Render the evidence method/state alongside the effect so observational evidence is not presented as controlled proof.

## Important invariants

- later success does **not** automatically make a memory beneficial;
- retrieval does not imply usefulness;
- exposure does not imply influence;
- contradiction is explicitly assessed and is not inferred solely from vector similarity;
- `UNKNOWN` is a valid evaluation state;
- do not invent a single synthetic "memory quality score" in the UI unless a separately governed product decision introduces one.

## Access

Use evaluation/control-plane endpoints documented in `openapi.json`. The Cockroach-backed evaluation store is server-side.

## Implementation/tests

- `packages/evaluation/src/domain.ts`
- `packages/evaluation/src/quality.ts`
- `packages/evaluation/src/staleness.ts`
- `packages/evaluation/src/relationships.ts`
- `packages/evaluation/src/eligibility-advisor.ts`
- `packages/cockroach/src/evaluation-store.ts`
- `tests/evaluation/`

**Evidence status:** TESTED for evaluation semantics and API contract behavior; public deployment remains UNVERIFIED.