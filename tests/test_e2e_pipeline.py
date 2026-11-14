"""
tests/test_e2e_pipeline.py
Complete End-to-End Logic and Pipeline Validation for OneContext:
1. Project Ingestion (Text and file ingestion, chunking, idempotency, event recording)
2. World / Map Generation (Real repository districts, task markdown quests, dynamic layout)
3. AI Agents (Planner, Builder, Validator data flow with shared memory)
4. Shared Insight Memory (Retain, Recall, Conflict detection, Context Pack generation)
5. Team ID and Two-User Collaboration (Team creation, join code, multi-user join)
6. Real-Time Synchronization (Live room events, memory retention propagation)
7. End-to-End Integrated Data Flow (Full chain verification)
"""

import io
import json
import uuid
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.storage import local_db, arena_db


@pytest.fixture
def e2e_system(tmp_path, monkeypatch):
    test_db = tmp_path / "e2e_pipeline.db"
    monkeypatch.setenv("AUTH_SECRET", "test-arena-secret-key")
    monkeypatch.setattr(local_db, "DEFAULT_DB_PATH", test_db)
    monkeypatch.setattr(local_db, "get_db_path", lambda custom=None: test_db)
    monkeypatch.setattr(arena_db, "get_db_path", lambda custom=None: test_db)
    local_db.init_db(test_db)
    arena_db.init_arena_db(test_db)

    class FakeResponse:
        def __init__(self, value):
            self.value = value

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def read(self):
            return json.dumps(self.value).encode("utf-8")

    monkeypatch.setattr(
        "backend.arena.imports.urlopen",
        lambda req, timeout=10: FakeResponse(
            {"default_branch": "main"}
            if "git/trees" not in req.full_url
            else {
                "tree": [
                    {"path": "backend/main.py", "type": "blob"},
                    {"path": "backend/api/auth.py", "type": "blob"},
                    {"path": "backend/api/arena.py", "type": "blob"},
                    {"path": "frontend/src/App.jsx", "type": "blob"},
                    {"path": "frontend/src/pages/Arena.jsx", "type": "blob"},
                    {"path": "tests/test_api.py", "type": "blob"},
                ]
            }
        ),
    )

    with TestClient(app) as client:
        yield client, test_db


def test_1_project_ingestion(e2e_system):
    """Step 1: Verify project creation and multi-source document/file ingestion."""
    client, test_db = e2e_system

    # Create project
    create_resp = client.post("/projects", json={
        "name": "E2E Cloud Platform",
        "description": "Enterprise cloud platform with microservices"
    })
    assert create_resp.status_code == 201
    project = create_resp.json()
    project_id = project["id"]
    assert project["name"] == "E2E Cloud Platform"

    # Ingest markdown text
    doc_text = (
        "# Architecture Overview\n\n"
        "We use FastAPI for the backend REST APIs.\n\n"
        "All database access must use SQLAlchemy async sessions with PostgreSQL 15.\n\n"
        "JWT tokens expire after 24 hours and must be signed with RS256 algorithm.\n"
    )
    ingest_resp = client.post(f"/projects/{project_id}/ingest", json={
        "text": doc_text,
        "source_name": "architecture.md",
        "source_type": "doc",
    })
    assert ingest_resp.status_code == 200
    ingest_data = ingest_resp.json()
    assert ingest_data["chunks_retained"] >= 1
    assert ingest_data["source_name"] == "architecture.md"

    # Ingest uploaded file (.md)
    file_content = b"# Security Rules\n\nAll external endpoints must enforce rate limiting at 60 req/min.\n"
    upload_file = io.BytesIO(file_content)
    file_resp = client.post(
        f"/projects/{project_id}/ingest-file",
        files={"file": ("security_policy.md", upload_file, "text/markdown")},
    )
    assert file_resp.status_code == 200
    file_data = file_resp.json()
    assert file_data["chunks_retained"] >= 1
    assert file_data["source_name"] == "security_policy.md"

    # Verify event stream records ingestion events
    events = local_db.get_events(project_id, limit=10, db_path=test_db)
    assert any("architecture.md" in e["title"] for e in events)


