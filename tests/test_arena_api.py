"""Arena token, role, expiry, and audit integration tests."""

import uuid
import asyncio

import pytest
import httpx

from backend.main import app
from backend.core.arena_rate_limit import arena_rate_limiter
from backend.core.broadcaster import broadcaster
from backend.storage import arena_db, local_db


class ArenaApiClient:
    """Synchronous facade over HTTPX's in-process ASGI transport.

    Unlike Starlette TestClient, this does not create an AnyIO socket portal,
    which stalls on this Windows/Python 3.13 environment.
    """
    def request(self, method, url, **kwargs):
        async def send():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                return await client.request(method, url, **kwargs)
        return asyncio.run(send())

    def get(self, url, **kwargs):
        return self.request("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self.request("POST", url, **kwargs)


@pytest.fixture
def api_client(tmp_path, monkeypatch):
    test_db = tmp_path / "arena_api.db"
    monkeypatch.setenv("AUTH_SECRET", "test-only-arena-secret")
    monkeypatch.setattr(local_db, "DEFAULT_DB_PATH", test_db)
    monkeypatch.setattr(local_db, "get_db_path", lambda custom=None: test_db)
    local_db.init_db(test_db)
    arena_db.init_arena_db(test_db)
    project_id = f"prj-{uuid.uuid4().hex[:6]}"
    local_db.create_project(project_id, "Arena Test", "", f"onecontext-{project_id}", db_path=test_db)
    arena_rate_limiter.reset()
    return ArenaApiClient(), project_id, test_db


def _create(client, project_id, host="Chief Architect"):
    response = client.post("/arena/sessions", json={"project_id": project_id, "game_name": "Minecraft", "objective": "Secure Arena", "host_name": host})
    assert response.status_code == 200
    return response.json()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_missing_and_tampered_token_are_rejected(api_client):
    client, project_id, _ = api_client
    created = _create(client, project_id)
    url = f"/arena/sessions/{created['session']['id']}"
    assert client.get(url).status_code == 401
    assert client.get(url, headers=_auth(created["arena_token"] + "x")).status_code == 401


def test_expired_and_cross_session_tokens_are_rejected(api_client, monkeypatch):
    client, project_id, _ = api_client
    first, second = _create(client, project_id), _create(client, project_id, "Second Host")
    joined = client.post("/arena/sessions/join", json={"join_code": first["session"]["join_code"], "user_name": "Dev Alice"})
    member_token = joined.json()["arena_token"]
    assert client.get(f"/arena/sessions/{second['session']['id']}", headers=_auth(member_token)).status_code == 403

    import backend.core.arena_auth as arena_auth
    monkeypatch.setattr(arena_auth.time, "time", lambda: 9_999_999_999)
    assert client.get(f"/arena/sessions/{first['session']['id']}", headers=_auth(member_token)).status_code == 401


def test_member_cannot_run_host_action_and_client_verify_is_removed(api_client):
    client, project_id, _ = api_client
    created = _create(client, project_id)
    session_id = created["session"]["id"]
    joined = client.post("/arena/sessions/join", json={"join_code": created["session"]["join_code"], "user_name": "Dev Alice"})
    member_token = joined.json()["arena_token"]
    response = client.post(f"/arena/sessions/{session_id}/switch-theme", json={"new_game_name": "Swordigo"}, headers=_auth(member_token))
    assert response.status_code == 403
    with local_db.get_connection(api_client[2]) as conn:
        before = conn.execute("SELECT COUNT(*) FROM arena_xp_events WHERE session_id = ?", (session_id,)).fetchone()[0]
    assert client.post(f"/arena/sessions/{session_id}/quests/anything/verify", headers=_auth(member_token)).status_code == 404
    with local_db.get_connection(api_client[2]) as conn:
        after = conn.execute("SELECT COUNT(*) FROM arena_xp_events WHERE session_id = ?", (session_id,)).fetchone()[0]
    assert after == before == 0


def test_expiring_join_code_and_audit_log(api_client):
    client, project_id, db = api_client
    created = _create(client, project_id)
    session_id = created["session"]["id"]
    assert len(created["session"]["join_code"]) == 8
    assert client.post("/arena/sessions/join", json={"join_code": created["session"]["join_code"], "user_name": "Dev Alice"}).status_code == 200
    with local_db.get_connection(db) as conn:
        actions = [r[0] for r in conn.execute("SELECT action FROM arena_audit_logs WHERE session_id = ?", (session_id,))]
        conn.execute("UPDATE arena_sessions SET join_code_expires_at = ? WHERE id = ?", ("2000-01-01T00:00:00+00:00", session_id))
        conn.commit()
    assert {"session_created", "session_joined"}.issubset(actions)
    assert client.post("/arena/sessions/join", json={"join_code": created["session"]["join_code"], "user_name": "Late User"}).status_code == 404


def test_additive_security_migration_is_recorded(api_client):
    _, _, db = api_client
    with local_db.get_connection(db) as conn:
        versions = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
        columns = {row[1] for row in conn.execute("PRAGMA table_info(arena_sessions)")}
        quest_columns = {row[1] for row in conn.execute("PRAGMA table_info(arena_quests)")}
    assert "001_arena_security.sql" in versions
    assert "003_arena_roadmap.sql" in versions
    assert {"join_code_expires_at", "join_code_revoked"}.issubset(columns)
    assert {"phase_id", "due_date", "verification_type", "submitted_at"}.issubset(quest_columns)


def test_claim_uses_token_identity_not_client_body(api_client):
    client, project_id, _ = api_client
    created = _create(client, project_id)
    session_id = created["session"]["id"]
    imported = client.post(
        f"/arena/sessions/{session_id}/tasks-import",
        json={"markdown": "## Release\n- [ ] Verify uploaded task (xp: 140)"},
        headers=_auth(created["arena_token"]),
    )
    assert imported.status_code == 200
    details = client.get(
        f"/arena/sessions/{session_id}",
        headers=_auth(created["arena_token"]),
    ).json()
    quest_id = details["entities"]["quests"][0]["id"]
    claim = client.post(f"/arena/sessions/{session_id}/quests/{quest_id}/claim", json={"user_id": "forged", "user_name": "Forged"}, headers=_auth(created["arena_token"]))
    assert claim.status_code == 200
    assert claim.json()["assigned_to"] == created["session"]["host_user_id"]


def test_task_import_is_host_only_bounded_and_stores_only_parsed_tasks(api_client):
    client, project_id, db = api_client
    created = _create(client, project_id)
    session_id = created["session"]["id"]
    member = client.post(
        "/arena/sessions/join",
        json={"join_code": created["session"]["join_code"], "user_name": "Teammate"},
    ).json()
    route = f"/arena/sessions/{session_id}/tasks-import"

    denied = client.post(
        route,
        json={"markdown": "- [ ] Must not be imported"},
        headers=_auth(member["arena_token"]),
    )
    assert denied.status_code == 403

    response = client.post(
        route,
        json={"markdown": "## Release\n- [ ] Fix build (xp: 140)\n- [ ] Add tests", "default_xp": 175},
        headers=_auth(created["arena_token"]),
    )
    assert response.status_code == 200
    assert response.json()["imported_count"] == 2
    assert response.json()["phase_count"] == 1
    details = client.get(route.replace("/tasks-import", ""), headers=_auth(created["arena_token"])).json()
    imported = [quest for quest in details["entities"]["quests"] if quest["source_type"] == "markdown_upload"]
    assert [quest["original_title"] for quest in imported] == ["Fix build", "Add tests"]
    assert [quest["xp_reward"] for quest in imported] == [140, 175]
    roadmap = client.get(
        f"/arena/sessions/{session_id}/roadmap",
        headers=_auth(created["arena_token"]),
    ).json()
    assert roadmap["total_quests"] == 2
    assert roadmap["phases"][0]["title"] == "Release"
    assert [quest["title"] for quest in roadmap["phases"][0]["quests"]] == ["Fix build", "Add tests"]
    with local_db.get_connection(db) as conn:
        stored_text = " ".join(
            f"{row['original_title']} {row['description'] or ''}"
            for row in conn.execute(
                "SELECT original_title, description FROM arena_quests WHERE session_id = ?",
                (session_id,),
            ).fetchall()
        )
    assert "Fix build" in stored_text
    assert "## Release" not in stored_text
    assert "- [ ] Fix build" not in stored_text

    empty = client.post(
        route,
        json={"markdown": "This has no recognized tasks."},
        headers=_auth(created["arena_token"]),
    )
    assert empty.status_code == 422

    invalid_default = client.post(
        route,
        json={"markdown": "- [ ] Invalid XP", "default_xp": 501},
        headers=_auth(created["arena_token"]),
    )
    assert invalid_default.status_code == 422
    assert client.post(
        f"/arena/sessions/{session_id}/quests/{imported[0]['id']}/verify",
        headers=_auth(created["arena_token"]),
    ).status_code == 404


def test_repository_import_uses_github_tree_metadata_and_is_host_only(api_client, monkeypatch):
    from backend.arena import imports

    client, project_id, db = api_client
    created = _create(client, project_id)
    session_id = created["session"]["id"]
    member = client.post(
        "/arena/sessions/join",
        json={"join_code": created["session"]["join_code"], "user_name": "Teammate"},
    ).json()
    route = f"/arena/sessions/{session_id}/repository-import"
    payload = {"repo_url": "https://github.com/acme/demo"}

    denied = client.post(route, json=payload, headers=_auth(member["arena_token"]))
    assert denied.status_code == 403

    class FakeResponse:
        def __init__(self, value):
            self.value = value

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self):
            import json
            return json.dumps(self.value).encode()

    responses = iter([
        {"default_branch": "main"},
        {"tree": [
            {"path": "backend/api/main.py", "type": "blob"},
            {"path": "backend/core/auth.py", "type": "blob"},
            {"path": "README.md", "type": "blob"},
        ]},
    ])
    calls = []

    def fake_urlopen(request, timeout):
        calls.append((request.full_url, timeout))
        return FakeResponse(next(responses))

    monkeypatch.setattr(imports, "urlopen", fake_urlopen)
    response = client.post(route, json=payload, headers=_auth(created["arena_token"]))
    assert response.status_code == 200
    body = response.json()
    assert body["file_count"] == 3
    assert body["district_count"] == 3
    assert [item["name"] for item in body["districts"]] == [".", "backend/api", "backend/core"]
    assert len(calls) == 2
    assert all("/contents/" not in call[0] and call[1] == 10 for call in calls)
    model = arena_db.get_world_model(session_id, db)
    assert model["model"]["repo_url"] == "https://github.com/acme/demo"
    assert [module["path"] for module in model["model"]["modules"]] == [".", "backend/api", "backend/core"]


