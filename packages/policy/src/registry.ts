import type { MemoryPolicyBundle, MemoryPolicyScope } from "./contracts.js";

export type PolicyBundleStatus = "DRAFT" | "ACTIVE" | "RETIRED";

export type RegisteredMemoryPolicyBundle = {
  id: string;
  bundle: MemoryPolicyBundle;
  status: PolicyBundleStatus;
  createdAt: Date;
  activatedAt?: Date;
  retiredAt?: Date;
};

export type MemoryPolicyAssignment = {
  id: string;
  bundleVersion: string;
  scope: MemoryPolicyScope;
  priority: number;
  validFrom: Date;
  validUntil?: Date;
};

export type PolicyResolutionContext = {
  agentId: string;
  workflowType: string;
  environmentVersion?: string;
  at?: Date;
};

export interface MemoryPolicyRegistry {
  register(bundle: MemoryPolicyBundle, status?: "DRAFT" | "ACTIVE"): Promise<RegisteredMemoryPolicyBundle>;
  get(bundleVersion: string): Promise<RegisteredMemoryPolicyBundle | null>;
  activate(bundleVersion: string): Promise<RegisteredMemoryPolicyBundle>;
  retire(bundleVersion: string): Promise<RegisteredMemoryPolicyBundle>;
  assign(input: {
    bundleVersion: string;
    scope?: MemoryPolicyScope;
    priority?: number;
    validFrom?: Date;
    validUntil?: Date;
  }): Promise<MemoryPolicyAssignment>;
  resolve(context: PolicyResolutionContext): Promise<RegisteredMemoryPolicyBundle | null>;
}
