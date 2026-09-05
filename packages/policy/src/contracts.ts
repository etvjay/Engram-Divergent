import { z } from "zod";
import { EvidenceStateSchema } from "../../core/src/protocol.js";

export const MEMORY_POLICY_CONTRACT_VERSION = "engram.memory-policy/v1" as const;

export const AdmissionPolicySchema = z.object({
  contractVersion: z.literal(MEMORY_POLICY_CONTRACT_VERSION),
  policyVersion: z.string().min(1),
  admitOn: z.array(z.enum([
    "UNEXPECTED_FAILURE",
    "SUCCESSFUL_RECOVERY",
    "POLICY_VIOLATION",
    "HUMAN_CORRECTION",
    "SAFETY_INTERVENTION",
    "SIGNIFICANT_COST",
    "NOVEL_CONDITION",
    "REPEATED_PATTERN",
  ])).min(1),
  minimumEvidence: EvidenceStateSchema.default("OBSERVED"),
});

export const RetrievalPolicySchema = z.object({
  contractVersion: z.literal(MEMORY_POLICY_CONTRACT_VERSION),
  policyVersion: z.string().min(1),
  maxCandidates: z.number().int().positive().max(100),
  minimumScore: z.number().min(0).max(1),
  requireEnvironmentMatch: z.boolean().default(false),
  allowExpired: z.boolean().default(false),
});

export const InfluencePolicySchema = z.object({
  contractVersion: z.literal(MEMORY_POLICY_CONTRACT_VERSION),
  policyVersion: z.string().min(1),
  allowedEvidenceStates: z.array(EvidenceStateSchema).min(1),
  minimumConfidence: z.number().min(0).max(1),
  requireCounterfactualForChangedAction: z.boolean().default(true),
});

export const ExpiryPolicySchema = z.object({
  contractVersion: z.literal(MEMORY_POLICY_CONTRACT_VERSION),
  policyVersion: z.string().min(1),
  invalidateOnEnvironmentChange: z.boolean().default(true),
  invalidateOnToolMajorVersionChange: z.boolean().default(false),
  maxAgeSeconds: z.number().int().positive().optional(),
});

export const MemoryPolicyBundleSchema = z.object({
  contractVersion: z.literal(MEMORY_POLICY_CONTRACT_VERSION),
  bundleVersion: z.string().min(1),
  admission: AdmissionPolicySchema,
  retrieval: RetrievalPolicySchema,
  influence: InfluencePolicySchema,
  expiry: ExpiryPolicySchema,
  description: z.string().optional(),
});

export const MemoryPolicyScopeSchema = z.object({
  agentId: z.string().min(1).optional(),
  workflowType: z.string().min(1).optional(),
  environmentVersion: z.string().min(1).optional(),
});

export type AdmissionPolicy = z.infer<typeof AdmissionPolicySchema>;
export type RetrievalPolicy = z.infer<typeof RetrievalPolicySchema>;
export type InfluencePolicy = z.infer<typeof InfluencePolicySchema>;
export type ExpiryPolicy = z.infer<typeof ExpiryPolicySchema>;
export type MemoryPolicyBundle = z.infer<typeof MemoryPolicyBundleSchema>;
export type MemoryPolicyScope = z.infer<typeof MemoryPolicyScopeSchema>;
