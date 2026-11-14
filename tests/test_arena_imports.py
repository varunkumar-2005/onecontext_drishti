import json

import pytest

from backend.arena.game_engine import GameUnderstandingEngine
from backend.arena.imports import parse_task_markdown


def test_task_markdown_rejects_empty_or_unrecognized_input():
    with pytest.raises(ValueError, match="No tasks found"):
        parse_task_markdown("")
    with pytest.raises(ValueError, match="No tasks found"):
        parse_task_markdown("Plain text is not a task.")


def test_task_markdown_rejects_files_over_one_megabyte():
    with pytest.raises(ValueError, match="1 MB or smaller"):
        parse_task_markdown("- [ ] " + ("x" * 1_000_001))


def test_heading_and_task_metadata_are_parsed_as_plain_text():
    tasks = parse_task_markdown(
        '## Discovery\n- [ ] <script>alert("x")</script> & café 雪 (xp: 225) @ada due: 2027-01-31',
        default_xp=125,
    )

    assert tasks == [{
        "title": "Discovery",
        "description": "Discovery",
        "quests": [{
            "title": '<script>alert("x")</script> & café 雪',
            "xp_reward": 225,
            "assignee_name": "ada",
            "due_date": "2027-01-31",
            "verification_type": "host_approval",
        }],
    }]


def test_headingless_tasks_are_split_into_four_phases_in_order():
    tasks = parse_task_markdown(
        "- [ ] Same\n- [ ] Same\n- [ ] Third\n- [ ] Fourth\n- [ ] Fifth"
    )

    assert [phase["title"] for phase in tasks] == ["Phase 1", "Phase 2", "Phase 3", "Phase 4"]
    assert [task["title"] for phase in tasks for task in phase["quests"]] == [
        "Same", "Same", "Third", "Fourth", "Fifth",
    ]


def test_large_headingless_task_list_is_split_into_five_phases():
    markdown = "\n".join(f"- [ ] Task {index}" for index in range(20))

    phases = parse_task_markdown(markdown)

    assert len(phases) == 5
    assert sum(len(phase["quests"]) for phase in phases) == 20


def test_task_parser_rejects_invalid_dates_xp_and_verification_types():
    with pytest.raises(ValueError, match="real YYYY-MM-DD"):
        parse_task_markdown("- [ ] Broken due due: 2026-02-30")
    with pytest.raises(ValueError, match="between 10 and 500"):
        parse_task_markdown("- [ ] Invalid XP (xp: 501)")
    with pytest.raises(ValueError, match="Verification type"):
        parse_task_markdown("- [ ] Task", verification_type="client")


def test_theme_uses_fixed_terrain_and_landmark_fallbacks_for_invalid_values():
    base = GameUnderstandingEngine()._generate_fallback_bible("Unlisted World").model_dump()
    base["terrain_style"] = ["not", "a", "terrain"]
    base["phase_landmark_archetypes"] = ["camp", {"invalid": "shape"}]
    base["phase_landmark_names"] = []

    class StubLLM:
        def chat(self, _messages, **_kwargs):
            return json.dumps(base), "stub"

    bible = GameUnderstandingEngine(StubLLM()).generate_game_bible("Unlisted World")

    assert bible.terrain_style == "grass"
    assert bible.phase_landmark_archetypes == ["camp", "camp"]
    assert bible.phase_landmark_names