def test_join_rate_limit(api_client):
    client, _, _ = api_client
    for _ in range(10):
        assert client.post("/arena/sessions/join", json={"join_code": "INVALID", "user_name": "Dev"}).status_code == 404
    assert client.post("/arena/sessions/join", json={"join_code": "INVALID", "user_name": "Dev"}).status_code == 429


def test_live_world_collision_emits_and_resolves_on_checkin(api_client):
    """Integration: two members collide, receive an SSE-channel event, then one moves away."""
    client, project_id, _ = api_client
    created = _create(client, project_id)
    session_id, host_token = created["session"]["id"], created["arena_token"]
    assert client.get(f"/arena/sessions/{session_id}/world", headers=_auth(host_token)).status_code == 200
    joined = client.post("/arena/sessions/join", json={"join_code": created["session"]["join_code"], "user_name": "Dev Alice"})
    member_token = joined.json()["arena_token"]
    path = "backend/main.py"
    assert client.post(f"/arena/sessions/{session_id}/activity", json={"events": [{"path": path, "type": "edit"}]}, headers=_auth(host_token)).status_code == 200
    queue = broadcaster.subscribe(session_id)
    assert client.post(f"/arena/sessions/{session_id}/activity", json={"events": [{"path": path, "type": "edit"}]}, headers=_auth(member_token)).status_code == 200
    emitted = [queue.get_nowait() for _ in range(queue.qsize())]
    assert any(event["type"] == "alert_opened" and event["alert"]["kind"] == "collision" for event in emitted)
    assert client.post(f"/arena/sessions/{session_id}/checkin", json={"path": "backend/config.py"}, headers=_auth(member_token)).status_code == 200
    resolved = [queue.get_nowait() for _ in range(queue.qsize())]
    assert any(event["type"] == "alert_resolved" and event["alert"]["kind"] == "collision" for event in resolved)
    broadcaster.unsubscribe(session_id, queue)


