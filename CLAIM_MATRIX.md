# Claim Matrix

| Claim | State |
|---|---|
| Execution-derived memory formation | `LOCAL_PASS` |
| Sibyl durability | `LOCAL_PASS` |
| Fresh-process recall | `LOCAL_PASS` |
| Scoped applicability | `LOCAL_PASS` |
| Influence authorization | `LOCAL_PASS` |
| Unauthorized influence escapes = 0 | `LOCAL_PASS` |
| Tool recovery | `LOCAL_PASS` |
| Cross-agent handoff | `LOCAL_PASS` |
| Versioned memory evaluation | `LOCAL_PASS` |
| Six update directives | `LOCAL_PASS` |
| A5 evaluated memory vs A2 initial memory | `LOCAL_PASS` / local neutral-to-positive `DeltaU=+0.02` |
| Repeated local cycles | `LOCAL_PASS` / 240 observations: 180 tool, 60 handoff; provider separate |
| Cold agent MCP lifecycle | `LOCAL_PASS` |
| Held-out tool contexts | `LOCAL_PASS` / 10 contexts, overapplication 0 |
| Held-out handoff controls | `LOCAL_PASS` / 9 cases, leakage 0 |
| Evaluation query surface | `LOCAL_PASS` / read-only MCP resources and tools |
| Cross-model continuity | `BLOCKED_EXTERNAL` |
| Model-backed Qwen/Llama utility | `UNVERIFIED` / bounded probe timed out before artifact |
| Live Virtuals A0 | `BLOCKED_FUNDING_BALANCE_ZERO` / `PARTIAL_EXTERNAL_PASS` |
| Live Virtuals A2 | `NOT_EXECUTED` |
| Live causal uplift | `NOT_PROVEN` |
| Engram > raw history | `NOT_PROVEN` |
| Base consequence | `UNVERIFIED` |
| Production readiness | `UNVERIFIED` |

The Qwen repeated provider benchmark remains:

```text
A0 mean utility: +0.2
A1 mean utility: +0.2
A2 mean utility: +0.2
mean DeltaU: 0.0
beneficial pairs: 0/10
harmful pairs: 0/10
```

The three-use-case differentiators currently demonstrated are durable execution semantics, scoped applicability, selective disclosure, authority containment, fresh-process continuity, and canonical external-readiness evidence.
