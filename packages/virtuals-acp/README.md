# Virtuals ACP evidence adapter

Status: `IMPLEMENTED / LOCAL_CONFORMANCE_PASS / LIVE_ACP_UNVERIFIED`

This server-only package normalizes machine-readable output from the current Virtuals `@virtuals-protocol/acp-cli` into Engram execution evidence.

It does **not** let Virtuals decide Engram memory semantics. The boundary is:

```text
Virtuals ACP job/history
  -> normalize observed job evidence
  -> Engram observation
  -> Engram admission / eligibility / influence
  -> Sibyl persistent memory
```

## Current first-party CLI contract
The adapter targets the maintained `@virtuals-protocol/acp-cli` v2 history command:

```bash
acp job history --job-id <JOB_ID> --chain-id <CHAIN_ID> --json
```

The CLI currently emits a JSON object containing `jobId`, `chainId`, `protocol`, `status`, `entryCount`, and `entries` for v2 jobs. Every ACP CLI command supports `--json`.

Testnet is selected globally:

```bash
export IS_TESTNET=true
```

The deterministic conformance fixture uses Base Sepolia chain ID `84532`, which is exposed by the current Virtuals CLI chain configuration. The fixture is synthetic and can never promote the partner evidence state above local conformance.

## Example

```ts
import {
  acpHistoryToExecutionEvidence,
  acpEvidenceToEngramObservation,
} from "./src/evidence.js";

const evidence = acpHistoryToExecutionEvidence(jobHistoryJson, {
  providerId: "0xProvider",
  taskType: "data_fetch",
  urgency: "URGENT",
  expectedLatencySeconds: 30,
  startedAt,
  completedAt,
});

await runtime.observe({
  executionId,
  ...acpEvidenceToEngramObservation(evidence),
});
```

## Local conformance pressure

Run:

```bash
npm run test:virtuals
```

The suite checks:

- current v2 history shape (`jobId`, `chainId`, `protocol`, `status`, `entryCount`, `entries`);
- no invented failure on an on-time completed job;
- `SLA_BREACH` only when explicit expected latency and observed timestamps justify it;
- `rejected` and `expired` remain distinct failure classes;
- malformed or invalid history fails closed.

Fixture:

```text
tests/fixtures/virtuals-acp/completed-job-history.json
```

Test:

```text
tests/integration/virtuals-acp-evidence.test.ts
```

Current conformance state is `LOCAL_CONFORMANCE_PASS`: the adapter suite is included by the repository's canonical `npm run test:all` / `npm run check` path and has passed in CI. This is code-contract evidence only; it is not evidence of a real ACP interaction.

## Evidence boundary
- ACP job history is treated as `OBSERVED` external-system evidence only when it comes from the live ACP command. A repository fixture is `SIMULATED_PASS`/local conformance evidence, never live partner evidence.
- SLA breach classification requires caller-supplied expected latency plus observed start/completion timestamps; the adapter does not invent SLA expectations from provider reputation.
- `rejected` and `expired` jobs are preserved as distinct failure classes and take causal precedence over a derived latency classification.
- Raw parsed history is retained in the normalized evidence object for audit/debugging, but the Engram observation records only bounded fields plus a provenance command reference.

## Live-proof gate
This package is not evidence that the Virtuals partner multiplier has been earned.

Promotion requires an actual authenticated ACP testnet flow with a real job/agent interaction, retained job ID/chain ID/history, and a later Engram/Sibyl decision whose behavior changes because of that prior ACP experience.
