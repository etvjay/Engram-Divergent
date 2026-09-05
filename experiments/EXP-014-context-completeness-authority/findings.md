# EXP-014 — Findings

Date: 2026-08-16
Evidence run: GitHub Actions Engram CI `31943569578`
Result: **PASS**

## Findings

1. The same OBSERVED, high-confidence (`0.96`), high-scoring (`0.99`) memory behaved differently solely according to whether sufficient compatibility context was available.
2. When the future execution omitted environment metadata, the version-bound memory was rejected with `EXECUTION_ENVIRONMENT_UNSPECIFIED`.
3. When the future execution omitted tool metadata, the version-bound memory was rejected with `EXECUTION_TOOL_VERSION_UNSPECIFIED`.
4. Missing comparison context caused rejection **before exposure** and emitted `RECALL_FILTERED` runtime evidence.
5. Supplying matching environment `prod-v2` and compatible tool version `2.9.1` allowed the same memory to be exposed.
6. Supplying explicit incompatible environment `prod-v3` and tool major `3.0.0` continued to reject the same memory with the existing environment/tool invalidation reasons.
7. Semantic relevance, confidence and recency did not override missing compatibility evidence.
8. Existing runtime, scenario, protocol, adapter, SDK, API and evidence-registry tests remained green.

## Interpretation

**Absence of comparison evidence is not evidence of compatibility.**

This closes a fail-open gap in the authority boundary. Before EXP-014, environment/tool invalidation only ran when both the memory and future execution supplied the relevant versions. A future execution could therefore omit comparison metadata and avoid a mismatch check.

The revised behavior makes current authority conditional on sufficient context whenever the memory itself is explicitly version-bound and the active policy says those dimensions matter.

This is different from requiring every Operational Memory to carry environment/tool versions. Memories that are not version-bound do not become invalid merely because these fields are absent. The fail-closed rule is activated by the combination of memory metadata and active policy.

## Boundary

The proof is deterministic and TESTED in the runtime suite. It does not verify live deployment metadata quality, automatic environment discovery, or application-level enforcement that callers always populate meaningful version identifiers.