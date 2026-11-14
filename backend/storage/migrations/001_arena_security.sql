-- Additive Arena security metadata. Applied once by backend.storage.migrations.
ALTER TABLE arena_sessions ADD COLUMN join_code_expires_at TEXT;
ALTER TABLE arena_sessions ADD COLUMN join_code_revoked INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_arena_sessions_join_code_expiry
    ON arena_sessions(join_code, join_code_expires_at);
