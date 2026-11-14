"""
tests/test_arena.py
Comprehensive test suite for OneContext Arena:
- World model extraction
- Game bible schema validation
- 1:1 Project-to-world bijection & zero invented IDs
- Game archetype layout calculation
- Procedural art generation & caching
- Session creation & join codes
- Quest claiming & verified PR completion
- Idempotent XP awarding
- Boss mitigation AI proposal & human approval
- Dynamic theme switching with zero loss of state
"""

import tempfile
import uuid
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.arena.arena_service import arena_service
from backend.arena.art_service import art_service
from backend.arena.game_engine import game_engine
from backend.arena.layout import layout_engine
from backend.arena.mapper import map_project_to_world, validate_mapped_world
from backend.arena.world_builder import world_builder
from backend.main import app
from backend.models.arena_schemas import CreateArenaSessionRequest, GameBible, JoinArenaSessionRequest
from backend.storage import arena_db, local_db


@pytest.fixture
def arena_env(tmp_path, monkeypatch):
    """Isolated database environment for Arena tests."""
    test_db = tmp_path / "test_arena.db"
    monkeypatch.setattr(local_db, "DEFAULT_DB_PATH", test_db)
    monkeypatch.setattr(local_db, "get_db_path", lambda custom=None: test_db)
    local_db.init_db(test_db)
    arena_db.init_arena_db(test_db)

    project_id = f"test-prj-{uuid.uuid4().hex[:6]}"
    bank_id = f"onecontext-{project_id}"
    local_db.create_project(
        project_id=project_id,
        name="OneContext Arena Testbed",
        description="Testing Universal Arena engine",
        bank_id=bank_id,
        db_path=test_db,
    )
    for index in range(4):
        local_db.record_event(
            project_id,
            "task",
            f"Test task {index + 1}",
            body="Task data created by the test fixture.",
            source_ref=f"test-task-{index + 1}",
            db_path=test_db,
        )

    return {"project_id": project_id, "test_db": test_db}


def test_game_bible_validation():
    """Verify GameBible schema validation for iconic and custom universes."""
    # Curated Minecraft
    mc_bible = game_engine.generate_game_bible("Minecraft")
    assert mc_bible.game_name == "Minecraft"
    assert mc_bible.world_archetype == "voxel_isometric"
    assert len(mc_bible.palette) >= 4
    assert mc_bible.vocabulary.regions == "Biomes"

    # Curated Swordigo
    sw_bible = game_engine.generate_game_bible("Swordigo")
    assert sw_bible.game_name == "Swordigo"
    assert sw_bible.world_archetype == "platformer"

    # Dynamic custom game
    custom_bible = game_engine.generate_game_bible("CyberHorizon 2099", "A dystopian futuristic cyber city")
    assert custom_bible.game_name == "CyberHorizon 2099"
    assert custom_bible.visual_identity.art_style is not None


def test_world_model_extraction(arena_env):
    """Verify deterministic world model extraction from real repository."""
    model = world_builder.build_world_model(project_id=arena_env["project_id"])
    assert model.project_id == arena_env["project_id"]
    assert len(model.modules) >= 5
    assert len(model.dependencies) >= 5
    assert len(model.tasks) >= 4
    assert len(model.security_findings) >= 1
    # Check that real security finding was found
    cors_finding = next((f for f in model.security_findings if "cors" in f.id), None)
    assert cors_finding is not None
    assert cors_finding.severity == "high"


def test_project_to_world_mapping_strict_bijection(arena_env):
    """Verify strict 1:1 mapping with no missing, duplicate, or invented IDs."""
    model = world_builder.build_world_model(project_id=arena_env["project_id"])
    bible = game_engine.generate_game_bible("Minecraft")

    mapped = map_project_to_world(model, bible, session_id="test-session")

    # Validate passes without raising ValueError
    validate_mapped_world(model, mapped)

    # Every module mapped exactly once
    assert len(mapped.regions) == len(model.modules)
    # Every task mapped exactly once
    assert len(mapped.quests) == len(model.tasks)
    # Every finding mapped exactly once
    total_findings = len(model.security_findings) + len(model.failing_tests)
    assert len(mapped.bosses) == total_findings


def test_world_layout_generation(arena_env):
    """Verify layout coordinates generation across archetypes."""
    model = world_builder.build_world_model(project_id=arena_env["project_id"])

    for game_name in ["Minecraft", "Swordigo", "GTA V"]:
        bible = game_engine.generate_game_bible(game_name)
        mapped = map_project_to_world(model, bible, session_id="test-session")
        layout = layout_engine.compute_layout(mapped, bible)

        assert len(layout["regions"]) == len(mapped.regions)
        assert len(layout["paths"]) == len(mapped.paths)
        assert layout["spawn_point"]["x"] > 0


def test_art_service_procedural_generation():
    """Verify procedural SVG asset generation produces valid base64 data URIs."""
    bible = game_engine.generate_game_bible("Minecraft")
    data_uri = art_service.generate_procedural_asset("world_overview", "Overworld Hub", bible)
    assert data_uri.startswith("data:image/svg+xml;base64,")


