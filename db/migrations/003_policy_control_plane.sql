CREATE TABLE IF NOT EXISTS memory_policy_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_version STRING NOT NULL UNIQUE,
  contract_version STRING NOT NULL,
  description STRING,
  definition JSONB NOT NULL,
  status STRING NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS memory_policy_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_bundle_id UUID NOT NULL REFERENCES memory_policy_bundles(id),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  workflow_type STRING,
  environment_version STRING,
  priority INT8 NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS memory_policy_assignments_resolution_idx
  ON memory_policy_assignments (agent_id, workflow_type, environment_version, priority DESC, valid_from DESC);

CREATE INDEX IF NOT EXISTS memory_policy_bundles_status_idx
  ON memory_policy_bundles (status, created_at DESC);

ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS memory_policy_bundle_version STRING;

CREATE INDEX IF NOT EXISTS executions_memory_policy_bundle_idx
  ON executions (memory_policy_bundle_version, started_at DESC);