def test_initial_world_includes_tracked_buildings_and_positions(api_client):
    client, project_id, _ = api_client
    created = _create(client, project_id)
    session_id = created["session"]["id"]

    response = client.get(f"/arena/sessions/{session_id}/world", headers=_auth(created["arena_token"]))

    assert response.status_code == 200
    world = response.json()
    assert world["buildings"]
    building = next(item for item in world["buildings"] if item["path"] == "backend/main.py")
    assert building["grid"]
    assert world["districts"]
    assert world["edges"]


def test_session_metadata_exposes_region_paths_for_world_map(api_client):
    client, project_id, _ = api_client
    created = _create(client, project_id)

    details = client.get(
        f"/arena/sessions/{created['session']['id']}",
        headers=_auth(created["arena_token"]),
    )

    assert details.status_code == 200
    assert details.json()["region_paths"]
    assert all(isinstance(path, str) and path for path in details.json()["region_paths"].values())
    assert "world_model" not in details.json()


def test_dependency_risk_keeps_recent_activity_per_actor_and_file(api_client):
    client, project_id, _ = api_client
    created = _create(client, project_id)
    session_id = created["session"]["id"]
    joined = client.post(
        "/arena/sessions/join",
        json={"join_code": created["session"]["join_code"], "user_name": "Dev Alice"},
    )
    assert joined.status_code == 200
    assert client.get(
        f"/arena/sessions/{session_id}/world",
        headers=_auth(created["arena_token"]),
    ).status_code == 200

    host_activity = client.post(
        f"/arena/sessions/{session_id}/activity",
        json={"events": [
            {"path": "backend/main.py", "type": "edit"},
            {"path": "README.md", "type": "edit"},
        ]},
        headers=_auth(created["arena_token"]),
    )
    member_activity = client.post(
        f"/arena/sessions/{session_id}/activity",
        json={"events": [
            {"path": "backend/config.py", "type": "edit"},
            {"path": "requirements.txt", "type": "edit"},
        ]},
        headers=_auth(joined.json()["arena_token"]),
    )
    assert host_activity.json()["accepted"] == 2
    assert member_activity.json()["accepted"] == 2

    world = client.get(
        f"/arena/sessions/{session_id}/world",
        headers=_auth(created["arena_token"]),
    ).json()

    alert = next(item for item in world["alerts"] if item["kind"] == "dependency_risk")
    assert set(alert["evidence"]["edge"]) == {"backend/main.py", "backend/config.py"}
    assert set(alert["actors"]) == {
        created["session"]["host_user_id"],
        joined.json()["member"]["user_id"],
    }


