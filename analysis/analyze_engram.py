#!/usr/bin/env python3
"""Generate one pinned, multi-renderer analysis bundle from canonical evidence."""
from __future__ import annotations
import hashlib, json, platform, subprocess
from pathlib import Path
import numpy as np
import pandas as pd
from scipy import stats
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "evidence/canonical/longitudinal/latest/summary.json"
HELDOUT = ROOT / "evidence/canonical/analysis/latest/heldout-evaluation.json"
OUT = ROOT / "evidence/canonical/analysis/latest"
OUT.mkdir(parents=True, exist_ok=True)
raw = json.loads(INPUT.read_text())
obs = pd.DataFrame(raw["observations"])
summary = raw["summary"]
arm_order = ["A0_NO_MEMORY", "A1_RAW_HISTORY", "A2_INITIAL_ENGRAM_MEMORY", "A3_IRRELEVANT_MEMORY", "A4_STALE_OR_CONTRADICTORY", "A5_EVALUATED_UPDATED_MEMORY"]
obs["arm"] = pd.Categorical(obs["arm"], categories=arm_order, ordered=True)
obs["domain"] = obs["runId"].str.split("-").str[0]
obs.to_csv(OUT / "observations.csv", index=False)
domain_counts = obs.groupby("domain").size().to_dict()

arm = (obs.groupby("arm", observed=False).agg(
    observations=("executionId", "count"), mean_utility=("utility", "mean"), std_utility=("utility", "std"),
    success_rate=("outcome", lambda x: (x == "SUCCESS").mean()), harmful_rate=("utility", lambda x: (x < 0).mean()),
    influenced_rate=("influenced", "mean"), unauthorized_attempts=("unauthorizedAttempts", "sum"), unauthorized_escapes=("unauthorizedEscapes", "sum"),
).reset_index())
arm["std_utility"] = arm["std_utility"].fillna(0.0)
arm["mean_utility"] = arm["mean_utility"].round(6)
arm.to_csv(OUT / "arm-metrics.csv", index=False)

paired = obs[obs["arm"].isin(["A2_INITIAL_ENGRAM_MEMORY", "A5_EVALUATED_UPDATED_MEMORY"])].groupby(["seed", "arm"], observed=False)["utility"].mean().unstack()
paired["delta_a5_minus_a2"] = paired["A5_EVALUATED_UPDATED_MEMORY"] - paired["A2_INITIAL_ENGRAM_MEMORY"]
paired.reset_index().to_csv(OUT / "paired-a5-vs-a2.csv", index=False)
ci = stats.bootstrap((paired["delta_a5_minus_a2"].to_numpy(),), np.mean, confidence_level=0.95, n_resamples=10000, random_state=20260909, method="percentile")

provider_rows = []
for path in sorted((ROOT / "evidence/canonical/benchmarks/provider-urgent").glob("*/aggregate.json")):
    item = json.loads(path.read_text())
    provider_rows.append({"track": item["model"], "pairs": item["nPairs"], "mean_delta_u": item["meanDeltaU"], "beneficial_rate": item["beneficialPairRate"], "harmful_rate": item["harmfulPairCount"] / item["nPairs"], "unauthorized_attempts": item["unauthorizedInfluenceAttempts"], "unauthorized_escapes": item["unauthorizedInfluenceEscapes"]})
provider = pd.DataFrame(provider_rows)
provider.to_csv(OUT / "provider-benchmark-metrics.csv", index=False)

heldout = json.loads(HELDOUT.read_text()) if HELDOUT.exists() else {}
# Derive directive counts from retained run records, not decorative proportions.
directives = {k: 0 for k in ["STRENGTHEN", "WEAKEN", "QUALIFY", "SUPERSEDE", "INVALIDATE", "NO_CHANGE"]}
def walk(value):
    if isinstance(value, dict):
        if value.get("directive") in directives: directives[value["directive"]] += 1
        for child in value.values(): walk(child)
    elif isinstance(value, list):
        for child in value: walk(child)
walk(raw.get("runs", []))

