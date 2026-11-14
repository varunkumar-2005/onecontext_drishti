from datetime import datetime, timedelta, timezone
from backend.arena.live_world import alert_candidates, heat, is_safe_path, kind_for_path, region_for_path, stable_grid
from backend.arena.game_engine import game_engine

def event(actor, path, kind="edit", minutes=0):
    return {"actor_id": actor, "path": path, "type": kind, "created_at": (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()}

def test_path_rules_and_stable_layout():
    assert not is_safe_path(".env.production")
    assert not is_safe_path("keys/server.pem")
    assert is_safe_path("backend/api/arena.py")
    assert kind_for_path("frontend/src/App.jsx") == "ui"
    assert region_for_path("backend/api/arena.py") == "backend"
    assert stable_grid("backend/api/arena.py") == stable_grid("backend/api/arena.py")

def test_heat_and_collision_alert():
    assert heat([event("a", "x.py", minutes=15)]) == 0.5
    alerts = alert_candidates([event("a", "x.py"), event("b", "x.py")], set())
    assert alerts[0]["kind"] == "collision"

def test_theme_has_exact_live_world_vocabularies():
    bible = game_engine.generate_game_bible("A New Game")
    assert set(bible.building_archetypes) == {"route", "model", "ui", "test", "config", "docs", "migration", "other"}
    assert "security_boss" in bible.alert_wording
