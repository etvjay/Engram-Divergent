# System Integration Gap Matrix

Audit target: `772f77ca0bb0de423bebadaf69d136dc3423f8c9`

## Component classification

| Component | Classification | Evidence |
|---|---|---|
| `packages/experience`, `memory-core`, `runtime`, `sibyl` | COMPOSED | Local Episode → memory → Sibyl → fresh-process proofs |
| Versioned memory evaluation | COMPOSED / LOCAL_PASS | Immutable prior memory → evaluation → update record → new memory version; fresh-store readback |
| Tool recovery longitudinal loop | COMPOSED / LOCAL_PASS | 3 seeds, E1–E5, A5 vs A2 utility and rehabilitation |
| Agent handoff longitudinal loop | COMPOSED / LOCAL_PASS | Agent A → B → evaluated version → fresh Agent C |
| Cold agent surface | COMPOSED / LOCAL_PASS | stdio MCP-compatible lifecycle with bounded tools |
| Tool recovery | COMPOSED / LOCAL_PASS | `tool-recovery:local` and canonical evidence |
| Agent handoff | COMPOSED / LOCAL_PASS | `agent-handoff:local` and canonical evidence |
| ACP catalog preparation | COMPOSED / READ_ONLY | `virtuals:acp:prepare`, frozen bundle |
| ACP history normalization | COMPOSED / FIXTURE_PASS | ACP adapter tests and fixture durable-learning proof |
| ACP live create/fund/observe | PARTIAL / BLOCKED_EXTERNAL | Authenticated create reached job `77776`; maintained SDK `getSession(8453, "77776")` returns null and funding returns `SESSION_NOT_FOUND` |
| ACP live → generic formation | TEST_ONLY / BLOCKED_EXTERNAL | Fixture process proves formation; authentic job has not reached terminal outcome |
| Versioned evaluation → future recall | COMPOSED / LOCAL_PASS | Six directives produce immutable version records; current-version eligibility is fail-closed |
| Base settlement | BACKEND_ONLY / LOCAL_CONFORMANCE | Separate conformance tests; no authentic ACP/Base consequence |
| REST/MCP/SDK/Web | MCP + typed SDK COMPOSED / LOCAL_PASS; REST/Web DEFERRED_BY_SCOPE | bounded MCP lifecycle and typed SDK cold-developer test; no REST or browser surface by scope |
| Demo | COMPOSED / REPLAY_ONLY | `demo:engram` consumes canonical artifacts and performs no new execution |

## Gap matrix

| ID | Layer | Current behavior | Expected behavior | Severity | Status |
|---|---|---|---|---|---|
| WH-001 | External execution | A0 Qwen decision succeeded; funding is the current external blocker | Valid first A0 decision from frozen contract | P0 | CLOSED_BY_PARTIAL_EXTERNAL_PASS; funding is now the blocker |
| WH-002 | ACP adapter | Authenticated create reached job `77776`; maintained SDK cannot rehydrate the session and fund returns `SESSION_NOT_FOUND` | One authenticated ACP job flows through create → fund → terminal history | P0 | ACP_SESSION_REHYDRATION_OR_PARTICIPATION_BUG |
| WH-003 | Live Engram | Fixture process proves formation; authentic ACP outcome has not reached terminal state | Authentic ACP outcome forms Episode through ExecutionMemory/Sibyl | P0 | WAITING_ON_TERMINAL_OUTCOME |
| WH-004 | Provider evaluation | No authentic U0, A2, U2, or DeltaU | Live A0/A2 matched comparison | P0 | BLOCKED_EXTERNAL |
| WH-005 | Entry surfaces | CLI/scripts plus bounded stdio MCP and typed SDK surfaces | Public application boundary for supported agent consumers | P1 | MCP_LOCAL_PASS; SDK_LOCAL_PASS; REST/Web DEFERRED_BY_SCOPE |
| WH-006 | Transport equivalence | MCP and typed SDK are proven; REST/Web are not declared surfaces | Equivalent semantic result across declared transports | P1 | MCP_SDK_LOCAL_PASS; REST/Web DEFERRED_BY_SCOPE |
| WH-007 | State vocabulary | Runtime, ACP lifecycle, evidence state, demo state, and update directives remain separate but documented | One documented product state taxonomy or explicit plane boundaries | P1 | OPEN |
| WH-008 | Error vocabulary | Errors are stable within modules and MCP wraps them as machine-readable responses; cross-plane taxonomy incomplete | Cross-boundary machine-readable error taxonomy | P1 | PARTIAL |
| WH-009 | Cold agent/developer journey | Cold agent MCP lifecycle and typed SDK lifecycle pass | Cold agent/developer can discover and run one workflow | P1 | AGENT_SDK_PASS |
| WH-010 | Base narrative | Base adapter is locally tested but not connected to authentic ACP consequence | Base evidence only when produced by the external execution | P2 | CORRECTLY_UNVERIFIED |
| WH-011 | Model-backed reliability | Qwen times out at the first bounded diagnostic stage; Llama returns no valid bounded proposal shapes | Complete reliable matched model runs | P1 | BLOCKED_EXTERNAL |

## Confirmed strengths

- Generic artifact chain is traversable for local tool recovery and agent handoff.
- Sibyl is the sole behavioral persistence backend.
- MemorySlice disclosure and InfluenceGrant authority are separate.
- Agent handoff preserves source provenance without transferring raw history or authority.
- Canonical evidence references are tracked and resolve.
- Versioned evaluations preserve historical artifacts and resolve the current eligible memory fail-closed.
- Longitudinal local evidence measures A5 against A2 across repeated seeds rather than relying on one anecdote.
- The bounded MCP surface supports a cold-agent lifecycle without exposing raw Sibyl history.
- Demo and Try are not conflated: the current demo is explicitly replay-only.
- Cross-model continuity remains explicitly blocked after a bounded sequential transport/schema diagnostic; no malformed response is promoted to utility evidence.
- Typed SDK wraps the bounded MCP-compatible lifecycle and passes a cold-developer integration test without duplicating memory semantics.

## Verdict

```text
P0 remaining: 1 root external ACP session-reconstruction gap
P1 remaining: 3 (model transport, state vocabulary, error vocabulary)
Deferred by scope: frontend, REST, Tableau, Power BI
Authority violations observed: 0
Final verdict: REQUEST_CHANGES_EXTERNAL
```

The remaining P0 is concentrated in the external provider path. The local Engram/Sibyl core, MCP surface, and typed SDK are composed and passing.