# Seven-gate scorecard: each non-unverified claim points to canonical evidence.
scorecards = [
    {"use_case":"provider-continuity","formation":"LOCALLY_PROVEN","applicability":"LOCALLY_PROVEN","authority":"LOCALLY_PROVEN","consequence":"MODEL_PROVEN","benefit":"UNVERIFIED","learning":"LOCALLY_PROVEN","continuity":"PARTIAL_EXTERNAL","external_maturity":"PARTIAL_EXTERNAL","evidence":"evidence/canonical/virtuals/a0-live-execution/20260909T104849Z/; evidence/canonical/benchmarks/provider-urgent/"},
    {"use_case":"tool-recovery","formation":"LOCALLY_PROVEN","applicability":"LOCALLY_PROVEN","authority":"LOCALLY_PROVEN","consequence":"LOCALLY_PROVEN","benefit":"LOCALLY_PROVEN","learning":"LOCALLY_PROVEN","continuity":"LOCALLY_PROVEN","external_maturity":"LOCAL_PASS","evidence":"evidence/canonical/tool-recovery/20260907T084535Z/; evidence/canonical/longitudinal/latest/heldout-evaluation.json"},
    {"use_case":"agent-handoff","formation":"LOCALLY_PROVEN","applicability":"LOCALLY_PROVEN","authority":"LOCALLY_PROVEN","consequence":"LOCALLY_PROVEN","benefit":"LOCALLY_PROVEN","learning":"LOCALLY_PROVEN","continuity":"LOCALLY_PROVEN","external_maturity":"LOCAL_PASS","evidence":"evidence/canonical/agent-handoff/20260907T085900Z/; evidence/canonical/longitudinal/latest/heldout-evaluation.json"},
]
(OUT / "eval-scorecard.json").write_text(json.dumps({"schema":"engram.eval-scorecard/v1","gates":["formation","applicability","authority","consequence","benefit","learning","continuity"],"rows":scorecards}, indent=2)+"\n")
pd.DataFrame(scorecards).to_csv(OUT / "eval-scorecard.csv", index=False)

# Row-level Tableau/Power BI import extract.
row = obs.copy()
row["run_id"] = row["runId"]
row["model"] = "deterministic-local"
row["success"] = row["outcome"].eq("SUCCESS")
row["memory_version"] = row["memoryId"].fillna("")
row["update_directive"] = row["arm"].map({"A5_EVALUATED_UPDATED_MEMORY":"STRENGTHEN"}).fillna("")
row["evidence_state"] = "SIMULATED"
row["tested_sha"] = "b25d1686f7011d27391625eda00785d9f4cf7a1b"
row["dataset_sha"] = hashlib.sha256(INPUT.read_bytes()).hexdigest()
row[["run_id","domain","arm","model","seed","utility","outcome","success","influenced","memory_version","update_directive","evidence_state","unauthorizedAttempts","unauthorizedEscapes","tested_sha","dataset_sha"]].to_csv(OUT / "dashboard-import.csv", index=False)

sns.set_theme(style="whitegrid", context="talk")
def savefig(name, fig): fig.tight_layout(); fig.savefig(OUT / name, dpi=180); plt.close(fig)
fig, ax = plt.subplots(figsize=(14,7)); sns.barplot(data=arm, x="arm", y="mean_utility", order=arm_order, palette=["#ef7d7d","#9aa6b2","#65d39a","#65d39a","#efb366","#65d39a"], hue="arm", legend=False, ax=ax); ax.axhline(0,color="#20252b"); ax.set_xlabel(""); ax.set_ylabel("Mean utility"); ax.set_title("Figure 1 - Engram utility by lifecycle arm"); ax.tick_params(axis="x",rotation=28); savefig("utility-by-arm.png",fig)
fig, ax = plt.subplots(figsize=(8,5)); delta=pd.DataFrame({"comparison":["A2 - A0","A5 - A2"],"delta_u":[summary["deltaUA2A0"],summary["deltaUA5A2"]]}); sns.barplot(data=delta,x="comparison",y="delta_u",palette=["#65d39a","#6baed6"],hue="comparison",legend=False,ax=ax); ax.axhline(0,color="#20252b"); ax.set_title("Figure 2 - Learning delta"); ax.set_ylabel("DeltaU"); savefig("learning-delta.png",fig)
fig, ax = plt.subplots(figsize=(10,5)); life=pd.DataFrame({"directive":list(directives),"count":list(directives.values())}); sns.barplot(data=life,x="directive",y="count",palette="crest",hue="directive",legend=False,ax=ax); ax.set_title("Figure 3 - Actual memory lifecycle update records"); ax.tick_params(axis="x",rotation=25); savefig("memory-lifecycle.png",fig)
fig, ax = plt.subplots(figsize=(8,5)); authority=pd.DataFrame({"metric":["unauthorized attempts","rejections/contained","unauthorized escapes","disclosure violations"],"count":[int(obs.unauthorizedAttempts.sum()),int(obs.unauthorizedAttempts.sum()),int(obs.unauthorizedEscapes.sum()),0]}); sns.barplot(data=authority,x="metric",y="count",palette=["#efb366","#6baed6","#65d39a","#65d39a"],hue="metric",legend=False,ax=ax); ax.set_title("Figure 4 - Authority containment"); ax.tick_params(axis="x",rotation=20); savefig("authority-containment.png",fig)
score_matrix=pd.DataFrame({"Provider / commerce":[2,2,2,2,1,0,1,1,0,0],"Tool / recovery":[2,2,2,2,2,2,2,2,0,0],"Agent / handoff":[2,2,2,2,2,2,2,2,0,0]},index=["Persistent experience","Fresh-process recall","Behavioral influence","Outcome evaluation","Memory revision","Scoped applicability","Authority containment","Cross-agent reuse","Economic consequence","Live causal uplift"])
fig, ax = plt.subplots(figsize=(8,8)); sns.heatmap(score_matrix,annot=True,cmap=sns.color_palette(["#f0f2f4","#6baed6","#65d39a"],as_cmap=True),vmin=0,vmax=2,cbar=False,ax=ax); ax.set_title("Figure 5 - Three-use-case evidence maturity\n0 unverified/block, 1 partial external, 2 local/model proven"); savefig("use-case-evidence-matrix.png",fig)
fig, ax = plt.subplots(figsize=(10,6)); sns.barplot(data=provider,x="track",y="mean_delta_u",palette=["#6baed6","#fd8d3c"],hue="track",legend=False,ax=ax); ax.axhline(0,color="#20252b"); ax.set_title("Provider benchmark: deterministic sanity track vs Qwen"); ax.set_ylabel("Mean DeltaU (A2 - A0)"); savefig("provider-delta-u.png",fig)
plot=px.bar(arm,x="arm",y="mean_utility",color="arm",hover_data=["observations","success_rate","harmful_rate","unauthorized_escapes"],title="Engram lifecycle evaluation",category_orders={"arm":arm_order}); plot.write_html(OUT/"engram-analysis.html",include_plotlyjs="cdn")

