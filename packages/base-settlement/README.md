# Base settlement consequence adapter

Status: `IMPLEMENTED / LOCAL_CONFORMANCE_PASS / LIVE_BASE_UNVERIFIED`

This package exists only to prove that a decision influenced by Sibyl memory can change an external economic action.

```text
execution evidence
  -> Sibyl memory
  -> fresh recall
  -> changed provider / terms
  -> Base settlement intent
  -> receipt verification
```

Sibyl remains the sole memory backend.

## Local consequence proof

For urgent work, recalled provider experience changes the recipient from Atlas to Beacon.

For routine work, the same memory keeps Atlas selected but reduces authorized prepayment from `4.000000 USDC` to `0.800000 USDC` and requires milestone verification.

Run:

```bash
npm run test:base
```

The suite rejects malformed addresses, inconsistent serialized amounts, wrong chain, payer, token, recipient, amount, and reverted receipts.

## Emit a settlement intent

```bash
ENGRAM_BASE_ATLAS_ADDRESS='<ATLAS_ADDRESS>' \
ENGRAM_BASE_BEACON_ADDRESS='<BEACON_ADDRESS>' \
ENGRAM_BASE_INTENT_OUT='artifacts/base/routine-intent.json' \
npm run demo:sibyl:provider:routine
```

The generated `engram.base-settlement-intent/v1` carries execution, retrieval, decision, and memory provenance from the fresh Sibyl-backed decision.

## Verify an executed transaction

```bash
ENGRAM_BASE_RPC_URL='<BASE_SEPOLIA_RPC>' \
  npm run base:settlement:verify -- \
  --intent <intent.json> \
  --tx-hash <0x...> \
  --payer <REQUESTER_WALLET>
```

The verifier is read-only. No signer key or wallet secret belongs in this repository.

`LIVE_BASE_UNVERIFIED` means no live Base partner claim should be made until an actual decision-linked transaction and receipt are retained.