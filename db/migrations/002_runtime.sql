ALTER TABLE memory_retrieval_results
  ADD COLUMN IF NOT EXISTS exposed_to_agent BOOL NOT NULL DEFAULT false;

ALTER TABLE memory_retrieval_results
  ADD COLUMN IF NOT EXISTS rejection_reasons JSONB;

ALTER TABLE decision_memories
  ADD COLUMN IF NOT EXISTS counterfactual_source STRING;

ALTER TABLE decision_memories
  ADD COLUMN IF NOT EXISTS counterfactual_evidence_state STRING;

ALTER TABLE decision_memories
  ADD COLUMN IF NOT EXISTS counterfactual_explanation STRING;

ALTER TABLE decision_memories
  ADD COLUMN IF NOT EXISTS comparison_execution_id UUID;

CREATE TABLE IF NOT EXISTS runtime_evaluation_events (
  id UUID PRIMARY KEY,
  execution_id UUID NOT NULL REFERENCES executions(id),
  event_type STRING NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runtime_evaluation_events_execution_idx
  ON runtime_evaluation_events (execution_id, created_at);