def test_roadmap_locks_progress_stars_and_verified_leaderboard(api_client):
    client, project_id, db = api_client
    created = _create(client, project_id)
    session_id = created["session"]["id"]
    member = client.post(
        "/arena/sessions/join",
        json={"join_code": created["session"]["join_code"], "user_name": "Teammate"},
    ).json()
    member_token = member["arena_token"]
    host_token = created["arena_token"]

    imported = client.post(
        f"/arena/sessions/{session_id}/tasks-import",
        json={
            "markdown": (
                "## Phase One\n"
                "- [ ] First task (xp: 100) @Teammate due: 2027-01-31\n"
                "- [ ] Second task (xp: 200) @Teammate due: 2027-01-31\n"
                "## Phase Two\n"
                "- [ ] Third task (xp: 300) @Teammate"
            ),
        },
        headers=_auth(host_token),
    )
    assert imported.status_code == 200
    roadmap_url = f"/arena/sessions/{session_id}/roadmap"
    initial = client.get(roadmap_url, headers=_auth(member_token)).json()
    assert [phase["locked"] for phase in initial["phases"]] == [False, True]
    locked_quest = initial["phases"][1]["quests"][0]
    assert client.post(
        f"/arena/sessions/{session_id}/quests/{locked_quest['id']}/claim",
        json={},
        headers=_auth(member_token),
    ).status_code == 400

    first_quest = initial["phases"][0]["quests"][0]
    claim = client.post(
        f"/arena/sessions/{session_id}/quests/{first_quest['id']}/claim",
        json={"user_id": "untrusted", "user_name": "Untrusted"},
        headers=_auth(member_token),
    )
    assert claim.status_code == 200
    submitted = client.post(
        f"/arena/sessions/{session_id}/quests/{first_quest['id']}/submit",
        json={"evidence_note": "Implementation is ready for host review."},
        headers=_auth(member_token),
    )
    assert submitted.status_code == 200
    assert submitted.json()["status"] == "submitted"
    assert client.post(
        f"/arena/sessions/{session_id}/quests/{first_quest['id']}/approve",
        json={"evidence_note": "Self approval is not permitted."},
        headers=_auth(member_token),
    ).status_code == 403
    approved = client.post(
        f"/arena/sessions/{session_id}/quests/{first_quest['id']}/approve",
        json={"evidence_note": "Host reviewed the completed task."},
        headers=_auth(host_token),
    )
    assert approved.status_code == 200
    assert approved.json()["evidence"]["label"] == "HOST APPROVED"
    assert approved.json()["xp_awarded"] == 100

    middle = client.get(roadmap_url, headers=_auth(host_token)).json()
    assert middle["phases"][0]["progress"] == 50
    assert middle["phases"][0]["stars"] == 1
    assert middle["phases"][1]["locked"] is True
    second_quest = middle["phases"][0]["quests"][1]
    assert client.post(
        f"/arena/sessions/{session_id}/quests/{second_quest['id']}/claim",
        json={},
        headers=_auth(member_token),
    ).status_code == 200
    assert client.post(
        f"/arena/sessions/{session_id}/quests/{second_quest['id']}/approve",
        json={"evidence_note": "Reviewed before the deadline."},
        headers=_auth(host_token),
    ).status_code == 200

    complete = client.get(roadmap_url, headers=_auth(host_token)).json()
    assert complete["phases"][0]["progress"] == 100
    assert complete["phases"][0]["stars"] == 3
    assert complete["phases"][1]["locked"] is False
    assert complete["overall_progress"] == pytest.approx(66.7)

    with local_db.get_connection(db) as conn:
        open_quest = conn.execute(
            "SELECT id FROM arena_quests WHERE session_id = ? AND original_title = 'Third task'",
            (session_id,),
        ).fetchone()["id"]
    assert arena_db.award_xp(
        session_id,
        member["member"]["user_id"],
        "quest_verified",
        open_quest,
        999,
        "unverified test ledger row",
        db_path=db,
    )
    leaderboard = client.get(
        f"/arena/sessions/{session_id}/leaderboard",
        headers=_auth(member_token),
    ).json()["leaderboard"]
    assert leaderboard[0]["verified_xp"] == 300
    assert leaderboard[0]["verified_quests"] == 2
    breakdown = client.get(
        f"/arena/sessions/{session_id}/members/{member['member']['user_id']}/xp",
        headers=_auth(host_token),
    ).json()["verified_xp"]
    assert sum(entry["xp"] for entry in breakdown) == 300
    assert all(entry["evidence"]["label"] == "HOST APPROVED" for entry in breakdown)


