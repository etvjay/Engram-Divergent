import type pg from "pg";
import {
  MemoryPolicyBundleSchema,
  MemoryPolicyScopeSchema,
  type MemoryPolicyBundle,
} from "../../policy/src/contracts.js";
import type {
  MemoryPolicyAssignment,
  MemoryPolicyRegistry,
  PolicyResolutionContext,
  RegisteredMemoryPolicyBundle,
} from "../../policy/src/registry.js";

function json(value: unknown): string {
  return JSON.stringify(value);
}

export class CockroachMemoryPolicyRegistry implements MemoryPolicyRegistry {
  constructor(private readonly pool: pg.Pool) {}

  async register(
    input: MemoryPolicyBundle,
    status: "DRAFT" | "ACTIVE" = "DRAFT",
  ): Promise<RegisteredMemoryPolicyBundle> {
    const bundle = MemoryPolicyBundleSchema.parse(input);
    await this.pool.query(
      `INSERT INTO memory_policy_bundles
         (bundle_version, contract_version, description, definition, status, activated_at)
       VALUES ($1,$2,$3,$4::JSONB,$5,CASE WHEN $5='ACTIVE' THEN now() ELSE NULL END)
       ON CONFLICT (bundle_version) DO NOTHING`,
      [bundle.bundleVersion, bundle.contractVersion, bundle.description ?? null, json(bundle), status],
    );

    const existing = await this.get(bundle.bundleVersion);
    if (!existing) throw new Error(`Failed to register memory policy bundle ${bundle.bundleVersion}`);
    if (json(existing.bundle) !== json(bundle)) {
      throw new Error(`POLICY_VERSION_IMMUTABLE: ${bundle.bundleVersion} is already registered with a different definition`);
    }
    return existing;
  }

  async get(bundleVersion: string): Promise<RegisteredMemoryPolicyBundle | null> {
    const result = await this.pool.query<{
      id: string;
      definition: unknown;
      status: RegisteredMemoryPolicyBundle["status"];
      created_at: Date;
      activated_at: Date | null;
      retired_at: Date | null;
    }>(
      `SELECT id, definition, status, created_at, activated_at, retired_at
         FROM memory_policy_bundles
        WHERE bundle_version=$1`,
      [bundleVersion],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      bundle: MemoryPolicyBundleSchema.parse(row.definition),
      status: row.status,
      createdAt: row.created_at,
      activatedAt: row.activated_at ?? undefined,
      retiredAt: row.retired_at ?? undefined,
    };
  }

  async activate(bundleVersion: string): Promise<RegisteredMemoryPolicyBundle> {
    const result = await this.pool.query(
      `UPDATE memory_policy_bundles
          SET status='ACTIVE', activated_at=COALESCE(activated_at, now())
        WHERE bundle_version=$1 AND status <> 'RETIRED'
        RETURNING id`,
      [bundleVersion],
    );
    if (result.rowCount !== 1) {
      const existing = await this.get(bundleVersion);
      if (!existing) throw new Error(`Memory policy bundle ${bundleVersion} does not exist`);
      if (existing.status === "RETIRED") throw new Error(`Retired memory policy bundle ${bundleVersion} cannot be reactivated`);
      throw new Error(`Failed to activate memory policy bundle ${bundleVersion}`);
    }
    return (await this.get(bundleVersion))!;
  }

  async retire(bundleVersion: string): Promise<RegisteredMemoryPolicyBundle> {
    const result = await this.pool.query(
      `UPDATE memory_policy_bundles
          SET status='RETIRED', retired_at=COALESCE(retired_at, now())
        WHERE bundle_version=$1
        RETURNING id`,
      [bundleVersion],
    );
    if (result.rowCount !== 1) throw new Error(`Memory policy bundle ${bundleVersion} does not exist`);
    return (await this.get(bundleVersion))!;
  }

  async assign(input: {
    bundleVersion: string;
    scope?: { agentId?: string; workflowType?: string; environmentVersion?: string };
    priority?: number;
    validFrom?: Date;
    validUntil?: Date;
  }): Promise<MemoryPolicyAssignment> {
    const scope = MemoryPolicyScopeSchema.parse(input.scope ?? {});
    const bundle = await this.get(input.bundleVersion);
    if (!bundle) throw new Error(`Memory policy bundle ${input.bundleVersion} does not exist`);
    if (bundle.status !== "ACTIVE") throw new Error(`Memory policy bundle ${input.bundleVersion} must be ACTIVE before assignment`);
    if (input.validUntil && input.validFrom && input.validUntil <= input.validFrom) {
      throw new Error("Policy assignment validUntil must be after validFrom");
    }

    let agentDatabaseId: string | null = null;
    if (scope.agentId) {
      const agent = await this.pool.query<{ id: string }>(
        `SELECT id FROM agents WHERE external_id=$1`,
        [scope.agentId],
      );
      agentDatabaseId = agent.rows[0]?.id ?? null;
      if (!agentDatabaseId) throw new Error(`Agent ${scope.agentId} does not exist`);
    }

    const result = await this.pool.query<{
      id: string;
      priority: string;
      valid_from: Date;
      valid_until: Date | null;
    }>(
      `INSERT INTO memory_policy_assignments
         (policy_bundle_id, agent_id, workflow_type, environment_version, priority, valid_from, valid_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, priority, valid_from, valid_until`,
      [
        bundle.id,
        agentDatabaseId,
        scope.workflowType ?? null,
        scope.environmentVersion ?? null,
        input.priority ?? 0,
        input.validFrom ?? new Date(),
        input.validUntil ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Failed to create memory policy assignment");
    return {
      id: row.id,
      bundleVersion: input.bundleVersion,
      scope,
      priority: Number(row.priority),
      validFrom: row.valid_from,
      validUntil: row.valid_until ?? undefined,
    };
  }

  async resolve(context: PolicyResolutionContext): Promise<RegisteredMemoryPolicyBundle | null> {
    const at = context.at ?? new Date();
    const result = await this.pool.query<{
      id: string;
      definition: unknown;
      status: RegisteredMemoryPolicyBundle["status"];
      created_at: Date;
      activated_at: Date | null;
      retired_at: Date | null;
    }>(
      `SELECT pb.id, pb.definition, pb.status, pb.created_at, pb.activated_at, pb.retired_at
         FROM memory_policy_assignments pa
         JOIN memory_policy_bundles pb ON pb.id=pa.policy_bundle_id
         LEFT JOIN agents a ON a.id=pa.agent_id
        WHERE pb.status='ACTIVE'
          AND (pa.agent_id IS NULL OR a.external_id=$1)
          AND (pa.workflow_type IS NULL OR pa.workflow_type=$2)
          AND (pa.environment_version IS NULL OR pa.environment_version=$3)
          AND pa.valid_from <= $4
          AND (pa.valid_until IS NULL OR pa.valid_until > $4)
        ORDER BY pa.priority DESC,
                 (CASE WHEN pa.agent_id IS NOT NULL THEN 1 ELSE 0 END
                  + CASE WHEN pa.workflow_type IS NOT NULL THEN 1 ELSE 0 END
                  + CASE WHEN pa.environment_version IS NOT NULL THEN 1 ELSE 0 END) DESC,
                 pa.valid_from DESC,
                 pa.id DESC
        LIMIT 1`,
      [context.agentId, context.workflowType, context.environmentVersion ?? null, at],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      bundle: MemoryPolicyBundleSchema.parse(row.definition),
      status: row.status,
      createdAt: row.created_at,
      activatedAt: row.activated_at ?? undefined,
      retiredAt: row.retired_at ?? undefined,
    };
  }
}
