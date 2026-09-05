-- Engram retrieval is always scoped by agent_id and ranks with cosine distance (<=>).
-- Prefix columns keep one agent's vector search isolated within the C-SPANN
-- index, while vector_cosine_ops matches the production retrieval operator.
-- Preserve prior migrations and replace their superseded indexes forward-only.

DROP INDEX IF EXISTS memories_agent_embedding_idx;
DROP INDEX IF EXISTS memories_embedding_cosine_idx;

CREATE VECTOR INDEX IF NOT EXISTS memories_agent_embedding_cosine_idx
  ON memories (agent_id, embedding vector_cosine_ops);