def test_phase_unlock_override_is_host_only_and_audited(api_client):
    client, project_id, db = api_client
    created = _create(client, project_id)
    session_id = created["session"]["id"]
    joined = client.post(
        "/arena/sessions/join",
        json={"join_code": created["session"]["join_code"], "user_name": "Teammate"},
    ).json()
    imported = client.post(
        f"/arena/sessions/{session_id}/tasks-import",
        json={"markdown": "## First\n- [ ] A\n## Second\n- [ ] B"},
        headers=_auth(created["arena_token"]),
    )
    assert imported.status_code == 200
    phase_id = client.get(
        f"/arena/sessions/{session_id}/roadmap",
        headers=_auth(created["arena_token"]),
    ).json()["phases"][1]["id"]
    route = f"/arena/sessions/{session_id}/phases/{phase_id}/unlock"

    assert client.post(route, json={"unlocked": True}, headers=_auth(joined["arena_token"])).status_code == 403
    response = client.post(route, json={"unlocked": True}, headers=_auth(created["arena_token"]))
    assert response.status_code == 200
    assert response.json()["phases"][1]["locked"] is False
    with local_db.get_connection(db) as conn:
        audit = conn.execute(
            "SELECT actor_id, details_json FROM arena_audit_logs WHERE session_id = ? AND action = 'phase_unlock_overridden'",
            (session_id,),
        ).fetchone()
    assert audit["actor_id"] == created["session"]["host_user_id"]
    assert '"unlocked": true' in audit["details_json"]


