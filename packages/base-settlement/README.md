# Base settlement authority adapter

Status: `IMPLEMENTED / LOCAL_CONFORMANCE_PASS / LIVE_BASE_UNVERIFIED`

This server-only package converts an Engram provider decision into a bounded Base Sepolia USDC settlement intent and independently verifies the resulting onchain receipt.

It exists to make remembered experience economically consequential rather than merely observable.

```text
prior execution evidence
  -> Engram relationship memory
  -> Sibyl persistence
  -> fresh Engram recall
  -> changed provider/terms
  -> serialized Base settlement authority
  -> explicit wallet execution
  -> Base receipt verification
```

## Current evaluated network

- network: Base Sepolia
- chain ID: `84532`
- asset: Circle USDC
- USDC contract: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- decimals: `6`

The contract address is pinned only for the evaluated testnet profile and must be reverified before the live hackathon run.

## Causal product role

### Urgent work
Without applicable memory, the application selects Atlas. With repeated Atlas SLA-breach memory, the fresh decision selects Beacon.

Base therefore receives a different settlement recipient downstream of memory.

### Routine work
Without memory, Atlas receives 50% prepayment authority on an $8 offer: `4.000000 USDC`.

With applicable relationship memory, Atlas remains selected but prepayment authority falls to 10%: `0.800000 USDC`, with milestone verification required.

Base therefore receives a smaller authorized economic action downstream of memory rather than a decorative transfer.

## Local conformance

Run:

```bash
npm run test:base
```

The local suite proves:

- urgent relationship memory changes settlement recipient Atlas -> Beacon;
- routine relationship memory changes authorized prepay `4.000000 -> 0.800000 USDC`;
- malformed provider addresses fail closed;
- serialized intents are strict-schema validated;
- serialized atomic/decimal amounts must recompute from max spend and prepay basis points;
- RPC chain must be Base Sepolia `84532` when chain evidence is supplied;
- expected payer may be bound to ERC-20 `Transfer.from`;
- wrong recipient, amount, token, payer, chain, or reverted transaction fails.

Strongest tested code head: `bd02738a57ebb4bde1bdc68bc5ff475b1bbdad64`.

- Engram CI `33264580330`: SUCCESS;
- canonical check `99132270601`: SUCCESS;
- full Sibyl profile `99132270544`: SUCCESS;
- SAM Build `33264580331`: SUCCESS.

Critically, the Sibyl profile now proves the cross-layer boundary directly. A fresh routine provider decision, after persisted relationship-memory recall, emitted a serialized Base settlement intent. CI parsed that artifact and required:

- provider: Atlas;
- authorized prepayment: `800000` atomic USDC;
- milestone verification: `true`;
- retrieval provenance: present.

So Base authority is not only tested in isolation; the judged fresh-memory path produces the exact artifact consumed by the live settlement verifier.

## Emitting an intent from the fresh provider decision

Provide provider addresses and an output path when running the fresh decision:

```bash
ENGRAM_BASE_ATLAS_ADDRESS='<ATLAS_ADDRESS>' \
ENGRAM_BASE_BEACON_ADDRESS='<BEACON_ADDRESS>' \
ENGRAM_BASE_INTENT_OUT='artifacts/base/routine-intent.json' \
npm run demo:sibyl:provider:routine
```

The demo writes `engram.base-settlement-intent/v1` directly from the memory-conditioned decision. No manual reconstruction of provider, amount, or retrieval provenance is required.

## Live verification

Once an explicit wallet step has executed the reviewed settlement intent:

```bash
ENGRAM_BASE_RPC_URL='<BASE_SEPOLIA_RPC>' \
  npm run base:settlement:verify -- \
  --intent <intent.json> \
  --tx-hash <0x...> \
  --payer <REQUESTER_WALLET>
```

The verifier:

1. strict-parses the serialized intent and recomputes its authorized amount;
2. independently calls `eth_chainId` and requires `84532`;
3. fetches `eth_getTransactionReceipt`;
4. emits Base evidence only if the successful Circle USDC `Transfer` matches expected payer when bound, exact recipient, and exact atomic amount.

## Evidence boundary

`LOCAL_CONFORMANCE_PASS` proves the causal settlement model, fresh-decision intent boundary, and fail-closed receipt verifier. It does **not** prove an executed Base transaction and does not earn the partner multiplier.

`BASE-001` remains `UNVERIFIED` until a real Base Sepolia action is executed and retained with:

- serialized decision-derived intent;
- transaction hash;
- independently observed chain ID;
- successful receipt;
- token transfer evidence matching payer when claimed, recipient and amount;
- Engram execution/retrieval/decision provenance;
- demonstration that removing or changing the remembered decision changes the Base action.

No private key, wallet secret, or signer material belongs in this package or repository.
