"""Authenticated FastAPI routes for OneContext Arena."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from backend.arena.arena_service import arena_service
from backend.arena.imports import build_repository_districts, fetch_github_repository_paths, parse_task_markdown
from backend.core.arena_auth import ArenaIdentity, authorize_session, issue_arena_token, require_arena_identity, verify_arena_token
from backend.core.arena_rate_limit import arena_rate_limiter
from backend.core.broadcaster import broadcaster
from backend.models.arena_schemas import ApproveBossFixRequest, ApproveQuestRequest, ClaimQuestRequest, CreateArenaSessionRequest, JoinArenaSessionRequest, PhaseUnlockOverrideRequest, ProposeBossFixRequest, RepositoryImportRequest, SubmitQuestRequest, SwitchThemeRequest, TaskMarkdownImportRequest
from backend.storage import arena_db, local_db
from backend.arena.live_world import alert_candidates, district_layout, heat, is_safe_path, kind_for_path, loc_bucket, now_iso, parse_edges, region_for_path, stable_grid, tracked_paths
from backend.arena.world_builder import world_builder

logger = logging.getLogger("onecontext.api.arena")
router = APIRouter(prefix="/arena", tags=["Arena"])
REPO_ROOT = Path(__file__).parents[2]
_last_world_delta: dict[str, float] = {}


def _identity_for_session(identity: ArenaIdentity, session_id: str, host_only: bool = False) -> ArenaIdentity:
    authorize_session(identity, session_id, host_only=host_only)
    if not arena_db.get_session_member(session_id, identity.user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Arena member is no longer active in this session.")
    return identity


def _ensure_live_world(session_id: str) -> tuple[list[dict], float]:
    files = arena_db.live_files(session_id)
    if files: return files, 1.0
    paths = tracked_paths(REPO_ROOT)
    rows = []
    for path in paths:
        try: line_count = (REPO_ROOT / path).read_text(encoding="utf-8", errors="ignore").count("\n") + 1
        except OSError: line_count = 0
        rows.append({"path": path, "region_id": region_for_path(path), "kind": kind_for_path(path), "loc": loc_bucket(line_count)})
    edges, coverage = parse_edges(REPO_ROOT, paths)
    arena_db.replace_live_world(session_id, rows, sorted(edges), district_layout(r["region_id"] for r in rows))
    return arena_db.live_files(session_id), coverage


def _world_payload(session_id: str) -> dict:
    files, coverage = _ensure_live_world(session_id)
    activity = arena_db.live_activity(session_id, minutes=24 * 60)
    edges = []
    with local_db.get_connection() as conn:
        edges = [dict(r) for r in conn.execute("SELECT from_path, to_path FROM arena_file_edges WHERE session_id = ?", (session_id,))]
    grouped = {f["path"]: [e for e in activity if e.get("path") == f["path"]] for f in files}
    buildings = [{**f, "heat": heat(grouped[f["path"]]), "themed_label": f["kind"].replace("_", " ").title(), "grid": stable_grid(f["path"])} for f in files]
    visible = sorted(buildings, key=lambda b: (-b["heat"], b["path"]))
    alerts = alert_candidates(activity, {(e["from_path"], e["to_path"]) for e in edges})
    # Findings are evidence from the existing deterministic scanner, never LLM inventions.
    clean_paths = {e.get("path") for e in activity if e["type"] == "finding" and e.get("ref") == "clean_rescan" and e.get("source") == "github"}
    for finding in world_builder._inspect_security_findings():
        paths = [p for p in finding.affected_files if p not in clean_paths]
        if paths:
            alerts.append({"kind": "security_boss", "severity": finding.severity, "paths": paths, "actors": [], "evidence": {"finding_id": finding.id, "scanner": finding.scanner, "title": finding.title}, "dedupe_key": f"security_boss|{','.join(sorted(paths))}|"})
    latest_avatar_activity: dict[str, dict] = {}
    for event in activity:
        actor_id = event["actor_id"]
        if actor_id not in latest_avatar_activity or event["created_at"] > latest_avatar_activity[actor_id]["created_at"]:
            latest_avatar_activity[actor_id] = event
    member_names = {
        member["user_id"]: member["user_name"]
        for member in arena_db.get_session_members(session_id)
    }
    avatars = [
        {
            "actor": e["actor_id"],
            "user_name": member_names.get(e["actor_id"], e["actor_id"]),
            "type": e["actor_type"],
            "path": e.get("path"),
            "last_seen": e["created_at"],
        }
        for e in sorted(latest_avatar_activity.values(), key=lambda item: item["created_at"], reverse=True)[:60]
    ]
    return {"districts": district_layout(f["region_id"] for f in files), "buildings": visible, "edges": edges, "avatars": avatars, "quest_markers": [], "alerts": alerts, "coverage": coverage, "simulated": any(e["source"] == "simulated" for e in activity)}


def _roadmap_payload(session_id: str) -> dict:
    phases = arena_db.get_roadmap_phases(session_id)
    leaderboard = arena_db.get_verified_leaderboard(session_id)
    leaderboard_by_user = {member["user_id"]: member for member in leaderboard}
    theme_pack = arena_db.get_latest_theme_pack(session_id)
    game_bible = (theme_pack or {}).get("game_bible") or {}
    archetypes = game_bible.get("phase_landmark_archetypes") or ["camp", "workshop", "bridge", "tower", "castle"]
    allowed_archetypes = {"camp", "workshop", "bridge", "tower", "castle"}
    archetypes = [value if value in allowed_archetypes else "camp" for value in archetypes if isinstance(value, str)] or ["camp"]
    terrain_styles = {"grass", "stone", "sand", "snow", "water"}
    terrain_style = game_bible.get("terrain_style")
    if terrain_style not in terrain_styles:
        terrain_style = "grass"

    roadmap_phases = []
    previous_complete = True
    verified_total = total_quests = 0
    phase_completed_count = 0
    any_verified = False
    now = datetime.now(timezone.utc)
    for index, phase in enumerate(phases):
        quests = phase["quests"]
        verified_quests = [quest for quest in quests if quest["status"] == "verified"]
        quest_total = len(quests)
        verified_count = len(verified_quests)
        progress = round(verified_count / quest_total * 100, 1) if quest_total else 0
        is_complete = verified_count == quest_total
        override = bool(phase["unlock_overridden"])
        locked = not override and index > 0 and not previous_complete
        stars = 0
        if quest_total and verified_count >= (quest_total + 1) // 2:
            stars = 1
        if quest_total and verified_count == quest_total:
            stars = 2
            due_quests = [quest for quest in quests if quest.get("due_date")]
            if due_quests:
                finished_on_time = all(
                    quest.get("verified_at")
                    and quest["verified_at"][:10] <= quest["due_date"]
                    for quest in due_quests
                )
                if finished_on_time:
                    stars = 3

        phase_due_dates = [quest["due_date"] for quest in quests if quest.get("due_date")]
        roadmap_quests = []
        for quest in quests:
            evidence = quest.get("evidence") or {}
            evidence_links = []
            for candidate in (quest.get("issue_url"), evidence.get("pr_url")):
                if isinstance(candidate, str) and candidate.startswith("https://github.com/"):
                    evidence_links.append(candidate)
            roadmap_quests.append({
                "id": quest["id"],
                "title": quest["original_title"],
                "themed_title": quest["themed_title"],
                "xp": quest["xp_reward"],
                "due_date": quest.get("due_date"),
                "assignee": {"id": quest.get("assigned_to"), "name": quest.get("assigned_name")} if quest.get("assigned_name") else None,
                "status": quest["status"],
                "verification_type": quest["verification_type"],
                "evidence": evidence,
                "evidence_links": evidence_links,
            })
        roadmap_phases.append({
            "id": phase["id"],
            "order": phase["phase_order"],
            "title": phase["title"],
            "themed_title": phase["themed_title"],
            "description": phase["description"],
            "unlock_rule": phase["unlock_rule"],
            "locked": locked,
            "unlock_overridden": override,
            "progress": progress,
            "verified_quests": verified_count,
            "total_quests": quest_total,
            "stars": stars,
            "due_date": max(phase_due_dates) if phase_due_dates else None,
            "landmark_archetype": archetypes[index % len(archetypes)],
            "quests": roadmap_quests,
        })
        verified_total += verified_count
        total_quests += quest_total
        phase_completed_count += int(is_complete and quest_total > 0)
        any_verified = any_verified or verified_count > 0
        previous_complete = is_complete

    members = []
    for member in arena_db.get_session_members(session_id):
        current_phase_id = None
        current_quest_id = member.get("current_quest_id")
        for phase in phases:
            if any(quest["id"] == current_quest_id for quest in phase["quests"]):
                current_phase_id = phase["id"]
                break
        if not current_phase_id:
            for phase in phases:
                if any(
                    quest.get("assigned_to") == member["user_id"]
                    and quest["status"] in {"claimed", "submitted"}
                    for quest in phase["quests"]
                ):
                    current_phase_id = phase["id"]
                    break
        score = leaderboard_by_user.get(member["user_id"], {})
        members.append({
            "user_id": member["user_id"],
            "user_name": member["user_name"],
            "avatar_style": member.get("avatar_style"),
            "current_phase_id": current_phase_id,
            "verified_xp": score.get("verified_xp", 0),
        })

    overall_progress = round(verified_total / total_quests * 100, 1) if total_quests else 0
    achievements = [
        {"id": "first_quest_verified", "title": "First Steps", "unlocked": any_verified},
        {"id": "phase_complete", "title": "Phase Champion", "unlocked": phase_completed_count > 0},
        {"id": "all_phases_complete", "title": "Roadmap Complete", "unlocked": bool(phases) and all(
            phase["total_quests"] == 0 or phase["verified_quests"] == phase["total_quests"]
            for phase in roadmap_phases
        )},
    ]
    return {
        "session_id": session_id,
        "overall_progress": overall_progress,
        "verified_quests": verified_total,
        "total_quests": total_quests,
        "verified_xp": sum(member["verified_xp"] for member in leaderboard),
        "terrain_style": terrain_style,
        "members": members,
        "phases": roadmap_phases,
        "achievements": achievements,
    }


def _publish_world_changes(session_id: str, world: dict) -> None:
    import time
    changes = arena_db.sync_live_alerts(session_id, world["alerts"])
    for alert in changes["opened"]: broadcaster.publish_nowait(session_id, {"type": "alert_opened", "alert": alert})
    for alert in changes["resolved"]: broadcaster.publish_nowait(session_id, {"type": "alert_resolved", "alert": alert})
    now = time.monotonic()
    if now - _last_world_delta.get(session_id, 0) >= 0.5:
        _last_world_delta[session_id] = now
        broadcaster.publish_nowait(session_id, {"type": "world_delta", "buildings": world["buildings"], "avatars": world["avatars"], "alerts": world["alerts"], "quests": []})


@router.get("/sessions")
def list_sessions(project_id: Optional[str] = Query(None)):
    return arena_db.list_arena_sessions(project_id=project_id)


@router.post("/sessions")
def create_session(req: CreateArenaSessionRequest, request: Request):
    """Bootstrap endpoint: creates host membership and returns a signed token."""
    arena_rate_limiter.check(request, "arena session creation", limit=5)
    if hasattr(request.app.state, "hindsight"):
        arena_service.hindsight = request.app.state.hindsight
    if hasattr(request.app.state, "llm"):
        arena_service.llm = request.app.state.llm
        from backend.arena.game_engine import game_engine
        game_engine.llm_client = request.app.state.llm
    try:
        details = arena_service.create_session(req)
        session = details["session"]
        details["arena_token"] = issue_arena_token(session["host_user_id"], session["id"], "host")
        return details
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Arena authentication is not configured.") from exc
    except Exception as exc:
        logger.error("Failed to create Arena session: %s", exc, exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/sessions/{session_id}")
def get_session(session_id: str, identity: ArenaIdentity = Depends(require_arena_identity)):
    _identity_for_session(identity, session_id)
    try:
        return arena_service.get_session_details(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/sessions/{session_id}/repository-import")
def import_repository(
    session_id: str,
    payload: RepositoryImportRequest,
    identity: ArenaIdentity = Depends(require_arena_identity),
):
    identity = _identity_for_session(identity, session_id, host_only=True)
    try:
        owner, repository, paths = fetch_github_repository_paths(payload.repo_url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    modules, regions = build_repository_districts(paths)
    repo_url = f"https://github.com/{owner}/{repository}"
    try:
        arena_db.replace_repository_world(
            session_id,
            repo_url,
            f"{owner}/{repository}",
            modules,
            regions,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    arena_db.write_arena_audit(
        session_id,
        "repository_imported",
        identity.user_id,
        {"repo_name": f"{owner}/{repository}", "files": len(paths), "districts": len(regions)},
    )
    broadcaster.publish_nowait(
        session_id,
        {"type": "arena_world_imported", "repo_name": f"{owner}/{repository}", "district_count": len(regions)},
    )
    return {
        "repository": f"{owner}/{repository}",
        "file_count": len(paths),
        "district_count": len(regions),
        "districts": [{"region_id": r["region_id"], "name": r["original_name"], "file_count": modules[i]["file_count"]} for i, r in enumerate(regions)],
    }


@router.post("/sessions/{session_id}/tasks-import")
def import_tasks(
    session_id: str,
    payload: TaskMarkdownImportRequest,
    identity: ArenaIdentity = Depends(require_arena_identity),
):
    identity = _identity_for_session(identity, session_id, host_only=True)
    try:
        phases = parse_task_markdown(
            payload.markdown,
            default_xp=payload.default_xp,
            verification_type=payload.verification_type,
        )
        quest_ids = arena_db.add_imported_quests(session_id, phases)
        theme = arena_db.get_latest_theme_pack(session_id)
        if theme:
            game_bible = theme.get("game_bible") or {}
            arena_db.retheme_roadmap_phases(session_id, game_bible.get("phase_landmark_names") or [])
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    arena_db.write_arena_audit(
        session_id,
        "tasks_imported",
        identity.user_id,
        {"count": len(quest_ids), "phase_count": len(phases), "source": "markdown_upload"},
    )
    broadcaster.publish_nowait(
        session_id,
        {"type": "arena_quest_updated", "session_id": session_id, "imported_count": len(quest_ids)},
    )
    return {"imported_count": len(quest_ids), "phase_count": len(phases), "quest_ids": quest_ids}


@router.get("/sessions/{session_id}/roadmap")
def get_roadmap(session_id: str, identity: ArenaIdentity = Depends(require_arena_identity)):
    _identity_for_session(identity, session_id)
    return _roadmap_payload(session_id)


@router.post("/sessions/{session_id}/phases/{phase_id}/unlock")
def override_phase_lock(
    session_id: str,
    phase_id: str,
    payload: PhaseUnlockOverrideRequest,
    identity: ArenaIdentity = Depends(require_arena_identity),
):
    identity = _identity_for_session(identity, session_id, host_only=True)
    if not arena_db.override_phase_unlock(session_id, phase_id, payload.unlocked, identity.user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Roadmap phase not found.")
    return _roadmap_payload(session_id)


@router.get("/sessions/{session_id}/leaderboard")
def get_roadmap_leaderboard(session_id: str, identity: ArenaIdentity = Depends(require_arena_identity)):
    _identity_for_session(identity, session_id)
    return {"session_id": session_id, "leaderboard": arena_db.get_verified_leaderboard(session_id)}


@router.get("/sessions/{session_id}/members/{member_id}/xp")
def get_member_xp_breakdown(
    session_id: str,
    member_id: str,
    identity: ArenaIdentity = Depends(require_arena_identity),
):
    _identity_for_session(identity, session_id)
    if not arena_db.get_session_member(session_id, member_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arena member not found.")
    return {
        "session_id": session_id,
        "user_id": member_id,
        "verified_xp": arena_db.get_member_verified_xp(session_id, member_id),
    }


@router.post("/sessions/join")
def join_session(req: JoinArenaSessionRequest, request: Request):
    """Bootstrap endpoint: an unexpired join code returns a member token."""
    arena_rate_limiter.check(request, "arena join", limit=10)
    try:
        result = arena_service.join_session(req)
        member = result["member"]
        result["arena_token"] = issue_arena_token(member["user_id"], result["session"]["id"], member["role"])
        return result
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Arena authentication is not configured.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/sessions/{session_id}/heartbeat")
def member_heartbeat(session_id: str, current_region_id: Optional[str] = Query(None), current_quest_id: Optional[str] = Query(None), identity: ArenaIdentity = Depends(require_arena_identity)):
    _identity_for_session(identity, session_id)
    arena_db.update_member_heartbeat(session_id, identity.user_id, current_region_id, current_quest_id)
    return {"status": "ok", "user_id": identity.user_id, "session_id": session_id}


@router.get("/sessions/{session_id}/stream")
async def stream_arena_events(session_id: str, request: Request, access_token: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    """SSE accepts a signed query token because browser EventSource cannot send headers."""
    if access_token:
        identity = verify_arena_token(access_token)
    elif authorization and authorization.startswith("Bearer "):
        identity = verify_arena_token(authorization.removeprefix("Bearer ").strip())
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Arena bearer token is required.")
    _identity_for_session(identity, session_id)
    queue = broadcaster.subscribe(session_id)

    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'connected', 'session_id': session_id})}\n\n"
            while not await request.is_disconnected():
                try:
                    yield f"data: {json.dumps(await asyncio.wait_for(queue.get(), timeout=20.0))}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            broadcaster.unsubscribe(session_id, queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})


@router.post("/sessions/{session_id}/quests/{quest_id}/claim")
def claim_quest(session_id: str, quest_id: str, _req: ClaimQuestRequest, identity: ArenaIdentity = Depends(require_arena_identity)):
    identity = _identity_for_session(identity, session_id)
    member = arena_db.get_session_member(session_id, identity.user_id)
    try:
        return arena_service.claim_quest(session_id, quest_id, identity.user_id, member["user_name"])
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/sessions/{session_id}/quests/{quest_id}/submit")
def submit_quest(
    session_id: str,
    quest_id: str,
    payload: SubmitQuestRequest,
    identity: ArenaIdentity = Depends(require_arena_identity),
):
    _identity_for_session(identity, session_id)
    try:
        return arena_service.submit_quest(session_id, quest_id, identity.user_id, payload.evidence_note)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/sessions/{session_id}/quests/{quest_id}/approve")
def approve_quest(
    session_id: str,
    quest_id: str,
    payload: ApproveQuestRequest,
    identity: ArenaIdentity = Depends(require_arena_identity),
):
    identity = _identity_for_session(identity, session_id, host_only=True)
    try:
        return arena_service.approve_quest(session_id, quest_id, identity.user_id, payload.evidence_note)
    except ValueError as exc:
        detail = str(exc)
        code = status.HTTP_403_FORBIDDEN if "cannot approve their own" in detail else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=detail) from exc


@router.post("/sessions/{session_id}/bosses/{boss_id}/propose-fix")
def propose_boss_fix(session_id: str, boss_id: str, req: ProposeBossFixRequest, identity: ArenaIdentity = Depends(require_arena_identity)):
    _identity_for_session(identity, session_id)
    return arena_service.propose_boss_fix(session_id, boss_id, req.agent_id, req.diff, req.branch_name, req.explanation)


@router.post("/sessions/{session_id}/bosses/{boss_id}/approve")
def approve_boss_fix(session_id: str, boss_id: str, req: ApproveBossFixRequest, identity: ArenaIdentity = Depends(require_arena_identity)):
    identity = _identity_for_session(identity, session_id, host_only=True)
    return arena_service.approve_boss_fix(session_id, boss_id, identity.user_id, req.run_verification)


@router.post("/sessions/{session_id}/switch-theme")
def switch_theme(session_id: str, req: SwitchThemeRequest, request: Request, identity: ArenaIdentity = Depends(require_arena_identity)):
    identity = _identity_for_session(identity, session_id, host_only=True)
    arena_rate_limiter.check(request, "arena generation", limit=3)
    if hasattr(request.app.state, "llm"):
        from backend.arena.game_engine import game_engine
        game_engine.llm_client = request.app.state.llm
    result = arena_service.switch_theme(session_id, req.new_game_name, req.new_game_description)
    arena_db.write_arena_audit(session_id, "theme_regenerated", identity.user_id, {"game_name": req.new_game_name})
    return result


@router.get("/sessions/{session_id}/recap")
def get_session_recap(session_id: str, identity: ArenaIdentity = Depends(require_arena_identity)):
    _identity_for_session(identity, session_id)
    return arena_service.generate_session_recap(session_id)


@router.get("/sessions/{session_id}/lore")
def search_lore(session_id: str, query: str = Query("architecture"), request: Request = None, identity: ArenaIdentity = Depends(require_arena_identity)):
    _identity_for_session(identity, session_id)
    session = arena_db.get_arena_session_by_id(session_id)
    project = local_db.get_project(session["project_id"])
    bank_id = project["bank_id"] if project else f"onecontext-{session['project_id']}"
    results = []
    if hasattr(request.app.state, "hindsight"):
        try:
            results = request.app.state.hindsight.recall(bank_id=bank_id, query=query, max_results=8)
        except Exception as exc:
            logger.warning("Hindsight recall error: %s", exc)
    return {"session_id": session_id, "query": query, "lore_count": len(results), "lore_records": results}


@router.get("/sessions/{session_id}/world")
def get_world(session_id: str, since: Optional[str] = Query(None), identity: ArenaIdentity = Depends(require_arena_identity)):
    _identity_for_session(identity, session_id)
    return _world_payload(session_id)


@router.post("/sessions/{session_id}/world/refresh")
def refresh_world(session_id: str, identity: ArenaIdentity = Depends(require_arena_identity)):
    identity = _identity_for_session(identity, session_id, host_only=True)
    files = arena_db.live_files(session_id)
    # Rebuild only metadata, never source contents or previous activity.
    if files:
        with local_db.get_connection() as conn:
            conn.execute("DELETE FROM arena_files WHERE session_id = ?", (session_id,)); conn.execute("DELETE FROM arena_file_edges WHERE session_id = ?", (session_id,)); conn.execute("DELETE FROM arena_layout WHERE session_id = ?", (session_id,)); conn.commit()
    world = _world_payload(session_id)
    _publish_world_changes(session_id, world)
    arena_db.write_arena_audit(session_id, "world_refreshed", identity.user_id, {"files": len(arena_db.live_files(session_id))})
    return world


@router.post("/sessions/{session_id}/activity")
def ingest_activity(session_id: str, payload: dict, request: Request, identity: ArenaIdentity = Depends(require_arena_identity)):
    identity = _identity_for_session(identity, session_id)
    arena_rate_limiter.check(request, "arena activity", limit=60)
    items = payload.get("events", [])
    if not isinstance(items, list) or len(items) > 50: raise HTTPException(status_code=422, detail="events must contain at most 50 items")
    files = {row["path"] for row in arena_db.live_files(session_id)}
    accepted, dropped = [], 0
    for item in items:
        path = item.get("path")
        if not isinstance(path, str) or path not in files or not is_safe_path(path) or item.get("type") not in {"edit","commit","pr","ci_fail","ci_pass","finding","context_read","checkin"}:
            dropped += 1; continue
        source = item.get("source", "manual")
        # Browser/manual callers cannot manufacture GitHub/MCP/scanner evidence.
        if source not in {"manual", "watcher", "simulated"} or item.get("type") == "finding":
            dropped += 1; continue
        if source == "simulated" and os.getenv("ARENA_DEV_SIMULATOR") != "1": dropped += 1; continue
        accepted.append({"actor_type": "user", "actor_id": identity.user_id, "path": path, "type": item["type"], "branch": item.get("branch"), "ref": item.get("ref"), "source": source, "created_at": now_iso()})
    if accepted:
        arena_db.record_live_activity(session_id, accepted)
        _publish_world_changes(session_id, _world_payload(session_id))
    arena_db.write_arena_audit(session_id, "activity_ingested", identity.user_id, {"accepted": len(accepted), "dropped": dropped})
    return {"accepted": len(accepted), "dropped": dropped, "simulated": any(e["source"] == "simulated" for e in accepted)}


@router.post("/sessions/{session_id}/checkin")
def checkin(session_id: str, payload: dict, request: Request, identity: ArenaIdentity = Depends(require_arena_identity)):
    path = payload.get("path")
    return ingest_activity(session_id, {"events": [{"path": path, "type": "checkin", "source": "manual", "branch": payload.get("branch")}]}, request, identity)


@router.post("/sessions/{session_id}/world/simulate")
def simulate_world(session_id: str, payload: dict, request: Request, identity: ArenaIdentity = Depends(require_arena_identity)):
    if os.getenv("ARENA_DEV_SIMULATOR") != "1": raise HTTPException(status_code=404, detail="Simulator is disabled.")
    identity = _identity_for_session(identity, session_id, host_only=True)
    events = [{**item, "source": "simulated"} for item in payload.get("events", [])]
    return ingest_activity(session_id, {"events": events}, request, identity)


@router.get("/sessions/{session_id}/activity")
def get_activity(session_id: str, minutes: int = Query(30, ge=1, le=1440), identity: ArenaIdentity = Depends(require_arena_identity)):
    _identity_for_session(identity, session_id)
    return {"events": arena_db.live_activity(session_id, minutes)}


@router.get("/sessions/{session_id}/files")
def get_file_panel(session_id: str, path: str = Query(...), identity: ArenaIdentity = Depends(require_arena_identity)):
    _identity_for_session(identity, session_id)
    if not is_safe_path(path) or path not in {f["path"] for f in arena_db.live_files(session_id)}: raise HTTPException(status_code=404, detail="File not available in this world.")
    events = [e for e in arena_db.live_activity(session_id, 24 * 60) if e.get("path") == path]
    entities = arena_db.get_arena_entities(session_id)
    model = arena_db.get_world_model(session_id) or {}
    alerts = [alert for alert in _world_payload(session_id)["alerts"] if path in alert.get("paths", [])]
    linked_quests = [quest for quest in entities["quests"] if path in str(quest.get("description", "")) or path in str(quest.get("original_title", ""))]
    # World-model memories are metadata supplied by the server; source contents
    # are deliberately never read or returned from this endpoint.
    memories = (model.get("model") or {}).get("memories", [])
    return {"path": path, "current_actors": sorted({e["actor_id"] for e in events}), "linked_quests": linked_quests, "open_alerts": alerts, "related_memories": memories[:5], "recent_commits": [e for e in events if e["type"] == "commit"], "recent_activity": events}
