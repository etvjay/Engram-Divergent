-- Engram retrieval ranks memories with cosine distance (<=>).
-- CockroachDB vector indexes default to vector_l2_ops, so the original
-- memories_embedding_idx does not accelerate the production retrieval metric.
-- Keep migration history immutable and add a cosine-specific C-SPANN index.

CREATE VECTOR INDEX IF NOT EXISTS memories_embedding_cosine_idx
  ON memories (embedding vector_cosine_ops);
