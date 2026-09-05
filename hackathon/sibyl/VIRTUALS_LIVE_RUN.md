# Virtuals ACP Live Proof Runbook

Status: `IMPLEMENTED_ADAPTER / AUTHENTICATED_JOB_NOT_RUN`

Goal: replace the provider-continuity fixture's external interaction boundary with a real Virtuals ACP testnet job while keeping Engram/Sibyl as the memory and influence authority.

## Safety / truth boundary
- Use the maintained `@virtuals-protocol/acp-cli`.
- Use `IS_TESTNET=true` until the entire proof is stable.
- Every scripted command uses `--json`.
- Authentication and signer state remain in the ACP config / OS keychain. Never commit them.
- Do not claim the Virtuals partner multiplier until a real ACP job/agent interaction is captured in evidence.

## 1. Install / select testnet

```bash
npm i -g @virtuals-protocol/acp-cli
export IS_TESTNET=true
```

Optional isolated config for the experiment:

```bash
export ACP_CONFIG_DIR="$HOME/.config/acp-engram-sibyl"
```

## 2. Authenticate — split flow

For agent/tool-driven terminals, do not use the blocking bare configure command.

```bash
acp configure start --json
```

This returns a sign-in URL and request ID. Open the URL, authenticate, then:

```bash
acp configure complete --request-id <REQUEST_ID> --wait --timeout 300 --json
```

Expected terminal state: `authenticated` plus wallet address.

## 3. Create/select requester agent and signer

Inspect current state first:

```bash
acp agent list --json
acp agent whoami --json
```

If no suitable testnet requester exists:

```bash
acp agent create \
  --name "Engram Requester" \
  --description "Requester agent for Sibyl experiential-continuity evaluation" \
  --signer \
  --policy restricted \
  --json
```

If an agent already exists, select it and ensure a signer is configured using the current ACP CLI guidance before any job action that signs onchain.

## 4. Discover a real provider/offering

Start with a low-cost, deterministic-enough service category:

```bash
acp browse "data analysis" --top-k 5 --json
```

Record:
- provider wallet/address;
- provider/agent name;
- offering name;
- price;
- advertised SLA if available;
- supported testnet chain ID.

Do not invent `Atlas`/`Beacon` identities for the live proof. The deterministic fixture names are test-only. Live evidence uses the actual ACP provider identity.

## 5. Start an Engram execution before the ACP job

The live harness needs an Engram execution ID that will receive the ACP observation. Start it through the existing SDK/API/runtime surface with:
- `agentId`: requester identity;
- `workflowType`: `agent_provider_selection`;
- `taskType`: matching the chosen offering;
- provider identity;
- urgency / SLA constraint;
- environment version including ACP testnet and chain.

Record the Engram execution ID and start timestamp.

## 6. Create and execute the ACP job

Recommended offering flow:

```bash
acp client create-job \
  --provider <PROVIDER_ADDRESS> \
  --offering-name "<OFFERING_NAME>" \
  --requirements '<JSON_REQUIREMENTS>' \
  --chain-id <CHAIN_ID> \
  --json
```

Follow the current ACP state machine rather than assuming the next action:

```text
open -> budget_set -> funded -> submitted -> completed/rejected
```

Inspect/watch the job:

```bash
acp job watch --job-id <JOB_ID> --timeout 300 --json
acp job history --job-id <JOB_ID> --chain-id <CHAIN_ID> --json
```

Funding/release only when the current job state requires it:

```bash
acp client fund --job-id <JOB_ID> --amount <USDC_AMOUNT> --chain-id <CHAIN_ID> --json
acp client complete --job-id <JOB_ID> --chain-id <CHAIN_ID> --reason "accepted" --json
```

If the deliverable is invalid, use the real rejection path rather than forcing a success:

```bash
acp client reject --job-id <JOB_ID> --chain-id <CHAIN_ID> --reason "<REASON>" --json
```

## 7. Ingest authoritative ACP history into Engram

Once terminal/meaningful evidence exists, record completion timestamp and run:

```bash
npm run virtuals:acp:ingest -- \
  --execution-id <ENGRAM_EXECUTION_ID> \
  --job-id <JOB_ID> \
  --chain-id <CHAIN_ID> \
  --provider-id <PROVIDER_ADDRESS> \
  --task-type <TASK_TYPE> \
  --urgency URGENT \
  --expected-latency-seconds <SLA_SECONDS> \
  --started-at <ISO_TIMESTAMP> \
  --completed-at <ISO_TIMESTAMP> \
  --testnet
```

The command:
1. calls `acp job history ... --json`;
2. validates the current v2 history shape;
3. derives bounded observed evidence;
4. appends `VIRTUALS_ACP_JOB_OBSERVED` to the specified Sibyl-backed Engram execution;
5. emits a receipt that still labels the partner claim unverified until evidence is retained/audited.

## 8. Admit only what the evidence supports

One ACP interaction is an execution episode, not automatically a relationship memory.

For the flagship `CONTEXT_GUARDED` relationship posture, collect multiple attributable interactions or another justified evidence basis, then use Engram's multi-source admission path.

The existing acceptance rule intentionally rejects:
- a one-failure relationship posture;
- unrelated task-type transfer;
- expired memory;
- post-recall memory mutation.

## 9. Fresh-session consequence

After relationship memory is admitted to Sibyl:
1. terminate the requester process/session;
2. start a fresh comparable provider-selection execution;
3. recall the provider relationship memory;
4. show the memory-free candidate decision;
5. show the memory-conditioned ACP provider/terms decision;
6. execute the changed ACP interaction if practical;
7. retain Engram trace + ACP job IDs/history.

## 10. Promotion evidence

`VIRTUALS-001` can move above `UNVERIFIED` only when we have:
- authenticated testnet agent identity;
- real ACP provider/offering;
- real ACP job ID + chain ID;
- job history / terminal state;
- Engram execution observation sourced from that history;
- Sibyl memory derived from attributable ACP experience;
- fresh-session decision trace showing the memory's causal role;
- demo evidence that clearly shows the Virtuals-native interaction.

Until then, adapter/test code is implementation evidence only — not partner-stack proof.
