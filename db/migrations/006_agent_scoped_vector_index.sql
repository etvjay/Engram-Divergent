-- Canonical Engram vector index: retrieval is scoped by agent identity and
-- ranked with cosine distance (<=>), so both the prefix and opclass must match.

CREATE VECTOR INDEX IF NOT EXISTS memories_agent_embedding_cosine_idx
  ON memories (agent_id, embedding vector_cosine_ops);
