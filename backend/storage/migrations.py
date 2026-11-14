"""Minimal ordered SQLite migration runner for additive schema changes."""

from __future__ import annotations

from pathlib import Path
import sqlite3


MIGRATIONS_DIR = Path(__file__).with_name("migrations")


def run_migrations(conn: sqlite3.Connection) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    )
    applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
    for migration in sorted(MIGRATIONS_DIR.glob("[0-9][0-9][0-9]_*.sql")):
        if migration.name in applied:
            continue
        conn.executescript(migration.read_text(encoding="utf-8"))
        conn.execute("INSERT INTO schema_migrations (version) VALUES (?)", (migration.name,))
    conn.commit()
