# ACP Session Reconstruction Blocker

Status: `ACP_SESSION_REHYDRATION_OR_PARTICIPATION_BUG`

Observed at: `2026-09-09T21:33:18Z`

## Scope

This is a diagnostic record for the retained authentic ACP job `77776`. It does not create, fund, retry, replace, complete, reject, or mutate any ACP job.

## Safe identity

```text
ACP CLI: 1.0.35
ACP Node SDK: @virtuals-protocol/acp-node-v2 0.1.12
Node: v22.23.2
npm: 10.9.8
network: Base mainnet, chain 8453
agent ID: 01a070b3-bd5d-7509-8b5f-535818049bf1
active wallet: 0x938813e44ea5b9322e112056ffe60aa0ab272fc9
signer: configured; key material withheld
```

## Job state

```text
job: 77776
provider: 0xa4875a904767cf37f77d53C1EB45e0701fa7D6C
client: 0x938813e44EA5B9322e112056fFE60A0aB272FC9
evaluator: 0x938813e44EA5B9322e112056fFE60A0aB272FC9
status from history: open
history entries: 2
```

## Read-only checks

| Check | Result |
|---|---|
| `agent list --json` | one active agent; wallet matches job client |
| `agent whoami --json` | active agent and wallet confirmed |
| `job list --json` | empty active-job list |
| `job list --all --json` | blocked by ACP manual-approval policy; approval not consumed |
| `job history --job-id 77776 --chain-id 8453 --json` | readable; two entries; job remains open |
| direct SDK `getSession(8453, "77776")` | `null` |
| direct SDK hydrated sessions | empty |
| direct SDK supported chain | includes `8453` |
| direct SDK `fetchJob()` | not attempted because session was null |
| CLI funding action | advertised, but returns `SESSION_NOT_FOUND` |

## Interpretation

History visibility does not establish funding participation. The maintained SDK can authenticate the active agent and enumerate supported chain `8453`, but it does not rehydrate a session for job `77776`. The CLI fund wrapper returns the same session-resolution failure after re-authentication.

Classification:

```text
ACP_SESSION_REHYDRATION_OR_PARTICIPATION_BUG
```

This is a reproducible external integration blocker. It is not classified as insufficient funds, missing signer, wrong active wallet, or wrong chain.

## Side-effect boundary

```text
funding attempts: 2
last result: SESSION_NOT_FOUND
transaction broadcast: false
funding receipt: absent
replacement jobs: 0
terminal provider outcome: absent
```

Do not retry funding, create a replacement job, or bypass participant checks until ACP confirms how job `77776` should be rehydrated or associated with the active agent.
