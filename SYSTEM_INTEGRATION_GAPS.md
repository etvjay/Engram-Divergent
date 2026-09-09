# System Integration Gap Matrix

Audit target: `53d4367ec6c630633a4d22a12ddc9555fe34cd16`

## Component classification

| Component | Classification | Evidence |
|---|---|---|
| `packages/experience`, `memory-core`, `runtime`, `sibyl` | COMPOSED | Local Episode → memory → Sibyl → fresh-process proofs |
| Tool recovery | COMPOSED / LOCAL_PASS | `tool-recovery:local` and canonical evidence |
| Agent handoff | COMPOSED / LOCAL_PASS | `agent-handoff:local` and canonical evidence |
| ACP catalog preparation | COMPOSED / READ_ONLY | `virtuals:acp:prepare`, frozen bundle |
| ACP history normalization | COMPOSED / FIXTURE_PASS | ACP adapter tests and fixture durable-learning proof |
| ACP live create/fund/observe | DISCONNECTED / BLOCKED_EXTERNAL | No valid Qwen decision; no live job; orchestration create/fund functions are mock state transitions |
| ACP live → generic formation | TEST_ONLY | Fixture process proves the path; live adapter script only observes ingestion |
| Base settlement | BACKEND_ONLY / LOCAL_CONFORMANCE | Separate conformance tests; no authentic ACP/Base consequence |
| REST/MCP/SDK/Web | NOT_SUPPORTED | No public transport surfaces in this repository |
| Demo | COMPOSED / REPLAY_ONLY | `demo:engram` consumes canonical artifacts and performs no new execution |

## Gap matrix

| ID | Layer | Current behavior | Expected behavior | Severity | Status |
|---|---|---|---|---|---|
| WH-001 | External execution | A0 Qwen decision timed out before provider selection | Valid first A0 decision from frozen contract | P0 | BLOCKED_EXTERNAL |
| WH-002 | ACP adapter | History read/normalization exists; create/fund/observe live boundary is not wired to a verified provider CLI contract | One authenticated ACP job flows through create → fund → terminal history | P0 | OPEN |
| WH-003 | Live Engram | Fixture ACP process proves formation; live ACP ingestion does not yet invoke the full generic formation path | Authentic ACP outcome forms Episode through ExecutionMemory/Sibyl | P0 | OPEN |
| WH-004 | Provider evaluation | No A0, no U0, no A2, no DeltaU | Live A0/A2 matched comparison | P0 | BLOCKED_EXTERNAL |
| WH-005 | Entry surfaces | CLI/scripts and direct TypeScript modules only | Public application boundary for supported consumers | P1 | NOT_SUPPORTED / SCOPE DECISION |
| WH-006 | Transport equivalence | No REST/MCP/SDK/Web surfaces to compare | Equivalent semantic result across declared transports | P1 | NOT_APPLICABLE_UNTIL_SURFACES_EXIST |
| WH-007 | State vocabulary | Runtime, ACP lifecycle, evidence state, and demo state are separate vocabularies | One documented product state taxonomy or explicit plane boundaries | P1 | OPEN |
| WH-008 | Error vocabulary | Errors are stable within modules but not normalized across all planes | Cross-boundary machine-readable error taxonomy | P1 | OPEN |
| WH-009 | Cold agent/developer journey | No API/MCP/SDK onboarding path | Cold agent/developer can discover and run one workflow | P1 | OPEN |
| WH-010 | Base narrative | Base adapter is locally tested but not connected to authentic ACP consequence | Base evidence only when produced by the external execution | P2 | CORRECTLY_UNVERIFIED |

## Confirmed strengths

- Generic artifact chain is traversable for local tool recovery and agent handoff.
- Sibyl is the sole behavioral persistence backend.
- MemorySlice disclosure and InfluenceGrant authority are separate.
- Agent handoff preserves source provenance without transferring raw history or authority.
- Canonical evidence references are tracked and resolve.
- Demo and Try are not conflated: the current demo is explicitly replay-only.

## Verdict

```text
P0 remaining: 4
P1 remaining: 5
authority violations observed: 0
final verdict: REQUEST_CHANGES
```

The remaining P0s are concentrated in the external provider path, not the local Engram/Sibyl core.
