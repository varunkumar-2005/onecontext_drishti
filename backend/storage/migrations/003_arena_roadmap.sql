CREATE TABLE IF NOT EXISTS arena_phases (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    phase_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    themed_title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    unlock_rule TEXT NOT NULL DEFAULT 'previous_phase_verified',
    unlock_overridden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(session_id, phase_order),
    FOREIGN KEY (session_id) REFERENCES arena_sessions(id) ON DELETE CASCADE
);

ALTER TABLE arena_quests ADD COLUMN phase_id TEXT REFERENCES arena_phases(id);
ALTER TABLE arena_quests ADD COLUMN due_date TEXT;
ALTER TABLE arena_quests ADD COLUMN verification_type TEXT NOT NULL DEFAULT 'pr_merged_ci_green';
ALTER TABLE arena_quests ADD COLUMN submitted_at TEXT;

UPDATE arena_quests SET status = 'open' WHERE status = 'available';

INSERT INTO arena_phases (
    id, session_id, phase_order, title, themed_title, description, unlock_rule, created_at
)
SELECT
    'phase-migrated-' || q.session_id, q.session_id, 1,
    'Imported Tasks', 'Trailhead Camp',
    'Tasks imported before roadmap phases were available.', 'previous_phase_verified',
    MIN(q.created_at)
FROM arena_quests q
WHERE q.source_type = 'markdown_upload' AND q.phase_id IS NULL
GROUP BY q.session_id;

UPDATE arena_quests
SET phase_id = 'phase-migrated-' || session_id
WHERE source_type = 'markdown_upload' AND phase_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_arena_phases_session_order
    ON arena_phases(session_id, phase_order);
CREATE INDEX IF NOT EXISTS idx_arena_quests_phase
    ON arena_quests(session_id, phase_id);
