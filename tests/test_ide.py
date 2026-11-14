"""
onecontext/tests/test_ide.py
Comprehensive test suite verifying the 14 required demonstration tests for OneContext IDE:
1. Open IDE and navigate actual uploaded project files.
2. Enter a coding request and modify a relevant file.
3. Detect the file modification.
4. Capture a meaningful event in Insight.
5. Store the semantic memory using the Hindsight API.
6. Retrieve that memory using a natural-language query.
7. Generate a task-specific Context Pack using retrieved memories.
8. Apply a time filter and verify historical retrieval.
9. Simulate two developers modifying the same file.
10. Detect the conflict and display an alert.
11. Generate a proposed resolution and validate it.
12. Detect a sample security issue.
13. Create a quest from the finding.
14. Verify XP is awarded only after the fix passes validation.
"""

import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.storage import local_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_db():
    local_db.init_db()
    # Create a test project if none exists
    project = local_db.get_project("test-ide-proj")
    if not project:
        local_db.create_project(
            project_id="test-ide-proj",
            name="Test IDE Project",
            description="Testing IDE workflows",
            bank_id="onecontext-test-ide-proj",
        )

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

def test_1_open_ide_and_navigate_files(client):
    """Test 1: Navigate actual project files in workspace."""
    response = client.get("/ide/projects/test-ide-proj/files?path=")
    assert response.status_code == 200
    data = response.json()
    assert "entries" in data
    assert len(data["entries"]) > 0
    # Must find real project directories or files
    names = [e["name"] for e in data["entries"]]
    assert any(n in names for n in ["onecontext", "README.md", "pyproject.toml", "package.json", "backend"])

def test_2_and_3_modify_file_and_detect_modification(client):
    """Test 2 & 3: Modify a relevant file and record change in history."""
    test_path = "onecontext/tests/scratch_test_file.py"
    write_resp = client.post(
        "/ide/projects/test-ide-proj/file-content",
        json={
            "path": test_path,
            "content": "def test_hello():\n    return 'hello world'\n",
            "author": "Developer-A",
        },
    )
    assert write_resp.status_code == 200
    assert write_resp.json()["saved"] is True

    # Detect the file modification in history
    changes_resp = client.get("/ide/projects/test-ide-proj/file-changes?minutes=10")
    assert changes_resp.status_code == 200
    changes = changes_resp.json()["changes"]
    assert any(c["path"] == test_path and c["author"] == "Developer-A" for c in changes)

def test_4_5_6_capture_insight_and_hindsight_retrieval(client):
    """Test 4, 5 & 6: Capture event in Insight, retain in Hindsight, and retrieve."""
    insight_resp = client.post(
        "/ide/projects/test-ide-proj/insights",
        json={
            "event_type": "architecture_change",
            "description": "Standardized all API tokens to RS256 with 15-minute expiration and TOTP MFA",
            "source": "architect_review",
            "metadata": {"enforced": True, "standard": "OAuth2"},
        },
    )
    assert insight_resp.status_code == 200
    assert insight_resp.json()["stored"] is True

    # Retrieve memory using natural-language query
    query_resp = client.get("/ide/projects/test-ide-proj/insights?query=RS256%20expiration&time_range=24h")
    assert query_resp.status_code == 200
    insights = query_resp.json()["insights"]
    assert len(insights) > 0
    assert any("RS256" in ins["description"] for ins in insights)

def test_7_and_8_context_pack_generation_and_time_filter(client):
    """Test 7 & 8: Generate task-specific Context Pack and verify time filtering."""
    pack_resp = client.post(
        "/projects/test-ide-proj/context-pack",
        json={
            "task": "Update user login authentication to follow RS256 token rules",
            "target": "codex",
            "time_range": "24h",
            "max_chars": 4000,
        },
    )
    assert pack_resp.status_code == 200
    pack_data = pack_resp.json()
    assert "[END CONTEXT]" in pack_data["pack"]
    assert "stats" in pack_data
    assert pack_data["stats"]["time_range"] == "24h"
    assert pack_data["stats"]["estimated_tokens"] > 0

