import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  type BaseSettlementIntent,
} from "./index.js";

export const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export type RpcLog = {
  address: string;
  topics: string[];
  data: string;
  transactionHash?: string;
  logIndex?: string;
};

export type RpcReceipt = {
  transactionHash: string;
  status: string;
  blockNumber: string;
  logs: RpcLog[];
};

export type BaseSettlementEvidence = {
  sourceSystem: "BASE";
  chainId: typeof BASE_SEPOLIA_CHAIN_ID;
  transactionHash: string;
  blockNumber: string;
  tokenAddress: typeof BASE_SEPOLIA_USDC;
  payer?: string;
  recipient: string;
  amountAtomic: string;
  executionId: string;
  retrievalId?: string;
  decisionId?: string;
  memoryRefs: string[];
  evidenceState: "OBSERVED";
};

function normalizedAddress(value: string): string {
  return value.toLowerCase();
}

function topicAddress(address: string): string {
  if (!ADDRESS_RE.test(address)) throw new Error("INVALID_BASE_ADDRESS");
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function addressFromTopic(topic: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(topic)) throw new Error("INVALID_BASE_ADDRESS_TOPIC");
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function parseHexUint(value: string): bigint {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) throw new Error("INVALID_BASE_UINT_HEX");
  return BigInt(value);
}

export function verifyBaseSettlementReceipt(input: {
  intent: BaseSettlementIntent;
  receipt: RpcReceipt;
  observedChainId?: number;
  expectedPayer?: string;
}): BaseSettlementEvidence {
  if (input.intent.chainId !== BASE_SEPOLIA_CHAIN_ID) throw new Error("BASE_CHAIN_MISMATCH");
  if (input.observedChainId !== undefined && input.observedChainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Error("BASE_RPC_CHAIN_MISMATCH");
  }
  if (normalizedAddress(input.intent.tokenAddress) !== normalizedAddress(BASE_SEPOLIA_USDC)) {
    throw new Error("BASE_TOKEN_MISMATCH");
  }
  if (input.receipt.status.toLowerCase() !== "0x1") throw new Error("BASE_TRANSACTION_NOT_SUCCESSFUL");
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.receipt.transactionHash)) throw new Error("INVALID_BASE_TRANSACTION_HASH");

  const expectedRecipientTopic = topicAddress(input.intent.recipient);
  const expectedPayerTopic = input.expectedPayer ? topicAddress(input.expectedPayer) : undefined;
  const expectedAmount = input.intent.terms.authorizedPrepayAtomic;
  const matching = input.receipt.logs.find((log) =>
    normalizedAddress(log.address) === normalizedAddress(BASE_SEPOLIA_USDC)
    && log.topics[0]?.toLowerCase() === ERC20_TRANSFER_TOPIC
    && log.topics[2]?.toLowerCase() === expectedRecipientTopic
    && (expectedPayerTopic === undefined || log.topics[1]?.toLowerCase() === expectedPayerTopic)
    && parseHexUint(log.data) === expectedAmount
  );

  if (!matching) throw new Error("BASE_USDC_TRANSFER_DOES_NOT_MATCH_INTENT");
  const observedPayer = matching.topics[1] ? addressFromTopic(matching.topics[1]) : undefined;

  return {
    sourceSystem: "BASE",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    transactionHash: input.receipt.transactionHash,
    blockNumber: input.receipt.blockNumber,
    tokenAddress: BASE_SEPOLIA_USDC,
    payer: observedPayer,
    recipient: input.intent.recipient,
    amountAtomic: expectedAmount.toString(),
    executionId: input.intent.provenance.executionId,
    retrievalId: input.intent.provenance.retrievalId,
    decisionId: input.intent.provenance.decisionId,
    memoryRefs: [...input.intent.memoryRefs],
    evidenceState: "OBSERVED",
  };
}

async function rpcCall<T>(input: {
  rpcUrl: string;
  method: string;
  params: unknown[];
  fetchImpl?: typeof fetch;
}): Promise<T> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(input.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: input.method, params: input.params }),
  });
  if (!response.ok) throw new Error(`BASE_RPC_HTTP_${response.status}`);
  const payload = await response.json() as { result?: T | null; error?: unknown };
  if (payload.error) throw new Error(`BASE_RPC_ERROR: ${JSON.stringify(payload.error)}`);
  if (payload.result === null || payload.result === undefined) {
    throw new Error(`BASE_RPC_RESULT_MISSING: ${input.method}`);
  }
  return payload.result;
}

export async function fetchBaseChainId(input: {
  rpcUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<number> {
  const result = await rpcCall<string>({ ...input, method: "eth_chainId", params: [] });
  const chainId = Number(parseHexUint(result));
  if (!Number.isSafeInteger(chainId)) throw new Error("INVALID_BASE_CHAIN_ID");
  return chainId;
}

export async function fetchBaseTransactionReceipt(input: {
  rpcUrl: string;
  transactionHash: string;
  fetchImpl?: typeof fetch;
}): Promise<RpcReceipt> {
  return rpcCall<RpcReceipt>({
    ...input,
    method: "eth_getTransactionReceipt",
    params: [input.transactionHash],
  });
}
