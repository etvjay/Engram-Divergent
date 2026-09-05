# Base Live Settlement Proof

Status: `NOT_EXECUTED`

This runbook promotes Base only when an Engram memory-conditioned decision causes and matches a real Base Sepolia USDC action.

## Frozen evaluated network

- network: Base Sepolia
- chain ID: `84532`
- token: Circle USDC
- token address: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- decimals: `6`

Reverify these values from first-party Base/Circle documentation immediately before the official live run.

## Required causal chain

```text
execution evidence
  -> Sibyl memory
  -> fresh Engram recall
  -> Engram provider decision
  -> engram.base-settlement-intent/v1
  -> explicit wallet execution on Base Sepolia
  -> receipt
  -> chain + payer + USDC recipient + amount match
  -> engram.base-live-settlement-evidence/v1
```

A transaction hash without the preceding memory/decision linkage does not qualify.

## Build-window capture first

Run the canonical evidence capture before the live Base action:

```bash
npm run evidence:sibyl:capture
```

Capture v3 retains `base-routine-intent.json` inside the same artifact as the fresh Sibyl memory proof and binds it by SHA-256 in `manifest.json`.

The deterministic addresses used by local/CI capture are evidence fixtures only. For a partner-qualifying live action, rerun the fresh routine decision with the reviewed Base Sepolia provider addresses and retain that live intent alongside the build-window capture. Never sign a transaction against the deterministic fixture addresses.

## Live sequence

1. Start from a hackathon-window commit with green canonical CI.
2. Produce and retain the build-window Sibyl evidence bundle.
3. Run/ingest real provider execution evidence if the claim depends on an external provider/Virtuals interaction.
4. Form the relationship memory through normal Engram admission.
5. Terminate the originating process.
6. In a fresh process, recall the relationship memory and record the provider decision.
7. Emit the Base settlement intent directly from that fresh decision using reviewed provider addresses. The artifact must contain:
   - execution ID;
   - retrieval ID;
   - decision ID when available;
   - memory refs;
   - provider ID;
   - provider recipient address;
   - prepay basis points;
   - exact USDC atomic amount;
   - no-memory counterfactual when present.
8. Review the serialized intent before signing anything.
9. Record the requester/payer wallet address expected to execute the settlement.
10. Execute exactly that authorized USDC transfer with the selected testnet wallet/signer.
11. Retain the transaction hash. Never retain/export the private key in Engram evidence.
12. Verify independently and persist the verifier result:

```bash
ENGRAM_BASE_RPC_URL='<BASE_SEPOLIA_RPC>' \
  npm run base:settlement:verify -- \
  --intent artifacts/base/<intent>.json \
  --tx-hash <0x...> \
  --payer <REQUESTER_WALLET> \
  --out artifacts/base/base-live-settlement-evidence.json
```

13. The verifier independently calls `eth_chainId` and must observe `84532` before accepting the receipt.
14. Verification must fail unless the receipt:
   - was fetched from Base Sepolia;
   - succeeded;
   - contains a Circle Base Sepolia USDC `Transfer`;
   - originates from the expected requester/payer when payer binding is supplied;
   - transfers to the exact decision-derived recipient;
   - transfers the exact decision-derived amount.
15. The persisted verifier evidence must bind:
   - intent-file SHA-256;
   - execution/retrieval/decision provenance;
   - memory refs;
   - observed chain ID;
   - expected payer;
   - transaction hash and block number;
   - verified recipient and atomic amount.
16. Save the explorer link and raw receipt beside the persisted intent and `engram.base-live-settlement-evidence/v1` file.

## Flagship expected deltas

### Urgent
Control:
- provider: Atlas
- Base recipient: Atlas address

Memory-conditioned:
- provider: Beacon
- Base recipient: Beacon address

### Routine
Control:
- provider: Atlas
- max spend: $8
- prepay: 50%
- authorized initial transfer: `4.000000 USDC`

Memory-conditioned:
- provider: Atlas
- max spend: $8
- prepay: 10%
- authorized initial transfer: `0.800000 USDC`
- milestone verification: required

The routine case is the stronger Base authority proof because memory changes how much capital the same counterparty is permitted to receive, not merely which address is selected.

## Negative pressure

A live claim is invalid if any of these are true:
- serialized intent is malformed or internally inconsistent;
- RPC reports a chain other than `84532`;
- payer differs from the expected requester wallet when payer binding is claimed;
- recipient differs from the settlement intent;
- amount differs from the settlement intent;
- wrong token contract;
- reverted transaction;
- no retrieval/decision provenance;
- the live intent uses deterministic fixture addresses;
- transfer was executed independently of the Engram decision;
- only a screenshot is retained and raw transaction/evidence files are unavailable.

## Promotion

`BASE-001` remains `UNVERIFIED` until this sequence is executed during the eligible build window.

Local intent/receipt tests and capture-v3 artifacts support internal conformance only. They cannot promote the published Base partner gate.
