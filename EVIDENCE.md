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
- Fresh read reconciliation: `evidence/canonical/virtuals/a0-live-execution/20260909T104849Z/read-reconciliation-20260909.json`
- Fresh result: job remains open; configured wallet is unchanged; independent Base RPC reports USDC `0` and native balance `0`; economic path stopped as `BLOCKED_EXISTING_JOB_NOT_PROGRESSABLE`.

- Model transport diagnostic: `evidence/canonical/analysis/latest/model-transport-diagnostic.json`
- Model status: Qwen timed out on the first bounded stage; Llama returned six responses but zero valid bounded proposal shapes; no utility aggregate was inferred.
- ACP session reconstruction diagnostic: `evidence/canonical/virtuals/a0-live-execution/20260909T104849Z/acp-session-diagnostic.json`
- ACP blocker report: `docs/ACP_SESSION_RECONSTRUCTION_BLOCKER.md`
- Classification: `ACP_SESSION_REHYDRATION_OR_PARTICIPATION_BUG`; direct SDK `getSession(8453, "77776")` returned `null`.
- Testnet pivot readiness: `evidence/canonical/virtuals/testnet-pivot-readiness.json`
- Testnet status: `BLOCKED_EXTERNAL_TESTNET_AUTH`; no active testnet agent, no verified ACP testnet provider/offering, and no testnet job created.

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
- Domain coverage: tool recovery `180`; agent handoff `60`; provider `0` in this dataset
- Provider continuity remains a separate benchmark and ACP evidence family
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

- Evaluation scorecard: `evidence/canonical/analysis/latest/eval-scorecard.json` and `.csv`
- Held-out contexts: `evidence/canonical/analysis/latest/heldout-evaluation.json`
- Model-backed state: `evidence/canonical/analysis/latest/model-backed-evaluation.json` (`BLOCKED_EXTERNAL`)
- Parity check: `analysis/parity_check.py`
- Analysis environment: `analysis/requirements.txt` and `analysis/analyze_engram.py`
- Multi-renderer analysis: `evidence/canonical/analysis/latest/`

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
