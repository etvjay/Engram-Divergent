# Engram analysis bundle

This directory contains the reproducible analysis environment for the canonical Engram evidence.

## Source of truth

```text
evidence/canonical/longitudinal/latest/summary.json
evidence/canonical/benchmarks/provider-urgent/*/trials.jsonl
evidence/canonical/benchmarks/provider-urgent/*/pairs.jsonl
evidence/canonical/benchmarks/provider-urgent/*/aggregate.json
```

The application benchmark remains authoritative. This bundle is a derived analysis/rendering layer and must not change the source observations or metric definitions.

## Reproduce

```bash
python3 -m venv /tmp/engram-analysis-venv
/tmp/engram-analysis-venv/bin/pip install -r analysis/requirements.txt
/tmp/engram-analysis-venv/bin/python analysis/analyze_engram.py
```

## Outputs

- `arm-metrics.csv`: pandas-derived lifecycle-arm table;
- `paired-a5-vs-a2.csv`: per-seed paired comparison;
- `provider-benchmark-metrics.csv`: retained provider benchmark comparison;
- `utility-by-arm.png`: matplotlib/seaborn static figure;
- `provider-delta-u.png`: provider comparison figure;
- `engram-analysis.html`: Plotly interactive exploration;
- `utility-by-arm.vega-lite.json`: declarative spec for future Web/MCP surfaces;
- `dashboard-import.csv`: Tableau/Power BI import-ready extract;
- `manifest.json`: source hash, tested SHA, renderer list, metrics, and runtime versions.

## Evidence boundary

The current longitudinal data is deterministic local evidence. SciPy bootstrap output is therefore a resampling summary, not an independent stochastic confidence claim. Tableau and Power BI are marked import-ready because no connector or external dashboard readback is configured in this environment.
