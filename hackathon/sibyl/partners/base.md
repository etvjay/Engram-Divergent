# Base Partner Contract

Class: `PUBLISHED_BONUS`

## Published qualification
A claimed Base stack counts only when judges can see it doing real work in the product. Deployment is the eligibility floor; an executed onchain action shown in the demo earns the partner bonus, including wallet operation, x402 payment, B20 read, or contract interaction.

## Engram fit
Base is the economic consequence layer for remembered provider experience:

```text
Virtuals/provider execution evidence
  -> Engram observation
  -> Sibyl relationship memory
  -> fresh Engram recall
  -> provider/authority decision changes
  -> Base settlement action changes
```

The evaluated Base profile is Base Sepolia (`84532`) using Circle USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.

## Flagship causal deltas

### Urgent
No-memory control selects Atlas. Applicable relationship memory selects Beacon.

The Base effect is a different settlement recipient.

### Routine
No-memory control selects Atlas with 50% prepayment on an $8 offer: `4.000000 USDC`.

Applicable relationship memory still selects Atlas but reduces prepayment to 10%: `0.800000 USDC`, while requiring milestone verification.

The Base effect is reduced economic authority, not a global provider blacklist.

## Local conformance
The current adapter and verifier are `LOCAL_CONFORMANCE_PASS` on tested code head `b6ffe6fcc824c20e8f41f2e64532ada3867c858d`:

- Engram CI `33264345953`: SUCCESS;
- canonical check job `99131636110`: SUCCESS;
- complete Sibyl profile job `99131636029`: SUCCESS;
- SAM Build `33264345950`: SUCCESS.

Local pressure proves:
- recipient and prepayment amount are derived from the Engram decision;
- serialized intent is schema-validated and amount-consistent;
- RPC chain must resolve to Base Sepolia `84532`;
- optional payer binding checks the USDC `Transfer.from` address;
- wrong recipient, amount, token, payer, chain, or reverted receipt fails closed.

This is not a live Base transaction and does not earn the partner bonus.

## Veto
Do not claim Base merely because a transaction receipt exists. The transaction must match the settlement intent derived from the remembered Engram decision.

## Required evidence
- Engram execution ID;
- recall/retrieval ID when memory influenced the decision;
- decision-linked `engram.base-settlement-intent/v1` serialized intent;
- expected requester/payer wallet when payer binding is claimed;
- RPC-observed chain ID `84532`;
- protocol-native Base transaction hash and successful receipt;
- observed Circle USDC transfer payer/recipient/amount matching the intent;
- action visible in the demo;
- counterfactual showing what recipient/amount would have been authorized without memory.

## Acceptance test
`BASE-001` may promote only when a real Base Sepolia action proves:

`remembered decision == authorized settlement intent == observed onchain settlement`.

A transaction hash alone is insufficient.

## Negative tests
- remove memory: recipient/amount must revert to the control settlement;
- malformed or internally inconsistent serialized intent: reject;
- wrong RPC chain: reject;
- wrong payer when bound: reject;
- alter provider address: reject wrong recipient;
- alter prepayment amount: reject wrong amount;
- wrong token or reverted transaction: reject;
- remove Base action: no Base partner claim remains.

Status: `IMPLEMENTED / LOCAL_CONFORMANCE_PASS / LIVE_BASE_UNVERIFIED`.
