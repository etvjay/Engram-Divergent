-- Agent-scoped cosine ANN is Engram's canonical retrieval index.
-- Retire global indexes once the scoped index has been created by migration 006.
DROP INDEX IF EXISTS memories@memories_embedding_cosine_idx;
DROP INDEX IF EXISTS memories@memories_embedding_idx;
