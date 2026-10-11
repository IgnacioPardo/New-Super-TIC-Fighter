-- Durable Objects own brackets. D1 keeps the public listing and persisted progress.
CREATE TABLE IF NOT EXISTS tournament_state (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, visibility TEXT NOT NULL,
  phase TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tournament_state_public ON tournament_state(visibility, updated_at);
