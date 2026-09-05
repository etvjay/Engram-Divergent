CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id STRING NOT NULL UNIQUE,
  name STRING,
  agent_version STRING,
  model STRING,
  runtime STRING,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  workflow_type STRING NOT NULL,
  intent STRING NOT NULL,
  context JSONB NOT NULL,
  constraints JSONB NOT NULL DEFAULT '{}'::JSONB,
  environment_version STRING,
  policy_version STRING,
  tool_version STRING,
  status STRING NOT NULL CHECK (status IN ('RUNNING','SUCCESS','FAILURE','PARTIAL','COMPENSATED','ABORTED','UNKNOWN','MEMORY_UNAVAILABLE')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS executions_agent_workflow_idx ON executions (agent_id, workflow_type, started_at DESC);

CREATE TABLE IF NOT EXISTS execution_events (
  id UUID PRIMARY KEY,
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  sequence_no INT8 NOT NULL,
  event_type STRING NOT NULL,
  payload JSONB NOT NULL,
  evidence_state STRING NOT NULL CHECK (evidence_state IN ('VERIFIED','OBSERVED','SIMULATED','INFERRED','PROPOSED','UNKNOWN')),
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (execution_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS outcomes (
  id UUID PRIMARY KEY,
  execution_id UUID NOT NULL UNIQUE REFERENCES executions(id) ON DELETE CASCADE,
  status STRING NOT NULL CHECK (status IN ('SUCCESS','FAILURE','PARTIAL','COMPENSATED','ABORTED','UNKNOWN')),
  failure_type STRING,
  summary STRING NOT NULL,
  result JSONB NOT NULL DEFAULT '{}'::JSONB,
  evidence_state STRING NOT NULL CHECK (evidence_state IN ('VERIFIED','OBSERVED','SIMULATED','INFERRED','PROPOSED','UNKNOWN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY,
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  decision_type STRING NOT NULL,
  selected_action JSONB NOT NULL,
  alternatives JSONB NOT NULL DEFAULT '[]'::JSONB,
  reasoning_summary STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES agents(id),
  memory_type STRING NOT NULL,
  summary STRING NOT NULL,
  structured_context JSONB NOT NULL,
  confidence FLOAT8 NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_state STRING NOT NULL CHECK (evidence_state IN ('VERIFIED','OBSERVED','SIMULATED','INFERRED','PROPOSED','UNKNOWN')),
  embedding VECTOR(1024),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  environment_version STRING,
  tool_version STRING,
  policy_version STRING,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memories_agent_created_idx ON memories (agent_id, created_at DESC);
CREATE VECTOR INDEX IF NOT EXISTS memories_embedding_idx ON memories (embedding);

CREATE TABLE IF NOT EXISTS memory_sources (
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  PRIMARY KEY (memory_id, execution_id)
);

CREATE TABLE IF NOT EXISTS memory_retrievals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID REFERENCES executions(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id),
  query STRING NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::JSONB,
  retrieval_policy_version STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_retrieval_results (
  retrieval_id UUID NOT NULL REFERENCES memory_retrievals(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  semantic_score FLOAT8 NOT NULL,
  context_score FLOAT8 NOT NULL,
  outcome_score FLOAT8 NOT NULL,
  confidence_score FLOAT8 NOT NULL,
  recency_score FLOAT8 NOT NULL,
  final_score FLOAT8 NOT NULL,
  rank INT8 NOT NULL,
  PRIMARY KEY (retrieval_id, memory_id),
  UNIQUE (retrieval_id, rank)
);

CREATE TABLE IF NOT EXISTS decision_memories (
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  retrieval_id UUID REFERENCES memory_retrievals(id) ON DELETE SET NULL,
  influence_type STRING NOT NULL,
  influence_summary STRING NOT NULL,
  relevance FLOAT8,
  counterfactual_action JSONB,
  PRIMARY KEY (decision_id, memory_id)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  artifact_type STRING NOT NULL,
  uri STRING NOT NULL,
  sha256 STRING,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
