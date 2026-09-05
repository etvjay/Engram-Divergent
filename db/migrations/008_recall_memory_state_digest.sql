ALTER TABLE memory_retrieval_results
  ADD COLUMN IF NOT EXISTS memory_state_digest STRING;

COMMENT ON COLUMN memory_retrieval_results.memory_state_digest IS
  'Versioned digest of the authority-relevant Operational Memory state exposed by this retrieval result.';