def test_9_10_11_conflict_detection_and_resolution(client):
    """Test 9, 10 & 11: Two developers modify same file -> detect conflict -> resolve with diff."""
    conflicting_path = "onecontext/tests/scratch_conflict.py"
    # Developer A writes
    client.post(
        "/ide/projects/test-ide-proj/file-content",
        json={"path": conflicting_path, "content": "def auth(): return 'v1'", "author": "Alice"},
    )
    # Developer B writes
    client.post(
        "/ide/projects/test-ide-proj/file-content",
        json={"path": conflicting_path, "content": "def auth(): return 'v2'", "author": "Bob"},
    )

    # Detect conflict from Alice's perspective
    detect_resp = client.post(
        "/ide/projects/test-ide-proj/detect-conflicts",
        json={"path": conflicting_path, "author": "Alice"},
    )
    assert detect_resp.status_code == 200
    conflicts = detect_resp.json()["conflicts"]
    assert len(conflicts) > 0
    assert any(c["other_author"] == "Bob" for c in conflicts)

    # Resolve conflict with AI merge
    resolve_resp = client.post(
        "/ide/projects/test-ide-proj/resolve-conflict",
        json={
            "path": conflicting_path,
            "current_content": "def auth(): return 'v1'",
            "incoming_content": "def auth(): return 'v2'",
            "author": "Alice",
            "other_author": "Bob",
            "strategy": "ai_merge",
        },
    )
    assert resolve_resp.status_code == 200
    res_data = resolve_resp.json()
    assert "resolved_content" in res_data
    assert "diff" in res_data
    assert res_data["validation"]["valid"] is True

def test_12_13_14_security_scan_quest_and_verified_xp(client):
    """Test 12, 13 & 14: Detect security issue -> convert to quest -> verify fix -> award XP."""
    vuln_code = "password = 'super_secret_admin_password_123'\ncursor.execute(f'SELECT * FROM users WHERE id = {user_id}')\n"
    scan_resp = client.post(
        "/ide/projects/test-ide-proj/security-scan",
        json={"path": "auth/secrets.py", "content": vuln_code},
    )
    assert scan_resp.status_code == 200
    findings = scan_resp.json()["findings"]
    assert len(findings) >= 1
    sample_finding = findings[0]

    # Convert finding into a quest
    quest_resp = client.post(
        "/ide/projects/test-ide-proj/security-quest",
        json={
            "path": "auth/secrets.py",
            "rule": sample_finding["rule"],
            "severity": sample_finding["severity"],
            "line": sample_finding["line"],
            "message": sample_finding["message"],
            "snippet": sample_finding["snippet"],
            "xp_reward": 200,
        },
    )
    assert quest_resp.status_code == 200
    quest_id = quest_resp.json()["quest"]["id"]

    # Attempt verification while vulnerability is still present -> must FAIL!
    fail_verify = client.post(
        "/ide/projects/test-ide-proj/verify-security-quest",
        json={
            "quest_id": quest_id,
            "path": "auth/secrets.py",
            "current_content": vuln_code,
            "user_id": "SecurityDev",
        },
    )
    assert fail_verify.status_code == 200
    assert fail_verify.json()["verified"] is False
    assert fail_verify.json()["xp_awarded"] == 0

    # Clean the code and verify again -> must SUCCEED and award XP!
    clean_code = "import os\npassword = os.environ.get('ADMIN_PASSWORD')\ncursor.execute('SELECT * FROM users WHERE id = %s', (user_id,))\n"
    pass_verify = client.post(
        "/ide/projects/test-ide-proj/verify-security-quest",
        json={
            "quest_id": quest_id,
            "path": "auth/secrets.py",
            "current_content": clean_code,
            "user_id": "SecurityDev",
        },
    )
    assert pass_verify.status_code == 200
    assert pass_verify.json()["verified"] is True
    assert pass_verify.json()["xp_awarded"] == 200
    assert pass_verify.json()["user_id"] == "SecurityDev"
