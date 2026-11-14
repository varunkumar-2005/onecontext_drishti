"""
backend/storage/arena_db.py
Non-destructive SQLite storage layer for OneContext Arena:
- arena_sessions
- arena_session_members
- arena_theme_packs
- arena_world_models
- arena_regions
- arena_quests
- arena_bosses
- arena_checkpoints
- arena_xp_events
- arena_theme_assets
- arena_world_events
- arena_audit_logs

Integrates seamlessly with existing local_db connection infrastructure.
"""

from __future__ import annotations

import json
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.storage.local_db import get_connection, get_db_path
from backend.storage.migrations import run_migrations


def generate_join_code(length: int = 6) -> str:
    """Generate a high-entropy, human-friendly 6-character uppercase alphanumeric join code."""
    # Exclude ambiguous characters: 0/O, 1/I
    chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    return "".join(secrets.choice(chars) for _ in range(length))


def init_arena_db(db_path: Optional[str | Path] = None) -> None:
    """Initialize Arena tables and indexes non-destructively."""
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        # Enable foreign key support
        cursor.execute("PRAGMA foreign_keys = ON;")

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS arena_sessions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                host_user_id TEXT NOT NULL,
                host_name TEXT NOT NULL,
                game_name TEXT NOT NULL,
                game_description TEXT,
                objective TEXT NOT NULL,
                join_code TEXT UNIQUE NOT NULL,
                status TEXT NOT NULL DEFAULT 'lobby',
                current_theme_id TEXT,
                world_model_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS arena_session_members (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'member',
                avatar_style TEXT DEFAULT 'adventurer',
                current_region_id TEXT,
                current_quest_id TEXT,
                last_seen TEXT NOT NULL,
                joined_at TEXT NOT NULL,
                UNIQUE(session_id, user_id),
                FOREIGN KEY (session_id) REFERENCES arena_sessions(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS arena_theme_packs (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                game_name TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                genre TEXT NOT NULL,
                world_archetype TEXT NOT NULL,
                game_bible_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES arena_sessions(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS arena_world_models (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                raw_model_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id),
                FOREIGN KEY (session_id) REFERENCES arena_sessions(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS arena_regions (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                module_id TEXT NOT NULL,
                name TEXT NOT NULL,
                themed_name TEXT NOT NULL,
                description TEXT,
                health INTEGER NOT NULL DEFAULT 100,
                status TEXT NOT NULL DEFAULT 'normal',
                position_x REAL NOT NULL DEFAULT 0.0,
                position_y REAL NOT NULL DEFAULT 0.0,
                layout_data_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES arena_sessions(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS arena_quests (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                region_id TEXT,
                source_id TEXT NOT NULL,
                source_type TEXT NOT NULL DEFAULT 'github_issue',
                original_title TEXT NOT NULL,
                themed_title TEXT NOT NULL,
                description TEXT,
                issue_url TEXT,
                assigned_to TEXT,
                assigned_name TEXT,
                status TEXT NOT NULL DEFAULT 'available',
                verification_requirements TEXT,
                evidence_json TEXT,
                xp_reward INTEGER NOT NULL DEFAULT 100,
                verified_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES arena_sessions(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS arena_bosses (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                region_id TEXT,
                source_finding_id TEXT NOT NULL,
                themed_name TEXT NOT NULL,
                original_finding TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'high',
                scanner_or_agent TEXT NOT NULL,
                affected_files_json TEXT,
                max_health INTEGER NOT NULL DEFAULT 100,
                current_health INTEGER NOT NULL DEFAULT 100,
                status TEXT NOT NULL DEFAULT 'active',
                proposed_fix_diff TEXT,
                proposed_fix_branch TEXT,
                approved_by TEXT,
                verification_evidence_json TEXT,
                xp_reward INTEGER NOT NULL DEFAULT 250,
                defeated_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES arena_sessions(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS arena_checkpoints (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                source_id TEXT NOT NULL,
                title TEXT NOT NULL,
                themed_title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'locked',
                milestone_due TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES arena_sessions(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS arena_xp_events (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_id TEXT NOT NULL,
                amount INTEGER NOT NULL,
                reason TEXT NOT NULL,
                awarded_at TEXT NOT NULL,
                UNIQUE(session_id, user_id, source_type, source_id),
                FOREIGN KEY (session_id) REFERENCES arena_sessions(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS arena_theme_assets (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                theme_id TEXT NOT NULL,
                asset_key TEXT NOT NULL,
                asset_type TEXT NOT NULL,
                prompt TEXT,
                image_url TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'ready',
                metadata_json TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(session_id, theme_id, asset_key),
                FOREIGN KEY (session_id) REFERENCES arena_sessions(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS arena_world_events (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                title TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                actor_id TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES arena_sessions(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS arena_audit_logs (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                action TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                details_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES arena_sessions(id) ON DELETE CASCADE
            )
            """
        )

        # Performance indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_arena_sessions_code ON arena_sessions(join_code)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_arena_sessions_project ON arena_sessions(project_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_arena_members_session ON arena_session_members(session_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_arena_regions_session ON arena_regions(session_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_arena_quests_session ON arena_quests(session_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_arena_bosses_session ON arena_bosses(session_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_arena_assets_lookup ON arena_theme_assets(session_id, theme_id, asset_key)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_arena_events_session ON arena_world_events(session_id, created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_arena_xp_lookup ON arena_xp_events(session_id, user_id)")

        conn.commit()
        run_migrations(conn)


# --- ARENA SESSION CRUD ---

def create_arena_session(
    project_id: str,
    game_name: str,
    objective: str,
    host_name: str,
    host_user_id: Optional[str] = None,
    game_description: Optional[str] = None,
    join_code_ttl_hours: int = 24,
    db_path: Optional[str | Path] = None,
) -> Dict[str, Any]:
    session_id = f"arena-{uuid.uuid4().hex[:12]}"
    user_id = host_user_id or f"user-{uuid.uuid4().hex[:8]}"
    join_code = generate_join_code(length=8)
    now = datetime.now(timezone.utc).isoformat()
    join_code_expires_at = (datetime.now(timezone.utc) + timedelta(hours=join_code_ttl_hours)).isoformat()

    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO arena_sessions (
                id, project_id, host_user_id, host_name, game_name,
                game_description, objective, join_code, join_code_expires_at, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'lobby', ?, ?)
            """,
            (session_id, project_id, user_id, host_name, game_name, game_description, objective, join_code, join_code_expires_at, now, now),
        )

        # Automatically join host as first member
        member_id = f"mem-{uuid.uuid4().hex[:10]}"
        cursor.execute(
            """
            INSERT INTO arena_session_members (
                id, session_id, user_id, user_name, role, avatar_style, last_seen, joined_at
            ) VALUES (?, ?, ?, ?, 'host', 'commander', ?, ?)
            """,
            (member_id, session_id, user_id, host_name, now, now),
        )

        cursor.execute(
            """
            INSERT INTO arena_audit_logs (id, session_id, action, actor_id, details_json, created_at)
            VALUES (?, ?, 'session_created', ?, ?, ?)
            """,
            (f"aud-{uuid.uuid4().hex[:8]}", session_id, user_id, json.dumps({"game_name": game_name, "objective": objective}), now),
        )
        conn.commit()

    return get_arena_session_by_id(session_id, db_path=db_path)


def get_arena_session_by_id(session_id: str, db_path: Optional[str | Path] = None) -> Optional[Dict[str, Any]]:
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT s.*, p.name as project_name
            FROM arena_sessions s
            LEFT JOIN projects p ON s.project_id = p.id
            WHERE s.id = ?
            """,
            (session_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        return dict(row)


def get_arena_session_by_code(join_code: str, db_path: Optional[str | Path] = None) -> Optional[Dict[str, Any]]:
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT s.*, p.name as project_name
            FROM arena_sessions s
            LEFT JOIN projects p ON s.project_id = p.id
            WHERE UPPER(s.join_code) = UPPER(?)
              AND COALESCE(s.join_code_revoked, 0) = 0
              AND s.join_code_expires_at IS NOT NULL
              AND s.join_code_expires_at > ?
            """,
            (join_code.strip(), datetime.now(timezone.utc).isoformat()),
        )
        row = cursor.fetchone()
        if not row:
            return None
        return dict(row)


def list_arena_sessions(project_id: Optional[str] = None, db_path: Optional[str | Path] = None) -> List[Dict[str, Any]]:
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        query = """
            SELECT s.*, p.name as project_name, COUNT(m.id) as member_count
            FROM arena_sessions s
            LEFT JOIN projects p ON s.project_id = p.id
            LEFT JOIN arena_session_members m ON s.id = m.session_id
        """
        params = []
        if project_id:
            query += " WHERE s.project_id = ?"
            params.append(project_id)
        query += " GROUP BY s.id ORDER BY s.created_at DESC"
        cursor.execute(query, tuple(params))
        return [dict(row) for row in cursor.fetchall()]


def update_session_status(session_id: str, status: str, db_path: Optional[str | Path] = None) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE arena_sessions SET status = ?, updated_at = ? WHERE id = ?",
            (status, now, session_id),
        )
        conn.commit()


def write_arena_audit(
    session_id: str,
    action: str,
    actor_id: str,
    details: Optional[Dict[str, Any]] = None,
    db_path: Optional[str | Path] = None,
) -> None:
    """Persist security-relevant Arena actions without retaining secrets."""
    with get_connection(db_path) as conn:
        conn.execute(
            """
            INSERT INTO arena_audit_logs (id, session_id, action, actor_id, details_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                f"aud-{uuid.uuid4().hex[:12]}",
                session_id,
                action,
                actor_id,
                json.dumps(details or {}),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()


# --- MEMBERS & PRESENCE ---

def join_arena_session(
    session_id: str,
    user_name: str,
    user_id: Optional[str] = None,
    avatar_style: str = "adventurer",
    db_path: Optional[str | Path] = None,
) -> Dict[str, Any]:
    uid = user_id or f"user-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM arena_session_members WHERE session_id = ? AND user_id = ?",
            (session_id, uid),
        )
        existing = cursor.fetchone()
        if existing:
            cursor.execute(
                "UPDATE arena_session_members SET last_seen = ?, user_name = ? WHERE id = ?",
                (now, user_name, existing["id"]),
            )
            conn.commit()
            return {**dict(existing), "last_seen": now, "user_name": user_name}

        mem_id = f"mem-{uuid.uuid4().hex[:10]}"
        cursor.execute(
            """
            INSERT INTO arena_session_members (
                id, session_id, user_id, user_name, role, avatar_style, last_seen, joined_at
            ) VALUES (?, ?, ?, ?, 'member', ?, ?, ?)
            """,
            (mem_id, session_id, uid, user_name, avatar_style, now, now),
        )
        conn.commit()
        return {
            "id": mem_id,
            "session_id": session_id,
            "user_id": uid,
            "user_name": user_name,
            "role": "member",
            "avatar_style": avatar_style,
            "last_seen": now,
            "joined_at": now,
        }


def update_member_heartbeat(
    session_id: str,
    user_id: str,
    current_region_id: Optional[str] = None,
    current_quest_id: Optional[str] = None,
    db_path: Optional[str | Path] = None,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE arena_session_members
            SET last_seen = ?,
                current_region_id = COALESCE(?, current_region_id),
                current_quest_id = COALESCE(?, current_quest_id)
            WHERE session_id = ? AND user_id = ?
            """,
            (now, current_region_id, current_quest_id, session_id, user_id),
        )
        conn.commit()


def get_session_members(session_id: str, db_path: Optional[str | Path] = None) -> List[Dict[str, Any]]:
    now = datetime.now(timezone.utc).timestamp()
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM arena_session_members WHERE session_id = ? ORDER BY joined_at ASC",
            (session_id,),
        )
        rows = cursor.fetchall()
        members = []
        for r in rows:
            m = dict(r)
            # Active if seen within 60 seconds
            try:
                dt = datetime.fromisoformat(m["last_seen"]).timestamp()
                m["is_online"] = (now - dt) <= 60
            except Exception:
                m["is_online"] = True
            members.append(m)
        return members


def get_session_member(
    session_id: str,
    user_id: str,
    db_path: Optional[str | Path] = None,
) -> Optional[Dict[str, Any]]:
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM arena_session_members WHERE session_id = ? AND user_id = ?",
            (session_id, user_id),
        ).fetchone()
        return dict(row) if row else None


# --- THEME PACKS & WORLD MODELS ---

def save_theme_pack(
    session_id: str,
    game_name: str,
    genre: str,
    world_archetype: str,
    game_bible_dict: Dict[str, Any],
    version: int = 1,
    db_path: Optional[str | Path] = None,
) -> str:
    theme_id = f"theme-{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO arena_theme_packs (
                id, session_id, game_name, version, genre, world_archetype, game_bible_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (theme_id, session_id, game_name, version, genre, world_archetype, json.dumps(game_bible_dict), now),
        )
        cursor.execute(
            "UPDATE arena_sessions SET current_theme_id = ?, game_name = ?, updated_at = ? WHERE id = ?",
            (theme_id, game_name, now, session_id),
        )
        conn.commit()
    return theme_id


def get_latest_theme_pack(session_id: str, db_path: Optional[str | Path] = None) -> Optional[Dict[str, Any]]:
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM arena_theme_packs WHERE session_id = ? ORDER BY version DESC, created_at DESC LIMIT 1",
            (session_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        res = dict(row)
        res["game_bible"] = json.loads(res["game_bible_json"])
        return res


def save_world_model(
    session_id: str,
    project_id: str,
    raw_model_dict: Dict[str, Any],
    db_path: Optional[str | Path] = None,
) -> str:
    model_id = f"model-{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO arena_world_models (id, project_id, session_id, raw_model_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (model_id, project_id, session_id, json.dumps(raw_model_dict), now),
        )
        cursor.execute(
            "UPDATE arena_sessions SET world_model_id = ?, updated_at = ? WHERE id = ?",
            (model_id, now, session_id),
        )
        conn.commit()
    return model_id


def get_world_model(session_id: str, db_path: Optional[str | Path] = None) -> Optional[Dict[str, Any]]:
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM arena_world_models WHERE session_id = ? ORDER BY created_at DESC LIMIT 1",
            (session_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        res = dict(row)
        res["model"] = json.loads(res["raw_model_json"])
        return res


def replace_repository_world(
    session_id: str,
    repo_url: str,
    repo_name: str,
    modules: List[Dict[str, Any]],
    regions: List[Dict[str, Any]],
    db_path: Optional[str | Path] = None,
) -> None:
    """Replace district metadata with a GitHub tree import, retaining quests and XP."""
    now = datetime.now(timezone.utc).isoformat()
    valid_region_ids = {region["region_id"] for region in regions}
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, raw_model_json FROM arena_world_models WHERE session_id = ? ORDER BY created_at DESC LIMIT 1",
            (session_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise ValueError("Arena world model is not available.")
        model = json.loads(row["raw_model_json"])
        model["repo_name"] = repo_name
        model["repo_url"] = repo_url
        model["modules"] = modules

        cursor.execute(
            "UPDATE arena_world_models SET raw_model_json = ? WHERE id = ?",
            (json.dumps(model), row["id"]),
        )
        cursor.execute("DELETE FROM arena_regions WHERE session_id = ?", (session_id,))
        for region in regions:
            cursor.execute(
                """
                INSERT INTO arena_regions (
                    id, session_id, module_id, name, themed_name, description,
                    health, status, position_x, position_y, layout_data_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'normal', ?, ?, '{}', ?)
                """,
                (
                    region["region_id"], session_id, region["module_id"],
                    region["original_name"], region["themed_name"],
                    region.get("description", ""), region.get("health", 100),
                    region.get("pos_x", 0.0), region.get("pos_y", 0.0), now,
                ),
            )
        cursor.execute(
            "SELECT id, region_id FROM arena_quests WHERE session_id = ?",
            (session_id,),
        )
        for quest in cursor.fetchall():
            if quest["region_id"] and quest["region_id"] not in valid_region_ids:
                cursor.execute("UPDATE arena_quests SET region_id = NULL WHERE id = ?", (quest["id"],))
        cursor.execute(
            "UPDATE arena_sessions SET updated_at = ? WHERE id = ?",
            (now, session_id),
        )
        conn.commit()


def add_imported_quests(
    session_id: str,
    phases: List[Dict[str, Any]],
    db_path: Optional[str | Path] = None,
) -> List[str]:
    """Persist parsed phase and quest metadata, never the uploaded Markdown."""
    task_count = sum(len(phase.get("quests", [])) for phase in phases)
    if not phases or task_count < 1 or task_count > 100:
        raise ValueError("Imported task count must be between 1 and 100.")
    now = datetime.now(timezone.utc).isoformat()
    quest_ids = []
    with get_connection(db_path) as conn:
        members = {
            row["user_name"].casefold(): row["user_id"]
            for row in conn.execute(
                "SELECT user_id, user_name FROM arena_session_members WHERE session_id = ?",
                (session_id,),
            ).fetchall()
        }
        for phase_order, phase in enumerate(phases, start=1):
            phase_title = str(phase.get("title", "")).strip()
            if not phase_title or len(phase_title) > 300:
                raise ValueError("Imported phase title is invalid.")
            phase_id = f"phase-{uuid.uuid4().hex[:12]}"
            conn.execute(
                """
                INSERT INTO arena_phases (
                    id, session_id, phase_order, title, themed_title, description,
                    unlock_rule, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'previous_phase_verified', ?)
                """,
                (
                    phase_id, session_id, phase_order, phase_title, phase_title,
                    str(phase.get("description", ""))[:1000], now,
                ),
            )
            for task in phase.get("quests", []):
                title = str(task.get("title", "")).strip()
                xp_reward = int(task.get("xp_reward", 100))
                due_date = task.get("due_date")
                verification_type = task.get("verification_type", "pr_merged_ci_green")
                if (
                    not title
                    or len(title) > 300
                    or not 10 <= xp_reward <= 500
                    or verification_type not in {"pr_merged_ci_green", "host_approval"}
                ):
                    raise ValueError("Imported task title, XP, or verification type is invalid.")
                assignee_name = str(task.get("assignee_name") or "").strip() or None
                assigned_to = members.get(assignee_name.casefold()) if assignee_name else None
                quest_id = f"quest-{uuid.uuid4().hex[:12]}"
                source_id = f"upload-{uuid.uuid4().hex[:12]}"
                conn.execute(
                    """
                    INSERT INTO arena_quests (
                        id, session_id, region_id, phase_id, source_id, source_type,
                        original_title, themed_title, description, assigned_to, assigned_name,
                        status, verification_type, due_date, verification_requirements,
                        evidence_json, xp_reward, created_at
                    ) VALUES (?, ?, NULL, ?, ?, 'markdown_upload', ?, ?, '', ?, ?, 'open',
                              ?, ?, ?, '{}', ?, ?)
                    """,
                    (
                        quest_id, session_id, phase_id, source_id, title, title,
                        assigned_to, assignee_name, verification_type, due_date,
                        "Linked PR merged and CI green" if verification_type == "pr_merged_ci_green" else "Audited host approval",
                        xp_reward, now,
                    ),
                )
                quest_ids.append(quest_id)
        conn.commit()
    return quest_ids


def override_phase_unlock(
    session_id: str,
    phase_id: str,
    unlocked: bool,
    actor_id: str,
    db_path: Optional[str | Path] = None,
) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        cursor = conn.execute(
            "UPDATE arena_phases SET unlock_overridden = ? WHERE session_id = ? AND id = ?",
            (1 if unlocked else 0, session_id, phase_id),
        )
        if cursor.rowcount == 1:
            conn.execute(
                """
                INSERT INTO arena_audit_logs (id, session_id, action, actor_id, details_json, created_at)
                VALUES (?, ?, 'phase_unlock_overridden', ?, ?, ?)
                """,
                (
                    f"audit-{uuid.uuid4().hex[:12]}", session_id, actor_id,
                    json.dumps({"phase_id": phase_id, "unlocked": unlocked}), now,
                ),
            )
        conn.commit()
        return cursor.rowcount == 1


def retheme_roadmap_phases(
    session_id: str,
    landmark_names: List[str],
    db_path: Optional[str | Path] = None,
) -> None:
    names = landmark_names or ["Trailhead Camp"]
    with get_connection(db_path) as conn:
        phases = conn.execute(
            "SELECT id, phase_order FROM arena_phases WHERE session_id = ? ORDER BY phase_order",
            (session_id,),
        ).fetchall()
        for phase in phases:
            themed_title = names[(phase["phase_order"] - 1) % len(names)]
            conn.execute(
                "UPDATE arena_phases SET themed_title = ? WHERE id = ?",
                (themed_title, phase["id"]),
            )
        conn.commit()


def get_roadmap_phases(session_id: str, db_path: Optional[str | Path] = None) -> List[Dict[str, Any]]:
    with get_connection(db_path) as conn:
        phases = conn.execute(
            "SELECT * FROM arena_phases WHERE session_id = ? ORDER BY phase_order",
            (session_id,),
        ).fetchall()
        result = []
        for phase in phases:
            row = dict(phase)
            quests = conn.execute(
                "SELECT * FROM arena_quests WHERE session_id = ? AND phase_id = ? ORDER BY created_at, rowid",
                (session_id, phase["id"]),
            ).fetchall()
            row["quests"] = []
            for quest in quests:
                item = dict(quest)
                item["evidence"] = json.loads(item["evidence_json"]) if item.get("evidence_json") else {}
                row["quests"].append(item)
            result.append(row)
        return result


def is_roadmap_phase_unlocked(
    session_id: str,
    phase_id: str,
    db_path: Optional[str | Path] = None,
) -> bool:
    phases = get_roadmap_phases(session_id, db_path)
    for index, phase in enumerate(phases):
        if phase["id"] != phase_id:
            continue
        if phase["unlock_overridden"]:
            return True
        return all(
            all(quest["status"] == "verified" for quest in previous["quests"])
            for previous in phases[:index]
        )
    return False


def submit_roadmap_quest(
    session_id: str,
    quest_id: str,
    user_id: str,
    evidence_note: str,
    db_path: Optional[str | Path] = None,
) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT assigned_to, status, evidence_json FROM arena_quests WHERE session_id = ? AND id = ?",
            (session_id, quest_id),
        ).fetchone()
        if not row:
            raise ValueError("Quest not found.")
        if row["assigned_to"] != user_id:
            raise ValueError("Only the assigned teammate can submit this quest.")
        if row["status"] != "claimed":
            raise ValueError("Only a claimed quest can be submitted.")
        evidence = json.loads(row["evidence_json"] or "{}")
        evidence["submission"] = {"user_id": user_id, "note": evidence_note.strip(), "submitted_at": now}
        conn.execute(
            "UPDATE arena_quests SET status = 'submitted', submitted_at = ?, evidence_json = ? WHERE session_id = ? AND id = ?",
            (now, json.dumps(evidence), session_id, quest_id),
        )
        conn.commit()
        return True


def approve_roadmap_quest(
    session_id: str,
    quest_id: str,
    approver_id: str,
    evidence_note: str,
    db_path: Optional[str | Path] = None,
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        quest = conn.execute(
            """
            SELECT assigned_to, assigned_name, status, verification_type,
                   xp_reward, original_title, themed_title, evidence_json
            FROM arena_quests WHERE session_id = ? AND id = ?
            """,
            (session_id, quest_id),
        ).fetchone()
        if not quest:
            raise ValueError("Quest not found.")
        if quest["assigned_to"] == approver_id:
            raise ValueError("A quest claimer cannot approve their own quest.")
        if quest["verification_type"] != "host_approval":
            raise ValueError("This quest requires merged-PR and green-CI verification.")
        if quest["status"] not in {"claimed", "submitted"} or not quest["assigned_to"]:
            raise ValueError("Only a claimed or submitted quest with an assignee can be approved.")

        evidence = {
            "label": "HOST APPROVED",
            "approved_by": approver_id,
            "approved_at": now,
            "note": evidence_note.strip(),
        }
        prior_evidence = json.loads(quest["evidence_json"] or "{}")
        if prior_evidence.get("submission"):
            evidence["submission"] = prior_evidence["submission"]
        conn.execute(
            """
            UPDATE arena_quests
            SET status = 'verified', verified_at = ?, evidence_json = ?
            WHERE session_id = ? AND id = ?
            """,
            (now, json.dumps(evidence), session_id, quest_id),
        )
        xp_awarded = conn.execute(
            """
            INSERT INTO arena_xp_events (
                id, session_id, user_id, source_type, source_id, amount, reason, awarded_at
            ) VALUES (?, ?, ?, 'quest_verified', ?, ?, ?, ?)
            ON CONFLICT(session_id, user_id, source_type, source_id) DO NOTHING
            """,
            (
                f"xp-{uuid.uuid4().hex[:10]}", session_id, quest["assigned_to"],
                quest_id, quest["xp_reward"], f"HOST APPROVED: {quest['themed_title']}", now,
            ),
        ).rowcount == 1
        conn.execute(
            """
            INSERT INTO arena_audit_logs (id, session_id, action, actor_id, details_json, created_at)
            VALUES (?, ?, 'quest_host_approved', ?, ?, ?)
            """,
            (
                f"audit-{uuid.uuid4().hex[:12]}", session_id, approver_id,
                json.dumps({"quest_id": quest_id, "user_id": quest["assigned_to"], "evidence_note": evidence_note.strip(), "label": "HOST APPROVED"}),
                now,
            ),
        )
        conn.commit()
        return {
            "quest_id": quest_id,
            "user_id": quest["assigned_to"],
            "user_name": quest["assigned_name"],
            "xp_awarded": quest["xp_reward"] if xp_awarded else 0,
            "evidence": evidence,
        }


def get_verified_leaderboard(session_id: str, db_path: Optional[str | Path] = None) -> List[Dict[str, Any]]:
    with get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT x.user_id, COALESCE(m.user_name, x.user_id) AS user_name,
                   m.avatar_style, SUM(x.amount) AS verified_xp,
                   COUNT(DISTINCT q.id) AS verified_quests
            FROM arena_xp_events x
            JOIN arena_quests q
              ON q.session_id = x.session_id AND q.id = x.source_id AND q.status = 'verified'
            LEFT JOIN arena_session_members m
              ON m.session_id = x.session_id AND m.user_id = x.user_id
            WHERE x.session_id = ? AND x.source_type = 'quest_verified'
            GROUP BY x.user_id
            ORDER BY verified_xp DESC, verified_quests DESC, user_name COLLATE NOCASE
            """,
            (session_id,),
        ).fetchall()
        return [{"rank": index + 1, **dict(row)} for index, row in enumerate(rows)]


def get_member_verified_xp(session_id: str, user_id: str, db_path: Optional[str | Path] = None) -> List[Dict[str, Any]]:
    with get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT q.id AS quest_id, q.original_title AS task, x.amount AS xp,
                   q.evidence_json, x.awarded_at AS date, q.issue_url
            FROM arena_xp_events x
            JOIN arena_quests q
              ON q.session_id = x.session_id AND q.id = x.source_id AND q.status = 'verified'
            WHERE x.session_id = ? AND x.user_id = ? AND x.source_type = 'quest_verified'
            ORDER BY x.awarded_at DESC
            """,
            (session_id, user_id),
        ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["evidence"] = json.loads(item.pop("evidence_json") or "{}")
            result.append(item)
        return result


# --- REGIONS, QUESTS, BOSSES, CHECKPOINTS CRUD ---

def replace_mapped_entities(
    session_id: str,
    regions: List[Dict[str, Any]],
    quests: List[Dict[str, Any]],
    bosses: List[Dict[str, Any]],
    checkpoints: List[Dict[str, Any]],
    db_path: Optional[str | Path] = None,
) -> None:
    """Atomically replace or sync mapped entities for theme switching or initial mapping."""
    now = datetime.now(timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        # Keep existing quest progress / assignments if updating
        cursor.execute("SELECT id, source_id, assigned_to, assigned_name, status, verified_at, evidence_json, submitted_at FROM arena_quests WHERE session_id = ?", (session_id,))
        existing_quests = {r["source_id"]: dict(r) for r in cursor.fetchall()}

        # Keep existing boss damage/defeats if updating
        cursor.execute("SELECT id, source_finding_id, current_health, status, proposed_fix_diff, proposed_fix_branch, approved_by, defeated_at FROM arena_bosses WHERE session_id = ?", (session_id,))
        existing_bosses = {r["source_finding_id"]: dict(r) for r in cursor.fetchall()}

        # Delete previous theme mappings
        cursor.execute("DELETE FROM arena_quests WHERE session_id = ? AND source_type != 'markdown_upload'", (session_id,))
        cursor.execute("DELETE FROM arena_bosses WHERE session_id = ?", (session_id,))
        cursor.execute("DELETE FROM arena_checkpoints WHERE session_id = ?", (session_id,))
        cursor.execute("DELETE FROM arena_regions WHERE session_id = ?", (session_id,))

        # Insert regions
        for r in regions:
            cursor.execute(
                """
                INSERT INTO arena_regions (
                    id, session_id, module_id, name, themed_name, description,
                    health, status, position_x, position_y, layout_data_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    r["region_id"], session_id, r["module_id"], r["original_name"], r["themed_name"],
                    r.get("description", ""), r.get("health", 100), r.get("status", "normal"),
                    r.get("pos_x", 0.0), r.get("pos_y", 0.0),
                    json.dumps(r.get("layout_data", {})), now
                ),
            )

        # Insert quests, restoring assignments and verification state
        for q in quests:
            old_q = existing_quests.get(q["source_id"])
            assigned_to = old_q["assigned_to"] if old_q else q.get("assigned_to")
            assigned_name = old_q["assigned_name"] if old_q else q.get("assigned_name")
            status = old_q["status"] if old_q else q.get("status", "open")
            if status == "available":
                status = "open"
            verified_at = old_q["verified_at"] if old_q else None
            evidence_json = old_q["evidence_json"] if old_q else json.dumps(q.get("evidence") or {})

            cursor.execute(
                """
                INSERT INTO arena_quests (
                    id, session_id, region_id, phase_id, source_id, source_type, original_title, themed_title,
                    description, issue_url, assigned_to, assigned_name, status,
                    verification_type, due_date, submitted_at, verification_requirements,
                    evidence_json, xp_reward, verified_at, created_at
                ) VALUES (?, ?, ?, NULL, ?, 'github_issue', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    q["quest_id"], session_id, q.get("region_id"), q["source_id"],
                    q["original_title"], q["themed_title"], q.get("description", ""),
                    q.get("issue_url", ""), assigned_to, assigned_name, status,
                    q.get("verification_type", "pr_merged_ci_green"),
                    q.get("due_date"),
                    old_q["submitted_at"] if old_q else None,
                    q.get("verification_requirements", "Merge linked PR and pass CI"),
                    evidence_json, q.get("xp_reward", 100), verified_at, now
                ),
            )

        # Insert bosses, restoring damage and approvals
        for b in bosses:
            old_b = existing_bosses.get(b["source_finding_id"])
            curr_health = old_b["current_health"] if old_b else b.get("current_health", 100)
            b_status = old_b["status"] if old_b else b.get("status", "active")
            prop_diff = old_b["proposed_fix_diff"] if old_b else b.get("proposed_fix_diff")
            prop_branch = old_b["proposed_fix_branch"] if old_b else b.get("proposed_fix_branch")
            approved_by = old_b["approved_by"] if old_b else b.get("approved_by")
            defeated_at = old_b["defeated_at"] if old_b else None

            cursor.execute(
                """
                INSERT INTO arena_bosses (
                    id, session_id, region_id, source_finding_id, themed_name, original_finding,
                    severity, scanner_or_agent, affected_files_json, max_health, current_health,
                    status, proposed_fix_diff, proposed_fix_branch, approved_by,
                    verification_evidence_json, xp_reward, defeated_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    b["boss_id"], session_id, b.get("region_id"), b["source_finding_id"],
                    b["themed_name"], b["original_finding"], b.get("severity", "high"),
                    b.get("scanner_or_agent", "SecurityScanner"),
                    json.dumps(b.get("affected_files", [])), b.get("max_health", 100),
                    curr_health, b_status, prop_diff, prop_branch, approved_by,
                    json.dumps(b.get("verification_evidence") or {}),
                    b.get("xp_reward", 250), defeated_at, now
                ),
            )

        # Insert checkpoints
        for cp in checkpoints:
            cursor.execute(
                """
                INSERT INTO arena_checkpoints (
                    id, session_id, source_id, title, themed_title, status, milestone_due, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    cp["checkpoint_id"], session_id, cp["source_id"], cp["original_title"],
                    cp["themed_title"], cp.get("status", "locked"), cp.get("milestone_due"), now
                ),
            )

        conn.commit()


def get_arena_entities(session_id: str, db_path: Optional[str | Path] = None) -> Dict[str, Any]:
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM arena_regions WHERE session_id = ? ORDER BY created_at ASC", (session_id,))
        regions = []
        for r in cursor.fetchall():
            rd = dict(r)
            rd["region_id"] = rd["id"]
            rd["original_name"] = rd.get("name", "")
            rd["theme_biome_or_zone"] = rd.get("description", "") or "Zone"
            rd["pos_x"] = rd.get("position_x", 0.0)
            rd["pos_y"] = rd.get("position_y", 0.0)
            regions.append(rd)

        cursor.execute("SELECT * FROM arena_quests WHERE session_id = ? ORDER BY created_at ASC", (session_id,))
        quests = []
        for q in cursor.fetchall():
            qd = dict(q)
            qd["lifecycle_status"] = qd["status"]
            if qd["status"] == "open":
                qd["status"] = "available"
            qd["quest_id"] = qd["id"]
            qd["description"] = qd.get("description") or ""
            qd["evidence"] = json.loads(qd["evidence_json"]) if qd.get("evidence_json") else None
            quests.append(qd)

        cursor.execute("SELECT * FROM arena_bosses WHERE session_id = ? ORDER BY created_at ASC", (session_id,))
        bosses = []
        for b in cursor.fetchall():
            bd = dict(b)
            bd["boss_id"] = bd["id"]
            bd["affected_files"] = json.loads(bd["affected_files_json"]) if bd.get("affected_files_json") else []
            bosses.append(bd)

        cursor.execute("SELECT * FROM arena_checkpoints WHERE session_id = ? ORDER BY created_at ASC", (session_id,))
        checkpoints = []
        for c in cursor.fetchall():
            cd = dict(c)
            cd["checkpoint_id"] = cd["id"]
            cd["original_title"] = cd.get("title", "")
            checkpoints.append(cd)

        return {
            "regions": regions,
            "quests": quests,
            "bosses": bosses,
            "checkpoints": checkpoints,
        }


# --- XP & AUDIT LOGGING ---

def award_xp(
    session_id: str,
    user_id: str,
    source_type: str,
    source_id: str,
    amount: int,
    reason: str,
    db_path: Optional[str | Path] = None,
) -> bool:
    """
    Idempotently award XP to a user.
    Returns True if awarded, False if already awarded (deduplicated).
    """
    xp_id = f"xp-{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                INSERT INTO arena_xp_events (
                    id, session_id, user_id, source_type, source_id, amount, reason, awarded_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (xp_id, session_id, user_id, source_type, source_id, amount, reason, now),
            )
            conn.commit()
            return True
        except Exception:
            # Already awarded for this session, user, source_type, and source_id
            return False


def get_session_xp_leaderboard(session_id: str, db_path: Optional[str | Path] = None) -> List[Dict[str, Any]]:
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT x.user_id, m.user_name, m.avatar_style, SUM(x.amount) as total_xp, COUNT(x.id) as events_count
            FROM arena_xp_events x
            LEFT JOIN arena_session_members m ON x.session_id = m.session_id AND x.user_id = m.user_id
            WHERE x.session_id = ?
            GROUP BY x.user_id
            ORDER BY total_xp DESC
            """,
            (session_id,),
        )
        return [dict(r) for r in cursor.fetchall()]


def record_arena_event(
    session_id: str,
    event_type: str,
    title: str,
    payload: Dict[str, Any],
    actor_id: Optional[str] = None,
    db_path: Optional[str | Path] = None,
) -> Dict[str, Any]:
    event_id = f"aev-{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO arena_world_events (id, session_id, event_type, title, payload_json, actor_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (event_id, session_id, event_type, title, json.dumps(payload), actor_id, now),
        )
        conn.commit()
    return {
        "id": event_id,
        "session_id": session_id,
        "event_type": event_type,
        "title": title,
        "payload": payload,
        "actor_id": actor_id,
        "created_at": now,
    }


def get_arena_events(session_id: str, limit: int = 50, db_path: Optional[str | Path] = None) -> List[Dict[str, Any]]:
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM arena_world_events WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
            (session_id, limit),
        )
        res = []
        for r in cursor.fetchall():
            row = dict(r)
            row["payload"] = json.loads(row["payload_json"])
            res.append(row)
        return res


def save_theme_asset(
    session_id: str,
    theme_id: str,
    asset_key: str,
    asset_type: str,
    image_url: str,
    prompt: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    status: str = "ready",
    db_path: Optional[str | Path] = None,
) -> str:
    asset_id = f"asset-{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO arena_theme_assets (
                id, session_id, theme_id, asset_key, asset_type, prompt, image_url, status, metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, theme_id, asset_key) DO UPDATE SET
                image_url = excluded.image_url,
                status = excluded.status,
                metadata_json = excluded.metadata_json,
                prompt = excluded.prompt
            """,
            (asset_id, session_id, theme_id, asset_key, asset_type, prompt, image_url, status, json.dumps(metadata or {}), now),
        )
        conn.commit()
    return asset_id


def get_theme_assets(session_id: str, theme_id: Optional[str] = None, db_path: Optional[str | Path] = None) -> List[Dict[str, Any]]:
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        if theme_id:
            cursor.execute(
                "SELECT * FROM arena_theme_assets WHERE session_id = ? AND theme_id = ?",
                (session_id, theme_id),
            )
        else:
            cursor.execute(
                "SELECT * FROM arena_theme_assets WHERE session_id = ?",
                (session_id,),
            )
        res = []
        for r in cursor.fetchall():
            row = dict(r)
            row["metadata"] = json.loads(row["metadata_json"]) if row.get("metadata_json") else {}
            res.append(row)
        return res


# --- LIVE WORLD (path-only metadata) ---

def replace_live_world(session_id: str, files: List[Dict[str, Any]], edges: List[tuple[str, str]], layout: List[Dict[str, Any]], db_path: Optional[str | Path] = None) -> None:
    with get_connection(db_path) as conn:
        conn.execute("DELETE FROM arena_files WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM arena_file_edges WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM arena_layout WHERE session_id = ?", (session_id,))
        conn.executemany("INSERT INTO arena_files(session_id,path,region_id,kind,loc,last_activity_at) VALUES(?,?,?,?,?,NULL)", [(session_id, f["path"], f["region_id"], f["kind"], f["loc"]) for f in files])
        conn.executemany("INSERT INTO arena_file_edges(session_id,from_path,to_path) VALUES(?,?,?)", [(session_id, a, b) for a, b in edges])
        conn.executemany("INSERT INTO arena_layout(session_id,region_id,x,y,w,h) VALUES(?,?,?,?,?,?)", [(session_id, x["region_id"], x["x"], x["y"], x["w"], x["h"]) for x in layout])
        conn.commit()


def live_files(session_id: str, db_path: Optional[str | Path] = None) -> List[Dict[str, Any]]:
    with get_connection(db_path) as conn: return [dict(r) for r in conn.execute("SELECT * FROM arena_files WHERE session_id = ?", (session_id,))]


def record_live_activity(session_id: str, events: List[Dict[str, Any]], db_path: Optional[str | Path] = None) -> None:
    with get_connection(db_path) as conn:
        conn.executemany("INSERT INTO arena_activity(id,session_id,actor_type,actor_id,path,type,branch,ref,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", [(f"act-{uuid.uuid4().hex}", session_id, e["actor_type"], e["actor_id"], e.get("path"), e["type"], e.get("branch"), e.get("ref"), e["source"], e["created_at"]) for e in events])
        for event in events:
            if event.get("path"): conn.execute("UPDATE arena_files SET last_activity_at = ? WHERE session_id = ? AND path = ?", (event["created_at"], session_id, event["path"]))
        conn.commit()


def live_activity(session_id: str, minutes: int = 30, db_path: Optional[str | Path] = None) -> List[Dict[str, Any]]:
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
    with get_connection(db_path) as conn: return [dict(r) for r in conn.execute("SELECT * FROM arena_activity WHERE session_id = ? AND created_at >= ? ORDER BY created_at DESC", (session_id, cutoff))]


def sync_live_alerts(session_id: str, alerts: List[Dict[str, Any]], db_path: Optional[str | Path] = None) -> Dict[str, List[Dict[str, Any]]]:
    now = datetime.now(timezone.utc).isoformat(); keys = {a["dedupe_key"] for a in alerts}; opened = []; resolved = []
    with get_connection(db_path) as conn:
        existing = {r["dedupe_key"]: dict(r) for r in conn.execute("SELECT * FROM arena_alerts WHERE session_id = ? AND status = 'open'", (session_id,))}
        for alert in alerts:
            if alert["dedupe_key"] not in existing:
                row = {**alert, "id": f"alert-{uuid.uuid4().hex}", "created_at": now}; opened.append(row)
                conn.execute("INSERT INTO arena_alerts(id,session_id,kind,severity,paths_json,actors_json,evidence_json,dedupe_key,status,created_at) VALUES(?,?,?,?,?,?,?,?, 'open', ?)", (row["id"], session_id, row["kind"], row["severity"], json.dumps(row["paths"]), json.dumps(row["actors"]), json.dumps(row["evidence"]), row["dedupe_key"], now))
        for key, row in existing.items():
            if key not in keys:
                conn.execute("UPDATE arena_alerts SET status = 'resolved', resolved_at = ? WHERE id = ?", (now, row["id"])); resolved.append(row)
        conn.commit()
    return {"opened": opened, "resolved": resolved}
