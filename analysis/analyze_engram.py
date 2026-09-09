#!/usr/bin/env python3
"""Generate reproducible multi-renderer analysis from canonical Engram evidence."""
from __future__ import annotations
import hashlib, json, platform
from pathlib import Path
import numpy as np
import pandas as pd
from scipy import stats
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "evidence/canonical/longitudinal/latest/summary.json"
OUT = ROOT / "evidence/canonical/analysis/latest"
OUT.mkdir(parents=True, exist_ok=True)

raw = json.loads(INPUT.read_text())
obs = pd.DataFrame(raw["observations"])
summary = raw["summary"]
arm_order = ["A0_NO_MEMORY", "A1_RAW_HISTORY", "A2_INITIAL_ENGRAM_MEMORY", "A3_IRRELEVANT_MEMORY", "A4_STALE_OR_CONTRADICTORY", "A5_EVALUATED_UPDATED_MEMORY"]
obs["arm"] = pd.Categorical(obs["arm"], categories=arm_order, ordered=True)
obs["domain"] = obs["runId"].str.split("-").str[0]

arm = (obs.groupby("arm", observed=False).agg(
    observations=("executionId", "count"),
    mean_utility=("utility", "mean"),
    std_utility=("utility", "std"),
    success_rate=("outcome", lambda x: (x == "SUCCESS").mean()),
    harmful_rate=("utility", lambda x: (x < 0).mean()),
    influenced_rate=("influenced", "mean"),
    unauthorized_attempts=("unauthorizedAttempts", "sum"),
    unauthorized_escapes=("unauthorizedEscapes", "sum"),
).reset_index())
arm["std_utility"] = arm["std_utility"].fillna(0.0)
arm["mean_utility"] = arm["mean_utility"].round(6)
arm.to_csv(OUT / "arm-metrics.csv", index=False)

# Per-seed paired A2/A5 analysis. This is a descriptive paired result over deterministic runs.
paired = obs[obs["arm"].isin(["A2_INITIAL_ENGRAM_MEMORY", "A5_EVALUATED_UPDATED_MEMORY"])].groupby(["seed", "arm"], observed=False)["utility"].mean().unstack()
paired["delta_a5_minus_a2"] = paired["A5_EVALUATED_UPDATED_MEMORY"] - paired["A2_INITIAL_ENGRAM_MEMORY"]
paired.reset_index().to_csv(OUT / "paired-a5-vs-a2.csv", index=False)
ci = stats.bootstrap((paired["delta_a5_minus_a2"].to_numpy(),), np.mean, confidence_level=0.95, n_resamples=10000, random_state=20260909, method="percentile")

provider_rows = []
for path in sorted((ROOT / "evidence/canonical/benchmarks/provider-urgent").glob("*/aggregate.json")):
    item = json.loads(path.read_text())
    provider_rows.append({
        "track": item["model"], "pairs": item["nPairs"], "mean_delta_u": item["meanDeltaU"],
        "beneficial_rate": item["beneficialPairRate"], "harmful_rate": item["harmfulPairCount"] / item["nPairs"],
        "unauthorized_attempts": item["unauthorizedInfluenceAttempts"], "unauthorized_escapes": item["unauthorizedInfluenceEscapes"],
    })
provider = pd.DataFrame(provider_rows)
provider.to_csv(OUT / "provider-benchmark-metrics.csv", index=False)

# Static figure 1: lifecycle arms.
sns.set_theme(style="whitegrid", context="talk")
fig, ax = plt.subplots(figsize=(14, 7))
sns.barplot(data=arm, x="arm", y="mean_utility", order=arm_order, palette=["#ef7d7d", "#9aa6b2", "#65d39a", "#65d39a", "#efb366", "#65d39a"], hue="arm", legend=False, ax=ax)
ax.axhline(0, color="#20252b", linewidth=1)
ax.set_xlabel("")
ax.set_ylabel("Mean utility")
ax.set_title("Engram closed-loop utility by lifecycle arm")
ax.tick_params(axis="x", rotation=28)
fig.tight_layout()
fig.savefig(OUT / "utility-by-arm.png", dpi=180)
plt.close(fig)

