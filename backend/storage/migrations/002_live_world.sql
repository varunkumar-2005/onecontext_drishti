-- Additive live-world state. Paths only; never file contents.
CREATE TABLE IF NOT EXISTS arena_files (
  session_id TEXT NOT NULL, path TEXT NOT NULL, region_id TEXT NOT NULL,
  kind TEXT NOT NULL, loc TEXT NOT NULL, last_activity_at TEXT,
  PRIMARY KEY (session_id, path)
);
CREATE TABLE IF NOT EXISTS arena_activity (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('user','agent')),
  actor_id TEXT NOT NULL, path TEXT, type TEXT NOT NULL CHECK(type IN ('edit','commit','pr','ci_fail','ci_pass','finding','context_read','checkin')),
  branch TEXT, ref TEXT, source TEXT NOT NULL CHECK(source IN ('github','watcher','mcp','manual','simulated')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_arena_activity_session_created ON arena_activity(session_id, created_at);
CREATE TABLE IF NOT EXISTS arena_alerts (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, kind TEXT NOT NULL,
  severity TEXT NOT NULL, paths_json TEXT NOT NULL, actors_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL, dedupe_key TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','resolved')),
  created_at TEXT NOT NULL, resolved_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_arena_alert_open_dedupe ON arena_alerts(session_id, dedupe_key) WHERE status = 'open';
CREATE TABLE IF NOT EXISTS arena_file_edges (
  session_id TEXT NOT NULL, from_path TEXT NOT NULL, to_path TEXT NOT NULL,
  PRIMARY KEY (session_id, from_path, to_path)
);
CREATE TABLE IF NOT EXISTS arena_layout (
  session_id TEXT NOT NULL, region_id TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL,
  w REAL NOT NULL, h REAL NOT NULL, PRIMARY KEY (session_id, region_id)
);
