# Evidence Index

## Product claim

**Claim:** Execution memory changes what an agent does next.

**Evidence:** The generic Episode → Slice → Experience → CandidateMemory → ExecutionMemory → Sibyl → MemorySlice → InfluenceGrant path.

**Limitations:** The Qwen repeated provider benchmark remains `mean DeltaU = 0`; Engram beating raw history is not proven.

## Provider continuity

- State: `BLOCKED_FUNDING_BALANCE_ZERO`
- Tested SHA: `53d4367ec6c630633a4d22a12ddc9555fe34cd16`
- Canonical preparation: `evidence/canonical/virtuals/a0-preparation/20260907T084541Z/`
- Canonical A0 execution: `evidence/canonical/virtuals/a0-live-execution/20260909T104849Z/`
- Result: one valid Qwen decision and one authentic ACP job creation; funding failed before receipt because the ACP wallet balance was zero.
- Job ID: `77776`
- Spend: `0 USDC`
- Limitation: no terminal provider outcome, U0, A0 memory, or A2.

## Tool recovery

- State: `LOCAL_PASS`
- Canonical evidence: `evidence/canonical/tool-recovery/20260907T084535Z/`
- Fixture: `tests/fixtures/tool-recovery/tool-a-rate-limit-failure.json`
- Fresh-process recall: true
- Comparable applicability: true
- Unrelated applicability: false
- Positive strategy influence: authorized
- Budget expansion: rejected
- Unauthorized escapes: 0
- Lineage errors: 0

## Agent handoff

- State: `LOCAL_PASS`
- Tested SHA: `a3917d59cf0504e9dabee68a66d7bf87ef68dacc`
- Canonical evidence: `evidence/canonical/agent-handoff/20260907T085900Z/`
- Source: Agent A
- Consumer: Agent B
- Raw history/events exposed: false
- Credentials/mandate/signer authority transferred: false
- Positive strategy influence: authorized
- Wrong consumer: rejected
- Unauthorized escapes: 0
- Lineage errors: 0

## Closed-loop evaluation

- State: `LOCAL_PASS`
- Canonical summary: `evidence/canonical/longitudinal/latest/summary.json`
- Runs: 30 deterministic seeds / 240 observations
- Arms: A0 through A5, including raw history, irrelevant, stale/contradictory, and evaluated-updated memory
- `DeltaU A2-A0`: `1.90`
- `DeltaU A5-A2`: `0.02`
- Success rate: `0.75`
- Harmful pair rate: `0.125`
- Beneficial pair rate: `0.75`
- Unauthorized attempts: `3`
- Unauthorized escapes: `0`
- Memory lifecycle: six directives, immutable prior versions, fresh-process Sibyl persistence
- Cross-agent controls: raw history/events redacted, obsolete version non-influential, updated version used by Agent C
- Cross-model probe: `BLOCKED_EXTERNAL` after Ollama socket closure under the full prompt; no result inferred
- Canonical narrative: `docs/ENGRAM_CLOSED_LOOP_ANALYSIS.md`
- Per-arm table: `evidence/canonical/longitudinal/latest/arm-summary.csv`
- Utility figure: `evidence/canonical/longitudinal/latest/utility-by-arm.svg`
- Provider repeated benchmark tables:
  - `evidence/canonical/benchmarks/provider-urgent/deterministic-10/`
  - `evidence/canonical/benchmarks/provider-urgent/qwen-10/`

## Agent surface

- State: `LOCAL_PASS`
- Transport: executable stdio MCP-compatible JSON-RPC boundary
- Tools: record/complete, recall, request influence, submit evaluation
- Cold-agent lifecycle: `PASS`
- Raw Sibyl history: not exposed
- Authority expansion: rejected by existing grant checks


```bash
npm run evidence:validate
npm run longitudinal:local
npm run agent-surface:mcp
npm run tool-recovery:local
npm run agent-handoff:local
npm run demo:engram
npm run check
```

All canonical evidence paths are tracked and resolve from a clean Git clone.
