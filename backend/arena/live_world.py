"""Deterministic, path-only live-world building and alert rules."""
from __future__ import annotations

import ast
import fnmatch
import hashlib
import math
import re
import subprocess
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import PurePosixPath, Path
from typing import Any, Iterable

SECRET_PATTERNS = (".env*", "*.pem", "*.key", "id_rsa*", "credentials*", "*.p12")
KINDS = ("route", "model", "ui", "test", "config", "docs", "migration", "other")
ALERT_KINDS = ("collision", "dependency_risk", "ci_storm", "security_boss", "migration_conflict", "stale_lore")
WEIGHTS = {"edit": 1.0, "commit": 2.0, "ci_fail": 1.5, "context_read": 0.5}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_safe_path(path: str, ignored_patterns: Iterable[str] = ()) -> bool:
    p = PurePosixPath(path.replace("\\", "/"))
    if not path or p.is_absolute() or ".." in p.parts or ".git" in p.parts:
        return False
    name = p.name.lower()
    if any(fnmatch.fnmatch(name, pattern) for pattern in SECRET_PATTERNS):
        return False
    return not any(fnmatch.fnmatch(path, pattern) or fnmatch.fnmatch(name, pattern) for pattern in ignored_patterns)


def kind_for_path(path: str) -> str:
    p = path.lower()
    if "/migrations/" in f"/{p}" or p.endswith(".sql"): return "migration"
    if p.endswith(("_test.py", ".test.js", ".test.jsx", ".spec.ts", ".spec.tsx")) or "/tests/" in f"/{p}": return "test"
    if p.endswith((".md", ".rst")): return "docs"
    if p.endswith((".env", ".ini", ".toml", ".yaml", ".yml", ".json")): return "config"
    if "/api/" in f"/{p}" or "/routes/" in f"/{p}": return "route"
    if "/models/" in f"/{p}" or p.endswith(("models.py", "schema.py", "schemas.py")): return "model"
    if p.endswith((".jsx", ".tsx")) or "/components/" in f"/{p}": return "ui"
    return "other"


def region_for_path(path: str) -> str:
    parts = PurePosixPath(path).parts
    return parts[0] if len(parts) > 1 else "root"


def loc_bucket(lines: int) -> str:
    return "xs" if lines <= 50 else "s" if lines <= 150 else "m" if lines <= 400 else "l" if lines <= 800 else "xl"


def stable_grid(path: str, columns: int = 8) -> tuple[int, int]:
    value = int(hashlib.sha256(path.encode("utf-8")).hexdigest()[:12], 16)
    return value % columns, (value // columns) % columns


def district_layout(regions: Iterable[str]) -> list[dict[str, Any]]:
    return [{"region_id": region, "x": (i % 4) * 260, "y": (i // 4) * 180, "w": 230, "h": 150} for i, region in enumerate(sorted(set(regions)))]


def heat(events: Iterable[dict[str, Any]], at: datetime | None = None, half_life_minutes: float = 15) -> float:
    at = at or datetime.now(timezone.utc)
    total = 0.0
    for event in events:
        weight = WEIGHTS.get(event["type"], 0.0)
        stamp = datetime.fromisoformat(event["created_at"])
        minutes = max(0, (at - stamp).total_seconds() / 60)
        total += weight * math.pow(0.5, minutes / half_life_minutes)
    return round(total, 4)


def alert_candidates(events: list[dict[str, Any]], edges: set[tuple[str, str]], at: datetime | None = None) -> list[dict[str, Any]]:
    at = at or datetime.now(timezone.utc); recent = [e for e in events if datetime.fromisoformat(e["created_at"]) >= at - timedelta(minutes=10)]
    found: list[dict[str, Any]] = []
    latest_presence: dict[str, dict[str, Any]] = {}
    latest_file_activity: dict[tuple[str, str], dict[str, Any]] = {}
    for event in recent:
        if event.get("path") and event["type"] in ("edit", "checkin"):
            actor_id = event["actor_id"]
            if actor_id not in latest_presence or event["created_at"] > latest_presence[actor_id]["created_at"]:
                latest_presence[actor_id] = event
            key = (actor_id, event["path"])
            if key not in latest_file_activity or event["created_at"] > latest_file_activity[key]["created_at"]:
                latest_file_activity[key] = event
    by_path: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in latest_presence.values(): by_path[event["path"]].append(event)
    for path, rows in by_path.items():
        actors = sorted({r["actor_id"] for r in rows})
        if len(actors) >= 2: found.append(_alert("collision", "high", [path], actors, {"events": len(rows)}))
    active_by_file: dict[str, set[str]] = defaultdict(set)
    for event in latest_file_activity.values():
        active_by_file[event["path"]].add(event["actor_id"])
    for a, b in edges:
        if a in active_by_file and b in active_by_file:
            actors = sorted(active_by_file[a] | active_by_file[b])
            if len(actors) >= 2: found.append(_alert("dependency_risk", "medium", [a, b], actors, {"edge": [a, b]}))
    migrations = [e for e in recent if e.get("path", "").startswith("migrations/") and e["type"] in ("edit", "checkin")]
    branches = {e.get("branch") for e in migrations if e.get("branch")}
    actors = sorted({e["actor_id"] for e in migrations})
    if len(actors) >= 2 and len(branches) >= 2: found.append(_alert("migration_conflict", "high", sorted({e["path"] for e in migrations}), actors, {"branches": sorted(branches)}))
    latest_ci: dict[str, dict[str, Any]] = {}
    for event in events:
        if event["type"] in ("ci_fail", "ci_pass"): latest_ci[event.get("branch") or "default"] = event
    for branch, event in latest_ci.items():
        if event["type"] == "ci_fail": found.append(_alert("ci_storm", "high", [event["path"]] if event.get("path") else [], [event["actor_id"]], {"branch": branch, "ref": event.get("ref")}))
    return found


def _alert(kind: str, severity: str, paths: list[str], actors: list[str], evidence: dict[str, Any]) -> dict[str, Any]:
    key = "|".join((kind, ",".join(sorted(paths)), ",".join(sorted(actors))))
    return {"kind": kind, "severity": severity, "paths": paths, "actors": actors, "evidence": evidence, "dedupe_key": key}


def tracked_paths(repo: Path) -> list[str]:
    output = subprocess.check_output(["git", "-C", str(repo), "ls-files"], text=True, encoding="utf-8")
    return [p for p in output.splitlines() if is_safe_path(p)]


def parse_edges(repo: Path, paths: Iterable[str]) -> tuple[set[tuple[str, str]], float]:
    known = set(paths); parsed = 0; supported = 0; result: set[tuple[str, str]] = set()
    for path in known:
        if not path.endswith((".py", ".js", ".jsx", ".ts", ".tsx")): continue
        supported += 1
        try: text = (repo / path).read_text(encoding="utf-8", errors="ignore")
        except OSError: continue
        parsed += 1
        for raw in re.findall(r"(?:from|import|require\()\s*[\(\"']*([\.\w/\-]+)", text):
            candidate = str((PurePosixPath(path).parent / raw).with_suffix(".py")) if raw.startswith(".") else raw.replace(".", "/") + ".py"
            if candidate in known: result.add((path, candidate))
    return result, (parsed / supported if supported else 1.0)