# Static figure 2: old provider benchmark comparison.
fig, ax = plt.subplots(figsize=(10, 6))
sns.barplot(data=provider, x="track", y="mean_delta_u", palette=["#6baed6", "#fd8d3c"], hue="track", legend=False, ax=ax)
ax.axhline(0, color="#20252b", linewidth=1)
ax.set_xlabel("")
ax.set_ylabel("Mean DeltaU (A2 - A0)")
ax.set_title("Provider benchmark: deterministic sanity track vs Qwen")
fig.tight_layout()
fig.savefig(OUT / "provider-delta-u.png", dpi=180)
plt.close(fig)

# Interactive Plotly view.
plot = px.bar(arm, x="arm", y="mean_utility", color="arm", hover_data=["observations", "success_rate", "harmful_rate", "unauthorized_escapes"], title="Engram lifecycle evaluation", category_orders={"arm": arm_order})
plot.write_html(OUT / "engram-analysis.html", include_plotlyjs="cdn")

# Vega-Lite spec for the future web surface.
vega = {
    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
    "description": "Engram utility by lifecycle arm from canonical evidence.",
    "data": {"url": "../../analysis/latest/arm-metrics.csv"},
    "mark": {"type": "bar", "cornerRadiusTopLeft": 5, "cornerRadiusTopRight": 5},
    "encoding": {
        "x": {"field": "arm", "type": "nominal", "sort": arm_order, "axis": {"labelAngle": -30}},
        "y": {"field": "mean_utility", "type": "quantitative", "title": "Mean utility"},
        "color": {"field": "arm", "type": "nominal", "legend": None},
        "tooltip": [
            {"field": "arm", "type": "nominal"},
            {"field": "observations", "type": "quantitative"},
            {"field": "mean_utility", "type": "quantitative"},
            {"field": "success_rate", "type": "quantitative"},
            {"field": "harmful_rate", "type": "quantitative"},
        ],
    },
}
(OUT / "utility-by-arm.vega-lite.json").write_text(json.dumps(vega, indent=2) + "\n")

# BI-friendly flat extract.
bi = arm.assign(dataset="closed-loop", evidence_state="LOCAL_PASS", tested_source_sha="b25d1686f7011d27391625eda00785d9f4cf7a1b")
bi.to_csv(OUT / "dashboard-import.csv", index=False)

manifest = {
    "schema": "engram.analysis-render-bundle/v1",
    "source": str(INPUT.relative_to(ROOT)),
    "source_sha256": hashlib.sha256(INPUT.read_bytes()).hexdigest(),
    "tested_source_sha": "b25d1686f7011d27391625eda00785d9f4cf7a1b",
    "observations": len(obs),
    "seeds": sorted(obs["seed"].unique().tolist()),
    "renderers": ["pandas", "scipy", "matplotlib", "seaborn", "plotly", "vega-lite"],
    "external_bi": {"tableau": "IMPORT_READY_NO_CONNECTOR", "powerbi": "IMPORT_READY_NO_CONNECTOR"},
    "metrics": {"deltaUA2A0": summary["deltaUA2A0"], "deltaUA5A2": summary["deltaUA5A2"], "a5a2_bootstrap_95": [float(ci.confidence_interval.low), float(ci.confidence_interval.high)]},
    "artifacts": sorted(p.name for p in OUT.iterdir() if p.name != "manifest.json"),
    "runtime": {"python": platform.python_version(), "pandas": pd.__version__, "numpy": np.__version__, "scipy": stats.__version__ if hasattr(stats, "__version__") else "see scipy", "matplotlib": plt.matplotlib.__version__, "seaborn": sns.__version__},
}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps(manifest, indent=2))
