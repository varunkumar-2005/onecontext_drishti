"""Path- and title-only imports for Arena onboarding."""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import date
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

MAX_TASK_FILE_BYTES = 1_000_000
MAX_IMPORTED_TASKS = 100
MAX_REPOSITORY_FILES = 20_000
DEFAULT_TASK_XP = 100

_CHECKLIST = re.compile(r"^\s*[-*+]\s+\[[ xX]\]\s+(.+?)\s*$")
_PHASE_HEADING = re.compile(r"^\s{0,3}##\s+(.+?)\s*#*\s*$")
_XP_MARKER = re.compile(r"\s*\((?:xp:\s*(\d+))\)|\s*\[xp:\s*(\d+)\]", re.IGNORECASE)
_ASSIGNEE = re.compile(r"(?<!\S)@([A-Za-z0-9_.-]+)\b")
_DUE_DATE = re.compile(r"(?<!\S)due:\s*(\d{4}-\d{2}-\d{2})\b", re.IGNORECASE)
_LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")


def parse_task_markdown(
    markdown: str,
    default_xp: int = DEFAULT_TASK_XP,
    verification_type: str = "host_approval",
) -> list[dict[str, object]]:
    """Parse task titles and phase headings only; never execute or retain Markdown."""
    if len(markdown.encode("utf-8")) > MAX_TASK_FILE_BYTES:
        raise ValueError("Markdown task file must be 1 MB or smaller.")
    if not 10 <= default_xp <= 500:
        raise ValueError("Default task XP must be between 10 and 500.")
    if verification_type not in {"pr_merged_ci_green", "host_approval"}:
        raise ValueError("Verification type must be pr_merged_ci_green or host_approval.")

    phases: list[dict[str, object]] = []
    current_phase: Optional[dict[str, object]] = None
    ungrouped_tasks: list[dict[str, object]] = []
    in_fence = False
    for line in markdown.splitlines():
        if line.strip().startswith(("```", "~~~")):
            in_fence = not in_fence
            continue
        if in_fence:
            continue

        heading = _PHASE_HEADING.match(line)
        if heading:
            title = _LINK.sub(r"\1", heading.group(1)).strip().strip("*_` ")
            if not title:
                continue
            current_phase = {
                "title": title[:300],
                "description": title[:1000],
                "quests": [],
            }
            phases.append(current_phase)
            if len(phases) > 100:
                raise ValueError("Markdown task file may contain at most 100 phases.")
            continue

        match = _CHECKLIST.match(line)
        if not match:
            continue
        title = _LINK.sub(r"\1", match.group(1)).strip()
        if not title:
            continue

        xp_matches = list(_XP_MARKER.finditer(title))
        xp = default_xp
        if xp_matches:
            xp_match = xp_matches[-1]
            xp = int(xp_match.group(1) or xp_match.group(2))
            if not 10 <= xp <= 500:
                raise ValueError("Task XP must be between 10 and 500.")
            title = _XP_MARKER.sub("", title)

        assignee_match = _ASSIGNEE.search(title)
        assignee_name = assignee_match.group(1) if assignee_match else None
        if assignee_match:
            title = _ASSIGNEE.sub("", title)

        due_match = _DUE_DATE.search(title)
        due_date = due_match.group(1) if due_match else None
        if due_match:
            try:
                date.fromisoformat(due_date)
            except ValueError as exc:
                raise ValueError("Task due dates must use a real YYYY-MM-DD date.") from exc
            title = _DUE_DATE.sub("", title)

        title = title.strip().strip("*_` ")
        if title:
            task = {
                "title": title[:300],
                "xp_reward": xp,
                "assignee_name": assignee_name,
                "due_date": due_date,
                "verification_type": verification_type,
            }
            if current_phase is None:
                ungrouped_tasks.append(task)
            else:
                current_phase["quests"].append(task)

        task_count = len(ungrouped_tasks) + sum(len(phase["quests"]) for phase in phases)
        if task_count > MAX_IMPORTED_TASKS:
            raise ValueError(f"Markdown task file may contain at most {MAX_IMPORTED_TASKS} tasks.")

    if not ungrouped_tasks and not any(phase["quests"] for phase in phases):
        raise ValueError("No tasks found. Add checklist items under Markdown phase headings.")

    if not phases:
        phase_count = 5 if len(ungrouped_tasks) >= 20 else 4
        phases = [
            {"title": f"Phase {index + 1}", "description": "", "quests": []}
            for index in range(phase_count)
        ]
        for index, task in enumerate(ungrouped_tasks):
            phase_index = min(phase_count - 1, index * phase_count // len(ungrouped_tasks))
            phases[phase_index]["quests"].append(task)
    elif ungrouped_tasks:
        phases.insert(0, {"title": "Project Tasks", "description": "", "quests": ungrouped_tasks})

    return phases


def normalize_github_repo_url(repo_url: str) -> tuple[str, str]:
    parsed = urlparse(repo_url.strip())
    if parsed.scheme != "https" or parsed.hostname not in {"github.com", "www.github.com"}:
        raise ValueError("Enter an HTTPS GitHub repository URL.")
    parts = [part for part in parsed.path.strip("/").split("/") if part]
    if len(parts) != 2 or not re.fullmatch(r"[A-Za-z0-9_.-]+", parts[0]) or not re.fullmatch(r"[A-Za-z0-9_.-]+", parts[1].removesuffix(".git")):
        raise ValueError("Enter a repository URL in the form https://github.com/owner/repository.")
    return parts[0], parts[1].removesuffix(".git")


def fetch_github_repository_paths(repo_url: str) -> tuple[str, str, list[str]]:
    """Fetch GitHub tree metadata only; repository file contents are never requested."""
    owner, repository = normalize_github_repo_url(repo_url)
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "OneContext-Arena",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    def get_json(url: str) -> dict:
        request = Request(url, headers=headers)
        with urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))

    repo_api = f"https://api.github.com/repos/{quote(owner)}/{quote(repository)}"
    try:
        repo_info = get_json(repo_api)
        branch = repo_info.get("default_branch")
        if not isinstance(branch, str) or not branch:
            raise ValueError("GitHub repository did not provide a default branch.")
        branch_ref = quote(branch, safe="")
        tree = get_json(f"{repo_api}/git/trees/{branch_ref}?recursive=1")
    except HTTPError as exc:
        if exc.code == 404:
            raise ValueError("GitHub repository or default branch was not found or is not accessible.") from exc
        raise RuntimeError(f"GitHub API returned HTTP {exc.code}.") from exc
    except URLError as exc:
        raise RuntimeError("Could not reach the GitHub API.") from exc
    except (TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError("GitHub API response was unavailable or invalid.") from exc

    entries = tree.get("tree")
    if not isinstance(entries, list) or tree.get("truncated"):
        raise ValueError("GitHub repository tree is incomplete; no partial world was created.")
    paths = sorted({
        entry["path"]
        for entry in entries
        if isinstance(entry, dict)
        and entry.get("type") == "blob"
        and isinstance(entry.get("path"), str)
        and entry["path"]
        and not entry["path"].startswith("/")
        and ".." not in entry["path"].split("/")
    })
    if not paths:
        raise ValueError("GitHub repository contains no files.")
    if len(paths) > MAX_REPOSITORY_FILES:
        raise ValueError(f"Repository tree exceeds the {MAX_REPOSITORY_FILES}-file import limit.")
    return owner, repository, paths


def build_repository_districts(paths: list[str]) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    file_counts: dict[str, int] = {}
    for path in paths:
        parents = path.split("/")[:-1]
        district = "/".join(parents[:2]) if parents else "."
        file_counts[district] = file_counts.get(district, 0) + 1

    modules: list[dict[str, object]] = []
    regions: list[dict[str, object]] = []
    for path, file_count in sorted(file_counts.items()):
        module_id = f"repo-{hashlib.sha1(path.encode('utf-8')).hexdigest()[:12]}"
        modules.append({"id": module_id, "name": path, "path": path, "file_count": file_count, "languages": []})
        regions.append({
            "region_id": module_id,
            "module_id": module_id,
            "original_name": path,
            "themed_name": path,
            "description": f"{file_count} repository files",
            "health": 100,
            "pos_x": 0.0,
            "pos_y": 0.0,
        })
    return modules, regions