def test_2_world_and_map_generation(e2e_system):
    """Step 2: Verify map and world generation from real repository paths and task markdown."""
    client, test_db = e2e_system

    # Create project
    proj_resp = client.post("/projects", json={"name": "World Project", "description": "World map validation"})
    project_id = proj_resp.json()["id"]

    # Create Arena Session
    session_resp = client.post("/arena/sessions", json={
        "project_id": project_id,
        "game_name": "Minecraft",
        "objective": "Build and secure core infrastructure",
        "host_name": "Lead Architect",
    })
    assert session_resp.status_code == 200
    session_data = session_resp.json()
    session = session_data["session"]
    session_id = session["id"]
    token = session_data["arena_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Import Repository Paths (using mocked GitHub tree)
    repo_resp = client.post(
        f"/arena/sessions/{session_id}/repository-import",
        json={"repo_url": "https://github.com/onecontext/cloud-core"},
        headers=headers,
    )
    assert repo_resp.status_code == 200
    repo_data = repo_resp.json()
    assert repo_data["district_count"] > 0
    assert len(repo_data["districts"]) > 0

    # Import Task Markdown
    task_md = (
        "## Phase 1: Setup\n"
        "- [ ] Configure OAuth2 authentication gateway (XP: 150)\n"
        "- [x] Provision PostgreSQL database schema (XP: 100)\n"
        "## Phase 2: Core Services\n"
        "- [ ] Implement Redis pub/sub cache layer (XP: 200)\n"
    )
    tasks_resp = client.post(
        f"/arena/sessions/{session_id}/tasks-import",
        json={"markdown": task_md, "default_xp": 100},
        headers=headers,
    )
    assert tasks_resp.status_code == 200
    tasks_data = tasks_resp.json()
    assert tasks_data["imported_count"] >= 3
    assert tasks_data["phase_count"] >= 2

    # Ingest real developer activity
    act_resp = client.post(
        f"/arena/sessions/{session_id}/activity",
        json={
            "events": [
                {"path": "backend/api/auth.py", "type": "commit", "source": "git", "author": "Alice"},
                {"path": "frontend/src/App.jsx", "type": "edit", "source": "ide", "author": "Bob"},
            ]
        },
        headers=headers,
    )
    assert act_resp.status_code == 200

    # Fetch full session state and verify world reflections
    details_resp = client.get(f"/arena/sessions/{session_id}", headers=headers)
    assert details_resp.status_code == 200
    details = details_resp.json()
    assert len(details["entities"]["regions"]) > 0
    assert len(details["entities"]["quests"]) >= 3
    assert details["layout"]["canvas_width"] > 0
    assert details["layout"]["canvas_height"] > 0


def test_3_ai_agents_pipeline(e2e_system):
    """Step 3: Verify Planner, Builder, and Validator agents sharing project memory and outputs."""
    client, test_db = e2e_system

    # Create project and seed decision
    proj_resp = client.post("/projects", json={"name": "Agent Project", "description": "Multi-agent coordination"})
    project_id = proj_resp.json()["id"]

    # Retain architectural memory
    client.post(f"/projects/{project_id}/retain", json={
        "text": "All authentication endpoints must validate JWT RS256 signatures with public keys.",
        "source": "architecture_rule",
        "agent_id": "architect",
    })

    # Register agents
    client.post(f"/projects/{project_id}/agents", json={"id": "planner-1", "name": "Planner", "role": "Architect"})
    client.post(f"/projects/{project_id}/agents", json={"id": "builder-1", "name": "Builder", "role": "Coder"})

    # Run Planner Agent
    plan_resp = client.post(f"/projects/{project_id}/agents/planner-1/run", json={
        "task": "Design auth service: validate JWT RS256 signatures",
        "context": "Enterprise multi-tenant backend",
    })
    assert plan_resp.status_code == 200
    plan_data = plan_resp.json()
    assert plan_data["agent_id"] == "planner-1"
    assert len(plan_data["output"]) > 0

    # Run Builder Agent with planner's output
    build_resp = client.post(f"/projects/{project_id}/agents/builder-1/run", json={
        "task": "Implement JWT signature validation middleware",
        "context": plan_data["output"],
    })
    assert build_resp.status_code == 200
    build_data = build_resp.json()
    assert build_data["agent_id"] == "builder-1"
    assert len(build_data["output"]) > 0

    # Run Validator Agent
    val_resp = client.post(f"/projects/{project_id}/validate", json={
        "draft": build_data["output"],
        "check_topic": "JWT RS256 signature validation",
    })
    assert val_resp.status_code == 200
    val_data = val_resp.json()
    assert "valid" in val_data
    assert val_data["valid"] is True


def test_4_shared_insight_memory_and_context_pack(e2e_system):
    """Step 4: Verify memory retention, semantic recall, conflict checking, and context pack generation."""
    client, test_db = e2e_system

    proj_resp = client.post("/projects", json={"name": "Memory Project", "description": "Shared memory testing"})
    project_id = proj_resp.json()["id"]

    # 1. Retain decision
    ret_resp = client.post(f"/projects/{project_id}/retain", json={
        "text": "Storage system uses AWS S3 with bucket-level encryption enabled.",
        "source": "design_doc",
        "agent_id": "infra_lead",
    })
    assert ret_resp.status_code == 200
    ret_data = ret_resp.json()
    assert "memory_id" in ret_data
    assert ret_data["project_id"] == project_id

    # 2. Semantic recall
    recall_resp = client.post(f"/projects/{project_id}/recall", json={
        "query": "What storage system and encryption do we use?",
        "max_results": 5,
    })
    assert recall_resp.status_code == 200
    recall_data = recall_resp.json()
    assert len(recall_data["results"]) > 0
    assert any("S3" in r["text"] or "storage" in r["text"].lower() for r in recall_data["results"])

    # 3. Conflict detection check
    conflict_resp = client.post(f"/projects/{project_id}/check-conflict", json={
        "text": "Storage system uses Google Cloud Storage instead of AWS S3.",
    })
    assert conflict_resp.status_code == 200

    # 4. Context Pack generation
    pack_resp = client.post(f"/projects/{project_id}/context-pack", json={
        "task": "Add file upload functionality to cloud storage",
        "target": "codex",
        "format": "codex",
        "max_chars": 4000,
    })
    assert pack_resp.status_code == 200
    pack = pack_resp.json()
    assert "pack" in pack
    assert "[END CONTEXT]" in pack["pack"]
    assert "S3" in pack["pack"] or "Storage" in pack["pack"]


def test_5_and_6_team_id_two_user_collaboration_and_live_sync(e2e_system):
    """Steps 5 & 6: Verify team ID generation, second user join, and real-time collaboration."""
    client, test_db = e2e_system

    # Create project
    proj_resp = client.post("/projects", json={"name": "Team Collab Project", "description": "Team collaboration"})
    project_id = proj_resp.json()["id"]

    # 1. Create Team -> Generates 6-character code
    team_resp = client.post("/teams", json={
        "name": "Platform Core Team",
        "project_id": project_id,
    })
    assert team_resp.status_code == 201
    team = team_resp.json()
    team_id = team["id"]
    join_code = team["join_code"]
    assert len(join_code) == 6

    # 2. User 1 joins
    user1_resp = client.post("/teams/join", json={
        "join_code": join_code,
        "display_name": "Dev_Alice",
    })
    assert user1_resp.status_code == 200
    user1_data = user1_resp.json()
    assert user1_data["team"]["id"] == team_id
    assert user1_data["member"]["display_name"] == "Dev_Alice"

    # 3. User 2 joins using the same join code
    user2_resp = client.post("/teams/join", json={
        "join_code": join_code,
        "display_name": "Dev_Bob",
    })
    assert user2_resp.status_code == 200
    user2_data = user2_resp.json()
    assert user2_data["team"]["id"] == team_id
    assert user2_data["member"]["display_name"] == "Dev_Bob"

    # 4. Verify both members exist in team
    members_resp = client.get(f"/teams/{team_id}/members")
    assert members_resp.status_code == 200
    members = members_resp.json()
    member_names = [m["display_name"] for m in members]
    assert "Dev_Alice" in member_names
    assert "Dev_Bob" in member_names

    # 5. User 1 sends message and retains as memory
    msg_resp = client.post(f"/teams/{team_id}/messages", json={
        "sender": "Dev_Alice",
        "role": "frontend",
        "message": "We have standardized on Tailwind CSS and Heroicons across all pages.",
        "message_type": "chat",
        "retain_as_memory": True,
    })
    assert msg_resp.status_code in (200, 201)
    msg_data = msg_resp.json()
    assert msg_data["sender"] == "Dev_Alice"

    # 6. User 2 polls events and verifies message arrived
    events_resp = client.get(f"/rooms/{team_id}/events")
    assert events_resp.status_code == 200
    events = events_resp.json()
    assert any("Tailwind CSS" in (e.get("body") or e.get("title") or "") for e in events)

    # 7. User 2 queries project memory and confirms shared memory accessibility
    recall_resp = client.post(f"/projects/{project_id}/recall", json={
        "query": "What CSS framework do we use?",
        "max_results": 3,
    })
    assert recall_resp.status_code == 200
    recall_results = recall_resp.json()["results"]
    assert any("Tailwind" in r["text"] for r in recall_results)
