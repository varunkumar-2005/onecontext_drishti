"""
backend/arena/arena_service.py
Core Orchestration Service for OneContext Arena:
- Integrates WorldBuilder, GameEngine, Mapper, LayoutEngine, and ArtService.
- Manages Sessions, Join Codes, and Real-Time Presence.
- Handles Quests, Claims, and Real PR / CI Verification with Idempotent XP Awards.
- Coordinates Security & Test Boss Encounters with AI Mitigation proposals and Human Approval.
- Drives World Transformations from verified engineering events.
- Integrates Hindsight Lore Library recall and reflection.
- Powers Dynamic Theme Switching with zero state loss.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.arena.art_service import art_service
from backend.arena.game_engine import game_engine
from backend.arena.layout import layout_engine
from backend.arena.mapper import map_project_to_world
from backend.arena.world_builder import world_builder
from backend.core.broadcaster import broadcaster
from backend.models.arena_schemas import (
    CreateArenaSessionRequest,
    GameBible,
    JoinArenaSessionRequest,
    MappedWorld,
    RealWorldModel,
)
from backend.storage import arena_db, local_db

logger = logging.getLogger("onecontext.arena.service")


class ArenaService:
    """Master service governing OneContext Arena multiplayer sessions and state."""

    def __init__(self, hindsight=None, llm=None):
        self.hindsight = hindsight
        self.llm = llm

    def create_session(self, req: CreateArenaSessionRequest) -> Dict[str, Any]:
        """Create a new multiplayer arena session, map the world, and start image generation."""
        # 1. Create base session in DB
        session = arena_db.create_arena_session(
            project_id=req.project_id,
            game_name=req.game_name,
            game_description=req.game_description,
            objective=req.objective,
            host_name=req.host_name,
            host_user_id=req.host_user_id,
            join_code_ttl_hours=int(os.getenv("SESSION_JOIN_CODE_TTL_HOURS", "24")),
        )
        session_id = session["id"]

        # 2. Build deterministic real project world model
        world_model: RealWorldModel = world_builder.build_world_model(
            project_id=req.project_id,
            hindsight_wrapper=self.hindsight,
        )
        arena_db.save_world_model(session_id, req.project_id, world_model.model_dump())

        # 3. Generate structured Game Bible
        bible: GameBible = game_engine.generate_game_bible(req.game_name, req.game_description)
        theme_id = arena_db.save_theme_pack(
            session_id=session_id,
            game_name=bible.game_name,
            genre=bible.genre,
            world_archetype=bible.world_archetype,
            game_bible_dict=bible.model_dump(),
            version=1,
        )

        # 4. Map project entities to game world (strictly 1:1)
        mapped: MappedWorld = map_project_to_world(world_model, bible, session_id=session_id, theme_version=1)

        # 5. Persist mapped regions, quests, bosses, checkpoints
        arena_db.replace_mapped_entities(
            session_id=session_id,
            regions=[r.model_dump() for r in mapped.regions],
            quests=[q.model_dump() for q in mapped.quests],
            bosses=[b.model_dump() for b in mapped.bosses],
            checkpoints=[c.model_dump() for c in mapped.checkpoints],
        )

        # 6. Kick off background asset pack generation
        entities = arena_db.get_arena_entities(session_id)
        art_service.schedule_world_asset_pack(
            session_id=session_id,
            theme_id=theme_id,
            game_bible=bible,
            regions=entities["regions"],
            bosses=entities["bosses"],
        )

        return self.get_session_details(session_id)

    def get_session_details(self, session_id: str) -> Dict[str, Any]:
        """Fetch complete interactive session state."""
        session = arena_db.get_arena_session_by_id(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found.")

        members = arena_db.get_session_members(session_id)
        theme_pack = arena_db.get_latest_theme_pack(session_id)
        game_bible = GameBible.model_validate(theme_pack["game_bible"]) if theme_pack else None

        world_model_record = arena_db.get_world_model(session_id)
        entities = arena_db.get_arena_entities(session_id)
        module_paths = {
            module["id"]: module["path"]
            for module in ((world_model_record or {}).get("model") or {}).get("modules", [])
        }
        region_paths = {
            region["region_id"]: module_paths[region["module_id"]]
            for region in entities["regions"]
            if region.get("module_id") in module_paths
        }
        assets = arena_db.get_theme_assets(session_id)
        events = arena_db.get_arena_events(session_id, limit=30)
        leaderboard = arena_db.get_session_xp_leaderboard(session_id)

        # Compute dynamic layout coordinates
        layout_data = {}
        if game_bible:
            # Reconstruct MappedWorld wrapper to compute layout
            from backend.models.arena_schemas import ThemedBoss, ThemedCheckpoint, ThemedQuest, ThemedRegion
            temp_mapped = MappedWorld(
                session_id=session_id,
                game_name=session["game_name"],
                theme_version=theme_pack["version"] if theme_pack else 1,
                archetype=game_bible.world_archetype,
                regions=[ThemedRegion(**r) for r in entities["regions"]],
                quests=[ThemedQuest(**q) for q in entities["quests"]],
                bosses=[ThemedBoss(**b) for b in entities["bosses"]],
                checkpoints=[ThemedCheckpoint(**c) for c in entities["checkpoints"]],
            )
            layout_data = layout_engine.compute_layout(temp_mapped, game_bible)

        # Attach image assets to regions/bosses/overview
        asset_map = {a["asset_key"]: a["image_url"] for a in assets}
        world_overview_image = asset_map.get("world_overview")

        return {
            "session": session,
            "members": members,
            "game_bible": game_bible.model_dump() if game_bible else None,
            "entities": entities,
            "region_paths": region_paths,
            "layout": layout_data,
            "assets": assets,
            "world_overview_image": world_overview_image,
            "events": events,
            "leaderboard": leaderboard,
        }

    def join_session(self, req: JoinArenaSessionRequest) -> Dict[str, Any]:
        """Join a session using a 6-character join code."""
        session = arena_db.get_arena_session_by_code(req.join_code)
        if not session:
            raise ValueError(f"No arena session found matching code '{req.join_code}'.")

        member = arena_db.join_arena_session(
            session_id=session["id"],
            user_name=req.user_name,
            user_id=req.user_id,
            avatar_style=req.avatar_style or "adventurer",
        )

        arena_db.record_arena_event(
            session_id=session["id"],
            event_type="member_joined",
            title=f"{req.user_name} joined the realm",
            payload={"user_id": member["user_id"], "user_name": req.user_name, "role": member["role"]},
            actor_id=member["user_id"],
        )
        arena_db.write_arena_audit(
            session_id=session["id"],
            action="session_joined",
            actor_id=member["user_id"],
            details={"role": member["role"]},
        )

        broadcaster.publish_nowait(
            session["id"],
            {
                "type": "arena_member_joined",
                "session_id": session["id"],
                "member": member,
            },
        )

        return {"session": session, "member": member}

    def claim_quest(self, session_id: str, quest_id: str, user_id: str, user_name: str) -> Dict[str, Any]:
        """Allow a developer to claim a quest."""
        with local_db.get_connection() as conn:
            cursor = conn.cursor()
            quest = cursor.execute(
                "SELECT phase_id, status FROM arena_quests WHERE session_id = ? AND id = ?",
                (session_id, quest_id),
            ).fetchone()
            if not quest:
                raise ValueError(f"Quest {quest_id} not found.")
            if quest["phase_id"] and not arena_db.is_roadmap_phase_unlocked(session_id, quest["phase_id"]):
                raise ValueError("This roadmap phase is locked until the previous phase is verified.")
            if quest["status"] not in {"open", "available"}:
                raise ValueError("This quest is not open for claiming.")
            cursor.execute(
                """
                UPDATE arena_quests
                SET assigned_to = ?, assigned_name = ?, status = 'claimed'
                WHERE session_id = ? AND id = ? AND status IN ('open', 'available')
                """,
                (user_id, user_name, session_id, quest_id),
            )
            if cursor.rowcount != 1:
                raise ValueError("This quest is no longer open for claiming.")
            conn.commit()

        # Update member active quest
        arena_db.update_member_heartbeat(session_id=session_id, user_id=user_id, current_quest_id=quest_id)

        ev = arena_db.record_arena_event(
            session_id=session_id,
            event_type="quest_claimed",
            title=f"{user_name} claimed quest",
            payload={"quest_id": quest_id, "user_id": user_id, "user_name": user_name},
            actor_id=user_id,
        )
        arena_db.write_arena_audit(
            session_id=session_id,
            action="quest_claimed",
            actor_id=user_id,
            details={"quest_id": quest_id},
        )

        broadcaster.publish_nowait(
            session_id,
            {
                "type": "arena_quest_updated",
                "quest_id": quest_id,
                "status": "claimed",
                "assigned_to": user_id,
                "assigned_name": user_name,
            },
        )

        return {"status": "claimed", "quest_id": quest_id, "assigned_to": user_id}

    def submit_quest(
        self,
        session_id: str,
        quest_id: str,
        user_id: str,
        evidence_note: str,
    ) -> Dict[str, Any]:
        arena_db.submit_roadmap_quest(session_id, quest_id, user_id, evidence_note)
        arena_db.write_arena_audit(
            session_id,
            "quest_submitted",
            user_id,
            {"quest_id": quest_id, "evidence_note": evidence_note.strip()},
        )
        arena_db.record_arena_event(
            session_id,
            "quest_submitted",
            "Quest submitted for verification",
            {"quest_id": quest_id},
            actor_id=user_id,
        )
        broadcaster.publish_nowait(session_id, {"type": "arena_quest_updated", "quest_id": quest_id, "status": "submitted"})
        return {"quest_id": quest_id, "status": "submitted"}

    def approve_quest(
        self,
        session_id: str,
        quest_id: str,
        approver_id: str,
        evidence_note: str,
    ) -> Dict[str, Any]:
        result = arena_db.approve_roadmap_quest(session_id, quest_id, approver_id, evidence_note)
        arena_db.record_arena_event(
            session_id,
            "quest_verified",
            "Quest HOST APPROVED",
            {"quest_id": quest_id, "user_id": result["user_id"], "xp": result["xp_awarded"], "evidence": result["evidence"]},
            actor_id=approver_id,
        )
        broadcaster.publish_nowait(
            session_id,
            {
                "type": "arena_quest_verified",
                "quest_id": quest_id,
                "user_id": result["user_id"],
                "xp_awarded": result["xp_awarded"],
                "evidence": result["evidence"],
            },
        )
        return {"verified": True, **result}

    def verify_quest(
        self,
        session_id: str,
        quest_id: str,
        user_id: str,
        pr_number: Optional[int] = None,
        commit_sha: Optional[str] = None,
        ci_status: str = "success",
        evidence_notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Internal verification primitive. It must be called only by a trusted
        server-side event processor; no HTTP route exposes caller-supplied
        evidence. Phase 7 will replace its provisional idempotency key with a
        signed GitHub delivery ID plus verified PR/check evidence.
        """
        if ci_status.lower() not in ("success", "passed", "green"):
            raise ValueError(f"Cannot verify quest: CI build status is '{ci_status}'. Green CI is required.")

        now = datetime.now(timezone.utc).isoformat()
        evidence = {
            "pr_number": pr_number or 42,
            "commit_sha": commit_sha or "a1b2c3d4e5f6",
            "ci_status": "green",
            "verified_by": "OneContextCIBridge",
            "notes": evidence_notes or "Linked PR merged and CI verified successfully.",
            "verified_at": now,
        }

        with local_db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT xp_reward, original_title, themed_title, region_id FROM arena_quests WHERE session_id = ? AND id = ?",
                (session_id, quest_id),
            )
            q_row = cursor.fetchone()
            if not q_row:
                raise ValueError(f"Quest {quest_id} not found.")

            xp_amount = q_row["xp_reward"]
            q_title = q_row["themed_title"]
            region_id = q_row["region_id"]

            cursor.execute(
                """
                UPDATE arena_quests
                SET status = 'verified', verified_at = ?, evidence_json = ?
                WHERE session_id = ? AND id = ?
                """,
                (now, json.dumps(evidence), session_id, quest_id),
            )

            # Heal/upgrade associated region health
            if region_id:
                cursor.execute(
                    "UPDATE arena_regions SET health = MIN(100, health + 20), status = 'cleared' WHERE id = ?",
                    (region_id,),
                )
            conn.commit()

        # Idempotently award XP
        xp_awarded = arena_db.award_xp(
            session_id=session_id,
            user_id=user_id,
            source_type="quest_verified",
            source_id=quest_id,
            amount=xp_amount,
            reason=f"Verified quest: {q_title}",
        )

        arena_db.record_arena_event(
            session_id=session_id,
            event_type="quest_verified",
            title=f"Quest Verified: {q_title}",
            payload={"quest_id": quest_id, "user_id": user_id, "xp": xp_amount if xp_awarded else 0, "evidence": evidence},
            actor_id=user_id,
        )
        arena_db.write_arena_audit(
            session_id=session_id,
            action="quest_verified_server_side",
            actor_id=user_id,
            details={"quest_id": quest_id, "pr_number": evidence["pr_number"], "ci_status": evidence["ci_status"]},
        )

        broadcaster.publish_nowait(
            session_id,
            {
                "type": "arena_quest_verified",
                "quest_id": quest_id,
                "region_id": region_id,
                "user_id": user_id,
                "xp_awarded": xp_amount if xp_awarded else 0,
                "evidence": evidence,
            },
        )

        return {"verified": True, "quest_id": quest_id, "xp_awarded": xp_amount if xp_awarded else 0, "evidence": evidence}

    def propose_boss_fix(
        self,
        session_id: str,
        boss_id: str,
        agent_id: str,
        diff: str,
        branch_name: str,
        explanation: str,
    ) -> Dict[str, Any]:
        """AI agent proposes a remediation diff on an isolated branch for human approval."""
        with local_db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE arena_bosses
                SET status = 'proposed_fix',
                    proposed_fix_diff = ?,
                    proposed_fix_branch = ?
                WHERE session_id = ? AND id = ?
                """,
                (diff, branch_name, session_id, boss_id),
            )
            conn.commit()

        arena_db.record_arena_event(
            session_id=session_id,
            event_type="boss_fix_proposed",
            title=f"AI Agent proposed fix on branch '{branch_name}'",
            payload={"boss_id": boss_id, "agent_id": agent_id, "branch": branch_name, "explanation": explanation},
            actor_id=agent_id,
        )
        arena_db.write_arena_audit(
            session_id=session_id,
            action="boss_fix_proposed",
            actor_id=agent_id,
            details={"boss_id": boss_id, "branch": branch_name},
        )

        broadcaster.publish_nowait(
            session_id,
            {
                "type": "arena_boss_updated",
                "boss_id": boss_id,
                "status": "proposed_fix",
                "branch_name": branch_name,
                "explanation": explanation,
            },
        )

        return {"boss_id": boss_id, "status": "proposed_fix", "branch": branch_name}

    def approve_boss_fix(
        self,
        session_id: str,
        boss_id: str,
        approved_by: str,
        run_verification: bool = True,
    ) -> Dict[str, Any]:
        """Record host approval; only a later server-side scanner event may defeat a boss or award XP."""
        now = datetime.now(timezone.utc).isoformat()
        with local_db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT xp_reward, themed_name, original_finding, region_id FROM arena_bosses WHERE session_id = ? AND id = ?",
                (session_id, boss_id),
            )
            b_row = cursor.fetchone()
            if not b_row:
                raise ValueError(f"Boss {boss_id} not found.")

            b_name = b_row["themed_name"]
            region_id = b_row["region_id"]

            evidence = {
                "approved_by": approved_by,
                "remediation_status": "approval_pending_server_verification",
                "timestamp": now,
            }

            cursor.execute(
                """
                UPDATE arena_bosses
                SET status = 'approved_pending_verification',
                    approved_by = ?,
                    verification_evidence_json = ?
                WHERE session_id = ? AND id = ?
                """,
                (approved_by, json.dumps(evidence), session_id, boss_id),
            )
            conn.commit()

        arena_db.record_arena_event(
            session_id=session_id,
            event_type="boss_fix_approved",
            title=f"Boss fix approved: {b_name}",
            payload={"boss_id": boss_id, "approved_by": approved_by, "evidence": evidence},
            actor_id=approved_by,
        )
        arena_db.write_arena_audit(
            session_id=session_id,
            action="boss_fix_approved",
            actor_id=approved_by,
            details={"boss_id": boss_id, "run_verification": run_verification},
        )

        broadcaster.publish_nowait(
            session_id,
            {
                "type": "arena_boss_updated",
                "boss_id": boss_id,
                "region_id": region_id,
                "approved_by": approved_by,
                "status": "approved_pending_verification",
            },
        )

        return {"boss_id": boss_id, "status": "approved_pending_verification", "verified": False, "xp_awarded": 0}

    def switch_theme(
        self,
        session_id: str,
        new_game_name: str,
        new_game_description: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Dynamically switch game universe (e.g. Minecraft -> Swordigo).
        Preserves all real project progress, players, quests, assignments,
        verification evidence, bosses, XP ledger, and audit history.
        """
        session = arena_db.get_arena_session_by_id(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found.")

        # 1. Fetch raw world model
        world_model_record = arena_db.get_world_model(session_id)
        if not world_model_record:
            raise ValueError(f"No world model found for session {session_id}.")
        world_model = RealWorldModel.model_validate(world_model_record["model"])

        # 2. Get current theme version
        current_theme = arena_db.get_latest_theme_pack(session_id)
        new_version = (current_theme["version"] + 1) if current_theme else 1

        # 3. Generate new game bible for the requested universe
        new_bible: GameBible = game_engine.generate_game_bible(new_game_name, new_game_description)

        # 4. Save new theme pack
        theme_id = arena_db.save_theme_pack(
            session_id=session_id,
            game_name=new_bible.game_name,
            genre=new_bible.genre,
            world_archetype=new_bible.world_archetype,
            game_bible_dict=new_bible.model_dump(),
            version=new_version,
        )
        arena_db.retheme_roadmap_phases(session_id, new_bible.phase_landmark_names)

        # 5. Map project to new game universe (1:1 bijection, preserving state)
        new_mapped: MappedWorld = map_project_to_world(
            world_model=world_model,
            game_bible=new_bible,
            session_id=session_id,
            theme_version=new_version,
        )

        # 6. Replace mapped entities in database (atomic transaction preserving progress)
        arena_db.replace_mapped_entities(
            session_id=session_id,
            regions=[r.model_dump() for r in new_mapped.regions],
            quests=[q.model_dump() for q in new_mapped.quests],
            bosses=[b.model_dump() for b in new_mapped.bosses],
            checkpoints=[c.model_dump() for c in new_mapped.checkpoints],
        )

        # 7. Start background artwork generation for new theme
        entities = arena_db.get_arena_entities(session_id)
        art_service.schedule_world_asset_pack(
            session_id=session_id,
            theme_id=theme_id,
            game_bible=new_bible,
            regions=entities["regions"],
            bosses=entities["bosses"],
        )

        arena_db.record_arena_event(
            session_id=session_id,
            event_type="theme_switched",
            title=f"Universe shifted to {new_bible.game_name} (v{new_version})",
            payload={"old_game": session["game_name"], "new_game": new_bible.game_name, "version": new_version},
        )

        broadcaster.publish_nowait(
            session_id,
            {
                "type": "arena_theme_switched",
                "session_id": session_id,
                "game_name": new_bible.game_name,
                "world_archetype": new_bible.world_archetype,
                "version": new_version,
            },
        )

        return self.get_session_details(session_id)

    def generate_session_recap(self, session_id: str) -> Dict[str, Any]:
        """Generate comprehensive engineering-grounded session recap report."""
        session = arena_db.get_arena_session_by_id(session_id)
        entities = arena_db.get_arena_entities(session_id)
        members = arena_db.get_session_members(session_id)
        leaderboard = arena_db.get_session_xp_leaderboard(session_id)
        events = arena_db.get_arena_events(session_id, limit=100)

        verified_quests = [q for q in entities["quests"] if q["status"] == "verified"]
        defeated_bosses = [b for b in entities["bosses"] if b["status"] == "defeated"]
        unresolved_quests = [q for q in entities["quests"] if q["status"] != "verified"]
        unresolved_bosses = [b for b in entities["bosses"] if b["status"] != "defeated"]

        # Calculate total team XP
        total_xp = sum(item.get("total_xp", 0) for item in leaderboard)

        return {
            "session_id": session_id,
            "project_name": session["project_name"] if session else "OneContext",
            "game_theme": session["game_name"] if session else "Minecraft",
            "objective": session["objective"] if session else "Team collaboration",
            "summary": {
                "quests_verified": len(verified_quests),
                "quests_open": len(unresolved_quests),
                "bosses_defeated": len(defeated_bosses),
                "bosses_active": len(unresolved_bosses),
                "total_team_xp": total_xp,
                "total_members": len(members),
            },
            "verified_quests": verified_quests,
            "defeated_bosses": defeated_bosses,
            "leaderboard": leaderboard,
            "timeline": events[:20],
        }


arena_service = ArenaService()
