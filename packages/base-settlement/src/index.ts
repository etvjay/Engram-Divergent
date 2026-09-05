import { z } from "zod";
import type {
  ProviderDecision,
  ProviderId,
  ProviderTerms,
} from "../../scenarios/provider-continuity/src/index.js";

export const BASE_SEPOLIA_CHAIN_ID = 84_532;
export const BASE_SEPOLIA_NETWORK = "base-sepolia" as const;
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const USDC_DECIMALS = 6;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const AddressSchema = z.string().regex(ADDRESS_RE);
const DecimalAtomicSchema = z.string().regex(/^\d+$/);
const UsdcDecimalSchema = z.string().regex(/^\d+\.\d{6}$/);
const ProviderIdSchema = z.enum(["atlas", "beacon"]);

export type ProviderAddressBook = Record<ProviderId, string>;

export type SettlementProvenance = {
  executionId: string;
  retrievalId?: string;
  decisionId?: string;
};

export type BaseSettlementTerms = {
  maxSpendUsd: number;
  prepayBps: number;
  authorizedPrepayAtomic: bigint;
  authorizedPrepayUsd: string;
  requireMilestoneVerification: boolean;
};

export type BaseSettlementCounterfactual = {
  providerId: ProviderId;
  recipient: string;
  terms: BaseSettlementTerms;
};

export type BaseSettlementIntent = {
  schema: "engram.base-settlement-intent/v1";
  chainId: typeof BASE_SEPOLIA_CHAIN_ID;
  network: typeof BASE_SEPOLIA_NETWORK;
  token: "USDC";
  tokenAddress: typeof BASE_SEPOLIA_USDC;
  providerId: ProviderId;
  recipient: string;
  terms: BaseSettlementTerms;
  memoryRefs: string[];
  provenance: SettlementProvenance;
  counterfactual?: BaseSettlementCounterfactual;
};

export type SerializedBaseSettlementIntent = Omit<BaseSettlementIntent, "terms" | "counterfactual"> & {
  terms: Omit<BaseSettlementTerms, "authorizedPrepayAtomic"> & { authorizedPrepayAtomic: string };
  counterfactual?: Omit<BaseSettlementCounterfactual, "terms"> & {
    terms: Omit<BaseSettlementTerms, "authorizedPrepayAtomic"> & { authorizedPrepayAtomic: string };
  };
};

const SerializedTermsSchema = z.object({
  maxSpendUsd: z.number().finite().nonnegative(),
  prepayBps: z.number().int().min(0).max(10_000),
  authorizedPrepayAtomic: DecimalAtomicSchema,
  authorizedPrepayUsd: UsdcDecimalSchema,
  requireMilestoneVerification: z.boolean(),
}).strict();

const SerializedIntentSchema = z.object({
  schema: z.literal("engram.base-settlement-intent/v1"),
  chainId: z.literal(BASE_SEPOLIA_CHAIN_ID),
  network: z.literal(BASE_SEPOLIA_NETWORK),
  token: z.literal("USDC"),
  tokenAddress: z.literal(BASE_SEPOLIA_USDC),
  providerId: ProviderIdSchema,
  recipient: AddressSchema,
  terms: SerializedTermsSchema,
  memoryRefs: z.array(z.string().min(1)),
  provenance: z.object({
    executionId: z.string().min(1),
    retrievalId: z.string().min(1).optional(),
    decisionId: z.string().min(1).optional(),
  }).strict(),
  counterfactual: z.object({
    providerId: ProviderIdSchema,
    recipient: AddressSchema,
    terms: SerializedTermsSchema,
  }).strict().optional(),
}).strict();

function assertAddress(address: string, label: string): string {
  if (!ADDRESS_RE.test(address)) throw new Error(`INVALID_${label.toUpperCase()}_ADDRESS`);
  return address;
}

function usdToUsdcAtomic(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) throw new Error("INVALID_USD_AMOUNT");
  const scaled = Math.round(value * 1_000_000);
  if (Math.abs((scaled / 1_000_000) - value) > 1e-9) {
    throw new Error("USD_AMOUNT_EXCEEDS_USDC_PRECISION");
  }
  return BigInt(scaled);
}

