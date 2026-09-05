import { describe, expect, it } from "vitest";
import {
  deriveBaseSettlementIntent,
  parseSerializedBaseSettlementIntent,
  serializeBaseSettlementIntent,
} from "../../packages/base-settlement/src/index.js";
import {
  ERC20_TRANSFER_TOPIC,
  verifyBaseSettlementReceipt,
  type RpcReceipt,
} from "../../packages/base-settlement/src/evidence.js";
import type { ProviderDecision } from "../../packages/scenarios/provider-continuity/src/index.js";

const atlas = "0x1111111111111111111111111111111111111111";
const beacon = "0x2222222222222222222222222222222222222222";
const sender = "0x3333333333333333333333333333333333333333";
const wrongSender = "0x5555555555555555555555555555555555555555";
const txHash = `0x${"ab".repeat(32)}`;

function topic(address: string): string {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function receipt(input: {
  recipient: string;
  amount: bigint;
  status?: string;
  token?: string;
  payer?: string;
}): RpcReceipt {
  return {
    transactionHash: txHash,
    status: input.status ?? "0x1",
    blockNumber: "0x1234",
    logs: [{
      address: input.token ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      topics: [ERC20_TRANSFER_TOPIC, topic(input.payer ?? sender), topic(input.recipient)],
      data: `0x${input.amount.toString(16).padStart(64, "0")}`,
      transactionHash: txHash,
      logIndex: "0x0",
    }],
  };
}

function routineDecision(): ProviderDecision {
  return {
    providerId: "atlas",
    terms: {
      prepayBps: 1000,
      requireMilestoneVerification: true,
      maxSpendUsd: 8,
    },
    memoryRefs: ["memory-atlas-guarded"],
    reason: "Prior experience constrains authority.",
    counterfactual: {
      providerId: "atlas",
      terms: {
        prepayBps: 5000,
        requireMilestoneVerification: false,
        maxSpendUsd: 8,
      },
    },
  };
}

function intent() {
  return deriveBaseSettlementIntent({
    decision: routineDecision(),
    addresses: { atlas, beacon },
    provenance: {
      executionId: "exec-routine",
      retrievalId: "retrieval-routine",
      decisionId: "decision-routine",
    },
  });
}

describe("Base settlement receipt evidence", () => {
  it("accepts only a successful USDC Transfer matching chain, payer, recipient and amount", () => {
    const evidence = verifyBaseSettlementReceipt({
      intent: intent(),
      receipt: receipt({ recipient: atlas, amount: 800_000n }),
      observedChainId: 84532,
      expectedPayer: sender,
    });

    expect(evidence).toMatchObject({
      sourceSystem: "BASE",
      chainId: 84532,
      transactionHash: txHash,
      payer: sender,
      recipient: atlas,
      amountAtomic: "800000",
      executionId: "exec-routine",
      retrievalId: "retrieval-routine",
      decisionId: "decision-routine",
      memoryRefs: ["memory-atlas-guarded"],
      evidenceState: "OBSERVED",
    });
  });

  it("round-trips a serialized intent and rejects internally inconsistent amounts", () => {
    const serialized = serializeBaseSettlementIntent(intent());
    expect(parseSerializedBaseSettlementIntent(serialized).terms.authorizedPrepayAtomic).toBe(800_000n);

    expect(() => parseSerializedBaseSettlementIntent({
      ...serialized,
      terms: { ...serialized.terms, authorizedPrepayAtomic: "4000000" },
    })).toThrow("BASE_SETTLEMENT_INTENT_AMOUNT_INCONSISTENT");
    expect(() => parseSerializedBaseSettlementIntent({ ...serialized, chainId: 1 })).toThrow();
  });

  it("rejects a successful transfer to the wrong provider", () => {
    expect(() => verifyBaseSettlementReceipt({
      intent: intent(),
      receipt: receipt({ recipient: beacon, amount: 800_000n }),
      observedChainId: 84532,
    })).toThrow("BASE_USDC_TRANSFER_DOES_NOT_MATCH_INTENT");
  });

  it("rejects the no-memory prepayment amount when memory authorized only the guarded amount", () => {
    expect(() => verifyBaseSettlementReceipt({
      intent: intent(),
      receipt: receipt({ recipient: atlas, amount: 4_000_000n }),
      observedChainId: 84532,
    })).toThrow("BASE_USDC_TRANSFER_DOES_NOT_MATCH_INTENT");
  });

  it("rejects a receipt fetched from the wrong chain", () => {
    expect(() => verifyBaseSettlementReceipt({
      intent: intent(),
      receipt: receipt({ recipient: atlas, amount: 800_000n }),
      observedChainId: 1,
    })).toThrow("BASE_RPC_CHAIN_MISMATCH");
  });

  it("rejects a transfer whose payer is not the expected requester wallet", () => {
    expect(() => verifyBaseSettlementReceipt({
      intent: intent(),
      receipt: receipt({ recipient: atlas, amount: 800_000n, payer: wrongSender }),
      observedChainId: 84532,
      expectedPayer: sender,
    })).toThrow("BASE_USDC_TRANSFER_DOES_NOT_MATCH_INTENT");
  });

  it("rejects reverted transactions and transfers from the wrong token contract", () => {
    expect(() => verifyBaseSettlementReceipt({
      intent: intent(),
      receipt: receipt({ recipient: atlas, amount: 800_000n, status: "0x0" }),
      observedChainId: 84532,
    })).toThrow("BASE_TRANSACTION_NOT_SUCCESSFUL");
    expect(() => verifyBaseSettlementReceipt({
      intent: intent(),
      receipt: receipt({
        recipient: atlas,
        amount: 800_000n,
        token: "0x4444444444444444444444444444444444444444",
      }),
      observedChainId: 84532,
    })).toThrow("BASE_USDC_TRANSFER_DOES_NOT_MATCH_INTENT");
  });
});
