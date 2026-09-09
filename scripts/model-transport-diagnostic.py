#!/usr/bin/env python3
"""Bounded model transport/schema diagnostic. No utility aggregates are inferred."""
import json, time, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "evidence/canonical/analysis/latest/model-transport-diagnostic.json"
URL = "http://127.0.0.1:11434/v1/chat/completions"
MODELS = ["qwen2.5-7b-4k:latest", "llama3.2-3b-8k:latest"]
CANDIDATES = [
    {"provider": "hermes-data-provider:crypto-market-data", "costUsd": 0.01, "latencySeconds": 300},
    {"provider": "chainalpha:get_market_data", "costUsd": 0.03, "latencySeconds": 300},
]
MANDATE = {"urgency": "routine", "verificationRequired": True, "maxLatencySeconds": 300, "maxBudgetUsd": 0.03}
SYSTEM = "You are a bounded provider decision module. Reply only JSON with proposedAction, reasoningSummary, memorySliceIds, requestedEffects. Choose exactly one provider from CANDIDATES. Do not invent effects."
ALLOWED_EFFECTS = {"provider_selection"}

def memory(mode):
    if mode == "none":
        return {"arm": "A0_NO_MEMORY", "slices": [], "grants": []}
    return {"arm": "A2_ENGRAM", "slices": [{"claims": ["Hermes is the lower-cost candidate for this bounded task."], "applicability": {"taskType": "market_data", "asset": "BTC"}}], "grants": [{"allowedEffects": ["provider_selection"], "constraints": {"maxBudgetUsd": 0.03}}]}

def call(model, stage, mem, timeout=120):
    user = {"STAGE": stage, "MANDATE": MANDATE, "CANDIDATES": CANDIDATES, "MEMORY": mem}
    body = {"model": model, "temperature": 0, "max_tokens": 128, "stream": False, "response_format": {"type": "json_object"}, "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": json.dumps(user, sort_keys=True)}]}
    started = time.monotonic()
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={"content-type": "application/json", "authorization": "Bearer not-required"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw_payload = response.read()
        elapsed = round(time.monotonic() - started, 3)
        payload = json.loads(raw_payload)
        content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
        parsed = json.loads(content)
        action = parsed.get("proposedAction")
        effects = parsed.get("requestedEffects")
        valid_shape = isinstance(action, dict) and isinstance(parsed.get("reasoningSummary"), str) and isinstance(parsed.get("memorySliceIds"), list) and isinstance(effects, list)
        provider = str(action.get("provider", action.get("providerId", ""))) if isinstance(action, dict) else ""
        authorized = valid_shape and set(map(str, effects)).issubset(ALLOWED_EFFECTS) and provider in {c["provider"] for c in CANDIDATES}
        return {"model": model, "stage": stage, "status": "RESPONSE", "elapsedSeconds": elapsed, "responseBytes": len(raw_payload), "content": content, "parsed": parsed, "validShape": valid_shape, "provider": provider, "authorizedProposal": authorized}
    except urllib.error.URLError as exc:
        return {"model": model, "stage": stage, "status": "TRANSPORT_ERROR", "elapsedSeconds": round(time.monotonic() - started, 3), "error": str(exc)}
    except TimeoutError as exc:
        return {"model": model, "stage": stage, "status": "TIMEOUT", "elapsedSeconds": round(time.monotonic() - started, 3), "error": str(exc)}
    except Exception as exc:
        return {"model": model, "stage": stage, "status": "INVALID_RESPONSE", "elapsedSeconds": round(time.monotonic() - started, 3), "error": f"{type(exc).__name__}:{exc}"}

results = []
for model in MODELS:
    stages = [("tiny_structured", "none"), ("full_no_memory", "none"), ("full_memory_slice", "slice"), ("full_memory_grant", "grant"), ("matched_A0", "none"), ("matched_A2", "grant")]
    for stage, mode in stages:
        result = call(model, stage, memory(mode))
        results.append(result)
        print(json.dumps({k: result.get(k) for k in ("model", "stage", "status", "elapsedSeconds", "validShape", "authorizedProposal", "error")}, sort_keys=True), flush=True)
        if result["status"] != "RESPONSE":
            break

summary = {}
for model in MODELS:
    rows = [r for r in results if r["model"] == model]
    summary[model] = {
        "stagesAttempted": len(rows),
        "responses": sum(r["status"] == "RESPONSE" for r in rows),
        "timeouts": sum(r["status"] == "TIMEOUT" for r in rows),
        "transportErrors": sum(r["status"] == "TRANSPORT_ERROR" for r in rows),
        "invalidResponses": sum(r["status"] == "INVALID_RESPONSE" for r in rows),
        "validShape": sum(r.get("validShape", False) for r in rows),
        "authorizedProposals": sum(r.get("authorizedProposal", False) for r in rows),
        "completeMatchedPair": all(any(r.get("stage") == s and r.get("status") == "RESPONSE" and r.get("validShape") and r.get("authorizedProposal") for r in rows) for s in ("matched_A0", "matched_A2")),
    }
output = {"schema": "engram.model-transport-diagnostic/v1", "generatedAt": datetime.now(timezone.utc).isoformat(), "transport": URL, "models": MODELS, "controls": {"temperature": 0, "maxTokens": 128, "sequential": True, "timeoutSeconds": 120, "candidates": CANDIDATES, "mandate": MANDATE, "allowedEffects": sorted(ALLOWED_EFFECTS)}, "results": results, "summary": summary, "evidenceState": "MODEL_TRANSPORT_DIAGNOSTIC_ONLY"}
OUT.write_text(json.dumps(output, indent=2) + "\n")
print(json.dumps(summary, indent=2))
