CREATE TABLE IF NOT EXISTS memory_evaluations (
  id UUID PRIMARY KEY,
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  influenced_execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  influenced_decision_id UUID REFERENCES decisions(id) ON DELETE SET NULL,
  baseline_execution_id UUID REFERENCES executions(id) ON DELETE SET NULL,
  method STRING NOT NULL CHECK (method IN ('CONTROL_RUN','SHADOW_RUN','REPLAY','HUMAN_ASSESSMENT','OBSERVATIONAL')),
  effect STRING NOT NULL CHECK (effect IN ('BENEFICIAL','HARMFUL','NEUTRAL','UNKNOWN')),
  effect_score FLOAT8 CHECK (effect_score IS NULL OR (effect_score >= -1 AND effect_score <= 1)),
  rationale STRING NOT NULL,
  evidence_state STRING NOT NULL CHECK (evidence_state IN ('VERIFIED','OBSERVED','SIMULATED','INFERRED','PROPOSED','UNKNOWN')),
  controlled_variables JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  evaluated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_evaluations_memory_idx
  ON memory_evaluations (memory_id, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS memory_relationships (
  id UUID PRIMARY KEY,
  left_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  right_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  relation STRING NOT NULL CHECK (relation IN ('CONTRADICTS','QUALIFIES','SUPERSEDES','INDEPENDENT','UNKNOWN')),
  rationale STRING NOT NULL,
  evidence_state STRING NOT NULL CHECK (evidence_state IN ('VERIFIED','OBSERVED','SIMULATED','INFERRED','PROPOSED','UNKNOWN')),
  method STRING NOT NULL CHECK (method IN ('RULE','HUMAN_ASSESSMENT','EVALUATOR','UNKNOWN')),
  assessed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (left_memory_id <> right_memory_id)
);

CREATE INDEX IF NOT EXISTS memory_relationships_left_idx
  ON memory_relationships (left_memory_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS memory_relationships_right_idx
  ON memory_relationships (right_memory_id, assessed_at DESC);

CREATE TABLE IF NOT EXISTS counterfactual_experiments (
  id UUID PRIMARY KEY,
  name STRING NOT NULL,
  control_execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  treatment_execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  controlled_variables JSONB NOT NULL,
  action_changed BOOL NOT NULL,
  control_action JSONB NOT NULL,
  treatment_action JSONB NOT NULL,
  control_outcome STRING NOT NULL,
  treatment_outcome STRING NOT NULL,
  conclusion STRING NOT NULL,
  evidence_state STRING NOT NULL CHECK (evidence_state IN ('VERIFIED','OBSERVED','SIMULATED','INFERRED','PROPOSED','UNKNOWN')),
  created_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (control_execution_id <> treatment_execution_id)
);

CREATE TABLE IF NOT EXISTS counterfactual_experiment_memories (
  experiment_id UUID NOT NULL REFERENCES counterfactual_experiments(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  PRIMARY KEY (experiment_id, memory_id)
);

CREATE INDEX IF NOT EXISTS counterfactual_experiment_memories_memory_idx
  ON counterfactual_experiment_memories (memory_id, experiment_id);