export function usdcAtomicToDecimal(value: bigint): string {
  if (value < 0n) throw new Error("NEGATIVE_USDC_AMOUNT");
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${fraction}`;
}

function settlementTerms(terms: ProviderTerms): BaseSettlementTerms {
  if (!Number.isInteger(terms.prepayBps) || terms.prepayBps < 0 || terms.prepayBps > 10_000) {
    throw new Error("INVALID_PREPAY_BPS");
  }
  const maxSpendAtomic = usdToUsdcAtomic(terms.maxSpendUsd);
  const authorizedPrepayAtomic = (maxSpendAtomic * BigInt(terms.prepayBps)) / 10_000n;
  return {
    maxSpendUsd: terms.maxSpendUsd,
    prepayBps: terms.prepayBps,
    authorizedPrepayAtomic,
    authorizedPrepayUsd: usdcAtomicToDecimal(authorizedPrepayAtomic),
    requireMilestoneVerification: terms.requireMilestoneVerification,
  };
}

function assertSerializedTermsConsistent(terms: SerializedBaseSettlementIntent["terms"]): void {
  const expectedMaxSpendAtomic = usdToUsdcAtomic(terms.maxSpendUsd);
  const expectedPrepayAtomic = (expectedMaxSpendAtomic * BigInt(terms.prepayBps)) / 10_000n;
  if (BigInt(terms.authorizedPrepayAtomic) !== expectedPrepayAtomic) {
    throw new Error("BASE_SETTLEMENT_INTENT_AMOUNT_INCONSISTENT");
  }
  if (terms.authorizedPrepayUsd !== usdcAtomicToDecimal(expectedPrepayAtomic)) {
    throw new Error("BASE_SETTLEMENT_INTENT_DECIMAL_INCONSISTENT");
  }
}

export function serializeBaseSettlementIntent(intent: BaseSettlementIntent): SerializedBaseSettlementIntent {
  return {
    ...intent,
    terms: {
      ...intent.terms,
      authorizedPrepayAtomic: intent.terms.authorizedPrepayAtomic.toString(),
    },
    counterfactual: intent.counterfactual ? {
      ...intent.counterfactual,
      terms: {
        ...intent.counterfactual.terms,
        authorizedPrepayAtomic: intent.counterfactual.terms.authorizedPrepayAtomic.toString(),
      },
    } : undefined,
  };
}

export function parseSerializedBaseSettlementIntent(input: unknown): BaseSettlementIntent {
  const parsed = SerializedIntentSchema.parse(input) as SerializedBaseSettlementIntent;
  assertSerializedTermsConsistent(parsed.terms);
  if (parsed.counterfactual) assertSerializedTermsConsistent(parsed.counterfactual.terms);

  return {
    ...parsed,
    terms: {
      ...parsed.terms,
      authorizedPrepayAtomic: BigInt(parsed.terms.authorizedPrepayAtomic),
    },
    counterfactual: parsed.counterfactual ? {
      ...parsed.counterfactual,
      terms: {
        ...parsed.counterfactual.terms,
        authorizedPrepayAtomic: BigInt(parsed.counterfactual.terms.authorizedPrepayAtomic),
      },
    } : undefined,
  };
}

export function deriveBaseSettlementIntent(input: {
  decision: ProviderDecision;
  addresses: ProviderAddressBook;
  provenance: SettlementProvenance;
}): BaseSettlementIntent {
  const recipient = assertAddress(input.addresses[input.decision.providerId], "provider");
  const counterfactual = input.decision.counterfactual
    ? {
      providerId: input.decision.counterfactual.providerId,
      recipient: assertAddress(input.addresses[input.decision.counterfactual.providerId], "counterfactual_provider"),
      terms: settlementTerms(input.decision.counterfactual.terms),
    }
    : undefined;

  return {
    schema: "engram.base-settlement-intent/v1",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    network: BASE_SEPOLIA_NETWORK,
    token: "USDC",
    tokenAddress: BASE_SEPOLIA_USDC,
    providerId: input.decision.providerId,
    recipient,
    terms: settlementTerms(input.decision.terms),
    memoryRefs: [...input.decision.memoryRefs],
    provenance: input.provenance,
    counterfactual,
  };
}