def test_theme_switch_preserves_imported_roadmap_structure_and_quest_state(api_client):
    client, project_id, _ = api_client
    created = _create(client, project_id)
    session_id = created["session"]["id"]
    imported = client.post(
        f"/arena/sessions/{session_id}/tasks-import",
        json={"markdown": "## Phase One\n- [ ] Keep this quest (xp: 180)\n## Phase Two\n- [ ] Keep this too"},
        headers=_auth(created["arena_token"]),
    )
    assert imported.status_code == 200
    route = f"/arena/sessions/{session_id}/roadmap"
    before = client.get(route, headers=_auth(created["arena_token"])).json()
    before_ids = [
        (phase["id"], [(quest["id"], quest["status"], quest["xp"]) for quest in phase["quests"]])
        for phase in before["phases"]
    ]

    switched = client.post(
        f"/arena/sessions/{session_id}/switch-theme",
        json={"new_game_name": "Swordigo"},
        headers=_auth(created["arena_token"]),
    )
    assert switched.status_code == 200
    after = client.get(route, headers=_auth(created["arena_token"])).json()
    after_ids = [
        (phase["id"], [(quest["id"], quest["status"], quest["xp"]) for quest in phase["quests"]])
        for phase in after["phases"]
    ]
    assert after_ids == before_ids
    assert [phase["title"] for phase in after["phases"]] == ["Phase One", "Phase Two"]


def test_host_cannot_self_approve_and_upload_does_not_add_client_xp_route(api_client):
    client, project_id, db = api_client
    created = _create(client, project_id, host="Host Player")
    session_id = created["session"]["id"]
    imported = client.post(
        f"/arena/sessions/{session_id}/tasks-import",
        json={"markdown": "## Phase\n- [ ] Self task @Host Player"},
        headers=_auth(created["arena_token"]),
    )
    assert imported.status_code == 200
    quest = client.get(
        f"/arena/sessions/{session_id}/roadmap",
        headers=_auth(created["arena_token"]),
    ).json()["phases"][0]["quests"][0]
    assert client.post(
        f"/arena/sessions/{session_id}/quests/{quest['id']}/claim",
        json={},
        headers=_auth(created["arena_token"]),
    ).status_code == 200
    assert client.post(
        f"/arena/sessions/{session_id}/quests/{quest['id']}/approve",
        json={"evidence_note": "Attempt to self approve."},
        headers=_auth(created["arena_token"]),
    ).status_code == 403
    assert client.post(
        f"/arena/sessions/{session_id}/quests/{quest['id']}/verify",
        headers=_auth(created["arena_token"]),
    ).status_code == 404
    with local_db.get_connection(db) as conn:
        xp_count = conn.execute(
            "SELECT COUNT(*) FROM arena_xp_events WHERE session_id = ?",
            (session_id,),
        ).fetchone()[0]
    assert xp_count == 0


def test_world_avatar_moves_to_actor_latest_file_without_duplicates(api_client):
    client, project_id, _ = api_client
    created = _create(client, project_id)
    session_id = created["session"]["id"]
    token = created["arena_token"]
    headers = _auth(token)
    assert client.get(f"/arena/sessions/{session_id}/world", headers=headers).status_code == 200

    first = client.post(
        f"/arena/sessions/{session_id}/activity",
        json={"events": [
            {"path": "backend/config.py", "type": "edit"},
            {"path": "backend/main.py", "type": "edit"},
        ]},
        headers=headers,
    )
    assert first.json()["accepted"] == 2
    moved = client.get(f"/arena/sessions/{session_id}/world", headers=headers).json()

    actor_avatars = [avatar for avatar in moved["avatars"] if avatar["actor"] == created["session"]["host_user_id"]]
    assert len(actor_avatars) == 1
    assert actor_avatars[0]["path"] == "backend/main.py"
