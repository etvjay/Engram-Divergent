# Virtuals ACP evidence adapter

Status: `IMPLEMENTED / LOCAL_CONFORMANCE_PASS / LIVE_ACP_UNVERIFIED`

This optional adapter turns Virtuals ACP job history into bounded execution evidence that Engram can observe before Sibyl persists any resulting memory.

```text
Virtuals ACP job/history
  -> normalized execution evidence
  -> Engram observation
  -> memory admission
  -> Sibyl persistence
  -> later Sibyl recall
```

Sibyl remains the sole memory backend and final memory state does not live in Virtuals.

## Local conformance

```bash
npm run test:virtuals
```

The tests check:

- expected ACP v2 history shape;
- no invented failure on successful work;
- SLA breach only when supplied timing evidence justifies it;
- rejected and expired jobs remain distinct terminal causes;
- malformed history fails closed.

## Live ingestion

The adapter targets:

```bash
acp job history --job-id <JOB_ID> --chain-id <CHAIN_ID> --json
```

A real job can be ingested with:

```bash
npm run virtuals:acp:ingest -- \
  --execution-id <EXECUTION_ID> \
  --job-id <JOB_ID> \
  --chain-id <CHAIN_ID> \
  --provider-id <PROVIDER_ID> \
  --task-type data_fetch \
  --urgency URGENT \
  --testnet
```

`LIVE_ACP_UNVERIFIED` means repository fixtures and local conformance do not establish a live partner claim. Promotion requires retained authenticated ACP job evidence that later contributes to a Sibyl-backed memory and a fresh decision.