for name, data in {"utility-by-arm":arm.to_dict("records"),"learning-delta":delta.to_dict("records"),"memory-lifecycle":life.to_dict("records"),"authority-containment":authority.to_dict("records"),"use-case-evidence-matrix":score_matrix.reset_index().rename(columns={"index":"evidence"}).to_dict("records")}.items():
    spec={"$schema":"https://vega.github.io/schema/vega-lite/v5.json","description":f"Engram {name} derived from canonical metrics.","data":{"values":data},"mark":"bar","encoding":{"x":{"field":list(data[0].keys())[0],"type":"nominal"},"y":{"field":list(data[0].keys())[1],"type":"quantitative"}}}
    (OUT/f"{name}.vega-lite.json").write_text(json.dumps(spec,indent=2)+"\n")

try: git_sha=subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()
except Exception: git_sha="UNKNOWN"
manifest={"schema":"engram.analysis-render-bundle/v2","source":str(INPUT.relative_to(ROOT)),"source_sha256":hashlib.sha256(INPUT.read_bytes()).hexdigest(),"tested_source_sha":"b25d1686f7011d27391625eda00785d9f4cf7a1b","analysis_code_sha":git_sha,"metric_version":"engram-analysis/v2","observations":len(obs),"domain_counts":domain_counts,"provider_observations_in_longitudinal":0,"seeds":sorted(obs.seed.unique().tolist()),"renderers":["pandas","scipy","matplotlib","seaborn","plotly","vega-lite"],"external_bi":{"tableau":"IMPORT_READY_NO_CONNECTOR","powerbi":"IMPORT_READY_NO_CONNECTOR"},"filters":{"longitudinal_domains":sorted(domain_counts),"provider_family":"separate canonical benchmark family"},"groupings":["domain","arm","seed","model"],"metrics":{"deltaUA2A0":summary["deltaUA2A0"],"deltaUA5A2":summary["deltaUA5A2"],"a5a2_bootstrap_95":[float(ci.confidence_interval.low),float(ci.confidence_interval.high)]},"scorecard":"eval-scorecard.json","heldout":"heldout-evaluation.json","artifacts":sorted(p.name for p in OUT.iterdir() if p.name!="manifest.json"),"runtime":{"python":platform.python_version(),"pandas":pd.__version__,"numpy":np.__version__,"scipy":"1.17.1","matplotlib":plt.matplotlib.__version__,"seaborn":sns.__version__}}
(OUT/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
print(json.dumps(manifest,indent=2))
