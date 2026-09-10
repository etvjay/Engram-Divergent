-- Engram D1 persistence: immutable canonical objects.
CREATE TABLE IF NOT EXISTS engram_objects (
  category TEXT NOT NULL,
  object_id TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (category, object_id)
);
CREATE INDEX IF NOT EXISTS idx_engram_objects_category ON engram_objects(category);
