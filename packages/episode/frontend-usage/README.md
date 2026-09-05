# Execution Episode — Frontend Usage

**Consumption mode:** `BROWSER_SAFE`

## What exists

`packages/episode/src/schema.ts` exposes `ExecutionEpisodeSchema`, `parseExecutionEpisode`, and the portable `engram.execution-episode/v1` object model.

An Execution Episode is the durable structured representation of one execution: agent, workflow, intent, context, constraints, environment, decisions, observations, outcome, and provenance.

## Frontend use cases

Use it for run detail pages, trace timelines, import/export tooling, comparison views, and any UI that needs a stable execution object instead of raw storage rows.

```ts
import { parseExecutionEpisode } from "<engram-episode-path>";

const episode = parseExecutionEpisode(apiPayload);
console.log(episode.decisions, episode.observations, episode.outcome);
```

## Important invariants

- schema version is `engram.execution-episode/v1`;
- decisions and observations are evidence-bearing structures, not UI-generated summaries;
- memory influences remain explicit inside decisions;
- frontend code should not fabricate missing provenance/outcomes;
- `UNKNOWN` and absent outcome information must remain representable.

## Implementation/tests

- `packages/episode/src/schema.ts`
- adapter tests under `tests/adapters/`
- protocol conformance tests.

**Evidence status:** TESTED.