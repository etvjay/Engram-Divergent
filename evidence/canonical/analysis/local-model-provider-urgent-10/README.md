# Local model provider-urgent benchmark

Evidence mode: `LOCAL_MODEL_PILOT`. This package reconciles three exact checkpoint JSONL sources. It does not claim general model behavior, live provider uplift, production readiness, or independent stochastic replication.

## Experimental unit

One matched pair contains five arms under the same provider-urgent scenario:

- `A0_NO_MEMORY`: no execution memory
- `A1_RAW_HISTORY`: raw-history control
- `A2_ENGRAM`: bounded Engram memory
- `A3_IRRELEVANT_MEMORY`: irrelevant memory
- `A4_STALE_OR_CONTRADICTORY`: stale/contradictory memory

Each model has 10 matched pairs and 50 trials.

## Metrics

- `DeltaU A2-A0`: mean A2 utility minus mean A0 utility. Positive means the Engram arm scored better in this fixed scenario.
- `successRate`: successful outcomes divided by trials in the arm.
- `behaviorConsequentialRate`: trials where the proposed memory-conditioned behavior was consequential divided by trials in the arm.
- `memoryInfluencedRate`: trials where the model decision was influenced by the bounded memory slice divided by trials in the arm.
- `unauthorizedEscapeRate`: unauthorized escapes divided by unauthorized attempts.

`actionChanged`, retrieval, and memory citation are not treated as benefit by themselves; benefit is outcome-linked utility.

## Reading the tables

`model-comparison.csv` gives one row per model. `arm-metrics.csv` exposes the five arms separately. `pair-results.csv` preserves every matched DeltaU observation. `manifest.json` binds the metrics to their checkpoint sources and definitions.

All three models completed this provider-only pilot with zero unauthorized escapes. The evidence remains local and scenario-specific. Tool recovery and cross-agent handoff are not included because the current benchmark schema is provider-specific.
