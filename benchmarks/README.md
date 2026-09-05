# Benchmarks

This directory contains benchmark scenario manifests and retained result/evidence bundles for Engram's causal execution-memory evaluation.

The canonical protocol is defined in [`../BENCHMARK.md`](../BENCHMARK.md).

## Directory convention

```text
benchmarks/
  scenarios/
    <scenario-id>.json
  results/
    <run-id>/
      manifest.json
      trials.jsonl
      pairs.jsonl
      evidence/
```

Scenario manifests describe what must remain fixed across matched benchmark arms.

Result bundles contain trial-level facts, causal A0/A2 pair results, external receipt references, evidence maturity, and the tested git SHA.

## Required arms

```text
A0_NO_MEMORY
A1_RAW_HISTORY
A2_ENGRAM
A3_IRRELEVANT_MEMORY
A4_STALE_OR_CONTRADICTORY
```

## Result discipline

Do not report an Engram win because memory was recalled or because an action changed.

A positive treatment result requires:

```text
eligible memory
  ↓
verified influence lineage
  ↓
consequential behavioral change
  ↓
DeltaU > 0
  ↓
no authority/disclosure violation
```

Harmful changes remain visible as harmful results.

## Live track

The intended live benchmark environment is:

```text
Virtuals ACP → Engram/Sibyl → fresh agent process → Virtuals ACP → Base → outcome/evaluation
```

The model-portability track should reuse the same scenario manifests with model-specific matched control/treatment pairs.
