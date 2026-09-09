# Engram Three-Use-Case Demo

Target runtime: 2–5 minutes.

## Open

Most agent memory systems remember information. Engram remembers consequences: execution experience becomes scoped memory that can change what an agent does next without silently expanding authority.

## 1. Provider continuity

Run:

```bash
npm run demo:engram
```

The replay shows the canonical Virtuals preparation and the one authorized Qwen A0 attempt. That attempt timed out before a valid decision, so no ACP job was created. This is intentionally shown as `PRE_JOB_BLOCKED`, not as live success.

## 2. Tool recovery

Show the canonical local proof:

```text
Tool A → rate limits → retries → timeout → RETRY_EXHAUSTED
→ generic Engram formation → Sibyl → fresh process
→ Tool B / reduced retry / explicit fallback
```

The positive strategy influence is authorized; `increase_budget` is rejected.

## 3. Agent handoff

Agent A's failure experience is persisted, then Agent A disappears. A fresh Agent B receives only a scoped `MemorySlice` and `InfluenceGrant`.

Agent B can change tool/retry/fallback strategy. It does not receive raw history, credentials, mandate, signer authority, or unrelated authority.

## Close

Engram makes execution experience portable without making authority portable.

The demo is replay-only. It does not create ACP jobs, fund jobs, invoke a signer, or call Base.
