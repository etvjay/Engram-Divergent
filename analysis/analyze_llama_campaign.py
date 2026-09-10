from __future__ import annotations

import csv
import json
import statistics
from pathlib import Path

import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
CHECKPOINT = ROOT / "benchmarks/campaigns/llama3.2_1b-provider-urgent-10-timeout-60000/checkpoint.jsonl"
OUT = ROOT / "evidence/canonical/analysis/llama1b-provider-urgent-10"
OUT.mkdir(parents=True, exist_ok=True)

records = [json.loads(line) for line in CHECKPOINT.read_text().splitlines() if line.strip()]
runs = [record["run"] for record in records if record["kind"] == "completed"]
pairs = [pair for run in runs for pair in run["pairs"]]
trials = [trial for run in runs for trial in run["trials"]]
if len(pairs) != 10:
    raise SystemExit(f"expected 10 completed pairs, got {len(pairs)}")

mean_delta = statistics.fmean(pair["deltaUtility"] for pair in pairs)
median_delta = statistics.median(pair["deltaUtility"] for pair in pairs)
beneficial = sum(pair["beneficial"] for pair in pairs)
harmful = sum(pair["harmful"] for pair in pairs)
equal = len(pairs) - beneficial - harmful
by_arm = {}
for arm in sorted({trial["arm"] for trial in trials}):
    values = [trial for trial in trials if trial["arm"] == arm]
    by_arm[arm] = {
        "count": len(values),
        "meanUtility": statistics.fmean(t["utility"] for t in values),
        "successRate": sum(t["outcome"]["status"] == "SUCCESS" for t in values) / len(values),
        "behaviorConsequential": sum(t["behaviorConsequential"] for t in values),
        "memoryInfluenced": sum(t["memoryInfluenced"] for t in values),
        "unauthorizedAttempts": sum(t["unauthorizedInfluenceAttempts"] for t in values),
        "unauthorizedEscapes": sum(t["unauthorizedInfluenceEscapes"] for t in values),
    }

scorecard = {
    "schema": "engram.llama1b.campaign-analysis/v1",
    "source": str(CHECKPOINT.relative_to(ROOT)),
    "model": "llama3.2:1b",
    "scenario": "provider-urgent",
    "completedPairs": len(pairs),
    "errorPairs": len(records) - len(pairs),
    "meanDeltaU": mean_delta,
    "medianDeltaU": median_delta,
    "minDeltaU": min(pair["deltaUtility"] for pair in pairs),
    "maxDeltaU": max(pair["deltaUtility"] for pair in pairs),
    "beneficialPairs": beneficial,
    "equalPairs": equal,
    "harmfulPairs": harmful,
    "beneficialRate": beneficial / len(pairs),
    "harmfulRate": harmful / len(pairs),
    "authorityClean": all(pair["authorityClean"] for pair in pairs),
    "unauthorizedAttempts": sum(t["unauthorizedInfluenceAttempts"] for t in trials),
    "unauthorizedEscapes": sum(t["unauthorizedInfluenceEscapes"] for t in trials),
    "byArm": by_arm,
    "evidenceMaturity": "LOCAL_MODEL_PILOT",
    "limitations": [
        "N=10 matched provider-urgent pairs only",
        "single local model and scenario",
        "not independent stochastic replication across environments",
        "not live provider execution or provider uplift",
    ],
}
(OUT / "scorecard.json").write_text(json.dumps(scorecard, indent=2) + "\n")
with (OUT / "paired-results.csv").open("w", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=["pairId", "controlTrialId", "treatmentTrialId", "deltaUtility", "actionChanged", "behaviorConsequential", "beneficial", "harmful", "authorityClean"])
    writer.writeheader(); writer.writerows(pairs)
with (OUT / "arm-metrics.csv").open("w", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=["arm", *next(iter(by_arm.values())).keys()])
    writer.writeheader()
    for arm, metrics in by_arm.items(): writer.writerow({"arm": arm, **metrics})

plt.figure(figsize=(8, 4.5))
plt.bar(range(1, len(pairs) + 1), [pair["deltaUtility"] for pair in pairs], color="#3b82f6")
plt.axhline(0, color="#111827", linewidth=0.8)
plt.xlabel("Matched pair")
plt.ylabel("DeltaU: A2 - A0")
plt.title("Llama 1B provider-urgent pilot DeltaU (N=10)")
plt.tight_layout(); plt.savefig(OUT / "delta-u-by-pair.png", dpi=160); plt.close()

plt.figure(figsize=(8, 4.5))
arms = list(by_arm)
plt.bar(arms, [by_arm[arm]["meanUtility"] for arm in arms], color="#10b981")
plt.ylabel("Mean utility")
plt.title("Llama 1B provider-urgent pilot utility by arm")
plt.xticks(rotation=25, ha="right")
plt.tight_layout(); plt.savefig(OUT / "utility-by-arm.png", dpi=160); plt.close()

print(json.dumps({"scorecard": str(OUT / "scorecard.json"), "pairs": len(pairs), "trials": len(trials), "meanDeltaU": mean_delta, "beneficial": beneficial, "equal": equal, "harmful": harmful, "unauthorizedEscapes": scorecard["unauthorizedEscapes"]}))
