# Evidence Index

## Product claim

**Claim:** Execution memory changes what an agent does next.

**Evidence:** The generic Episode → Slice → Experience → CandidateMemory → ExecutionMemory → Sibyl → MemorySlice → InfluenceGrant path.

**Limitations:** The Qwen repeated provider benchmark remains `mean DeltaU = 0`; Engram beating raw history is not proven.

## Provider continuity

- State: `PRE_JOB_BLOCKED` / `UNVERIFIED`
- Tested preparation source: `c6931f2f2e6c917e0924c327c86f676eb1633bf5`
- Canonical preparation: `evidence/canonical/virtuals/a0-preparation/20260907T084541Z/`
- Canonical A0 attempt: `evidence/canonical/virtuals/a0-live-attempt/20260907T085000Z/`
- Result: Qwen decision timed out before job creation.
- Limitation: no live ACP job, outcome, spend, or utility result.

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

## Reproduction

```bash
npm run evidence:validate
npm run tool-recovery:local
npm run agent-handoff:local
npm run demo:engram
npm run check
```

All canonical evidence paths are tracked and resolve from a clean Git clone.