def test_arena_session_lifecycle(arena_env):
    """Verify full session creation, join by code, presence, and recap."""
    req = CreateArenaSessionRequest(
        project_id=arena_env["project_id"],
        game_name="Minecraft",
        objective="Verify Arena multiplayer launch",
        host_name="Alex Master",
    )
    session_data = arena_service.create_session(req)
    session_id = session_data["session"]["id"]
    join_code = session_data["session"]["join_code"]

    assert len(join_code) == 8
    assert session_data["session"]["game_name"] == "Minecraft"
    assert len(session_data["entities"]["regions"]) >= 5
    assert len(session_data["entities"]["quests"]) >= 4

    # Join with second user
    join_req = JoinArenaSessionRequest(
        join_code=join_code,
        user_name="Steve Builder",
        avatar_style="builder",
    )
    join_res = arena_service.join_session(join_req)
    assert join_res["member"]["user_name"] == "Steve Builder"

    # Presence check
    members = arena_db.get_session_members(session_id)
    assert len(members) == 2


def test_quest_claim_and_idempotent_xp_verification(arena_env):
    """Verify quest claiming, strict PR/CI verification, and idempotent XP ledger."""
    req = CreateArenaSessionRequest(
        project_id=arena_env["project_id"],
        game_name="Minecraft",
        host_name="Lead Dev",
    )
    session_data = arena_service.create_session(req)
    session_id = session_data["session"]["id"]
    quest = session_data["entities"]["quests"][0]
    quest_id = quest["id"]

    # Claim quest
    claim_res = arena_service.claim_quest(session_id, quest_id, "user-bob", "Bob")
    assert claim_res["status"] == "claimed"

    # Failing verification due to red CI
    with pytest.raises(ValueError):
        arena_service.verify_quest(session_id, quest_id, "user-bob", ci_status="failed")

    # Successful verification with green CI
    verify_res = arena_service.verify_quest(session_id, quest_id, "user-bob", pr_number=101, ci_status="success")
    assert verify_res["verified"] is True
    assert verify_res["xp_awarded"] > 0

    # Repeat verification (idempotency test: XP must NOT be awarded a second time)
    verify_repeat = arena_service.verify_quest(session_id, quest_id, "user-bob", pr_number=101, ci_status="success")
    assert verify_repeat["xp_awarded"] == 0  # Deduplicated!


def test_boss_battle_ai_proposal_and_human_approval(arena_env):
    """Host approval records a pending fix; only server verification may award XP."""
    req = CreateArenaSessionRequest(
        project_id=arena_env["project_id"],
        game_name="Minecraft",
        host_name="Lead Dev",
    )
    session_data = arena_service.create_session(req)
    session_id = session_data["session"]["id"]
    boss = session_data["entities"]["bosses"][0]
    boss_id = boss["id"]

    # AI agent proposes fix
    fix_res = arena_service.propose_boss_fix(
        session_id=session_id,
        boss_id=boss_id,
        agent_id="agent-builder",
        diff="--- a/main.py\n+++ b/main.py\n- allow_origins=['*']\n+ allow_origins=['https://app.onecontext.io']",
        branch_name="fix/cwe-942-cors",
        explanation="Restricted permissive CORS wildcard to authorized team domain.",
    )
    assert fix_res["status"] == "proposed_fix"

    # Human approval intentionally does not defeat the boss or award XP.
    approve_res = arena_service.approve_boss_fix(
        session_id=session_id,
        boss_id=boss_id,
        approved_by="SecurityLead",
    )
    assert approve_res["verified"] is False
    assert approve_res["xp_awarded"] == 0
    assert approve_res["status"] == "approved_pending_verification"


def test_dynamic_theme_switching_zero_state_loss(arena_env):
    """Verify switching theme from Minecraft to Swordigo preserves all project progress, quests, and XP."""
    req = CreateArenaSessionRequest(
        project_id=arena_env["project_id"],
        game_name="Minecraft",
        host_name="Lead Dev",
    )
    session_data = arena_service.create_session(req)
    session_id = session_data["session"]["id"]

    # Claim & complete a quest
    quest = session_data["entities"]["quests"][0]
    arena_service.claim_quest(session_id, quest["id"], "user-1", "Alice")
    arena_service.verify_quest(session_id, quest["id"], "user-1", pr_number=55, ci_status="success")

    # Now switch theme to Swordigo!
    switched = arena_service.switch_theme(session_id, new_game_name="Swordigo")
    assert switched["session"]["game_name"] == "Swordigo"
    assert switched["game_bible"]["world_archetype"] == "platformer"

    # Verify that the verified quest is STILL verified and Alice is STILL assigned!
    switched_quests = switched["entities"]["quests"]
    matching_quest = next(q for q in switched_quests if q["source_id"] == quest["source_id"])
    assert matching_quest["status"] == "verified"
    assert matching_quest["assigned_to"] == "user-1"
    assert matching_quest["assigned_name"] == "Alice"

    # Verify XP leaderboard is preserved
    assert len(switched["leaderboard"]) >= 1
    assert switched["leaderboard"][0]["user_id"] == "user-1"
