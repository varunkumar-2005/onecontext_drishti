"""
backend/arena/mapper.py
Deterministic Project-to-World Mapper for OneContext Arena:
- Maps real engineering entities (modules, tasks, findings, milestones, memories)
  to themed representations dynamically using the GameBible.
- Strictly enforces 1:1 bijection:
  * Every real project entity appears exactly once.
  * No missing IDs.
  * No invented IDs.
  * No duplicate mappings.
  * Every quest links to a real task/issue.
  * Every boss links to a real security finding or failing test.
  * Every checkpoint links to a real milestone.
- Preserves original project IDs, paths, and sources cleanly separated from game visuals.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Set

from backend.models.arena_schemas import (
    GameBible,
    MappedWorld,
    RealWorldModel,
    ThemedBoss,
    ThemedCheckpoint,
    ThemedLoreItem,
    ThemedQuest,
    ThemedRegion,
)

logger = logging.getLogger("onecontext.arena.mapper")


def map_project_to_world(
    world_model: RealWorldModel,
    game_bible: GameBible,
    session_id: str,
    theme_version: int = 1,
) -> MappedWorld:
    """Map every project entity to exactly one visual game entity according to the Game Bible."""
    vocab = game_bible.vocabulary
    archetype = game_bible.world_archetype
    palette = game_bible.palette

    # Theme-specific naming adapters
    game_lower = game_bible.game_name.lower()
    is_minecraft = "minecraft" in game_lower
    is_swordigo = "swordigo" in game_lower
    is_zelda = "zelda" in game_lower
    is_gta = "gta" in game_lower or "grand theft" in game_lower

    # 1. Map Modules -> Regions
    regions: List[ThemedRegion] = []
    # Grid positioning for regions
    total_mods = len(world_model.modules)
    cols = 3
    for idx, mod in enumerate(world_model.modules):
        # Calculate grid positions
        row = idx // cols
        col = idx % cols
        pos_x = float(col * 240 + 120)
        pos_y = float(row * 180 + 100)

        # Dynamic themed naming
        themed_name = _derive_themed_module_name(mod.name, mod.path, game_bible)
        zone_type = f"{vocab.regions} Zone {idx + 1}"

        # Count related tasks & bosses
        rel_tasks = [t for t in world_model.tasks if t.module_id == mod.id]
        rel_sec = [s for s in world_model.security_findings if s.module_id == mod.id]

        regions.append(
            ThemedRegion(
                region_id=f"reg-{session_id}-{mod.id}",
                module_id=mod.id,
                original_name=mod.name,
                themed_name=themed_name,
                theme_biome_or_zone=zone_type,
                description=f"{themed_name}: Houses the real '{mod.name}' module ({mod.file_count} files).",
                health=100 if not rel_sec else max(40, 100 - (len(rel_sec) * 30)),
                pos_x=pos_x,
                pos_y=pos_y,
                issues_count=len(rel_tasks),
                boss_count=len(rel_sec),
            )
        )

    # 2. Map Tasks / GitHub Issues -> Quests
    quests: List[ThemedQuest] = []
    # Build module ID to region ID lookup
    mod_to_region = {r.module_id: r.region_id for r in regions}

    for task in world_model.tasks:
        reg_id = mod_to_region.get(task.module_id or "")
        themed_quest_title = f"{vocab.tasks.split('&')[0].strip()}: {task.title}"
        xp = 150 if "security" in task.labels else 100

        quests.append(
            ThemedQuest(
                quest_id=f"qst-{session_id}-{task.id}",
                source_id=task.id,
                region_id=reg_id,
                original_title=task.title,
                themed_title=themed_quest_title,
                description=task.body or task.title,
                issue_url=task.url,
                assigned_to=None,
                status="available",
                verification_requirements=task.verification_requirements,
                xp_reward=xp,
                evidence=None,
            )
        )

    # 3. Map Security Findings & Failing Tests -> Bosses
    bosses: List[ThemedBoss] = []
    for finding in world_model.security_findings:
        reg_id = mod_to_region.get(finding.module_id or "")
        themed_boss_name = _derive_themed_boss_name(finding.title, finding.severity, game_bible)
        max_hp = 200 if finding.severity == "critical" else (150 if finding.severity == "high" else 100)

        bosses.append(
            ThemedBoss(
                boss_id=f"boss-{session_id}-{finding.id}",
                source_finding_id=finding.id,
                region_id=reg_id,
                themed_name=themed_boss_name,
                original_finding=f"[{finding.cwe or 'VULN'}] {finding.title}: {finding.description}",
                severity=finding.severity,
                scanner_or_agent=finding.scanner,
                affected_files=finding.affected_files,
                max_health=max_hp,
                current_health=max_hp,
                status="active",
                xp_reward=300 if finding.severity in ("critical", "high") else 150,
            )
        )

    for test in world_model.failing_tests:
        reg_id = mod_to_region.get(test.module_id or "")
        themed_boss_name = f"Corrupted Test Anomaly: {test.name}"
        bosses.append(
            ThemedBoss(
                boss_id=f"boss-{session_id}-{test.id}",
                source_finding_id=test.id,
                region_id=reg_id,
                themed_name=themed_boss_name,
                original_finding=f"Failing Test Suite {test.suite}: {test.error_message}",
                severity="medium",
                scanner_or_agent="PyTestRunner",
                affected_files=[test.file_path] if test.file_path else [],
                max_health=100,
                current_health=100,
                status="active",
                xp_reward=150,
            )
        )

    # 4. Map Milestones -> Checkpoints
    checkpoints: List[ThemedCheckpoint] = []
    for ms in world_model.milestones:
        themed_title = f"{vocab.milestones.split('&')[0].strip()}: {ms.title}"
        checkpoints.append(
            ThemedCheckpoint(
                checkpoint_id=f"chk-{session_id}-{ms.id}",
                source_id=ms.id,
                original_title=ms.title,
                themed_title=themed_title,
                status="unlocked" if ms.completed else "locked",
                milestone_due=ms.due_date,
            )
        )

    # 5. Map Hindsight Memories -> Lore Items
    lore_items: List[ThemedLoreItem] = []
    for mem in world_model.memories:
        themed_title = f"{vocab.memories.split('&')[0].strip()}: {mem.category.capitalize()}"
        lore_items.append(
            ThemedLoreItem(
                lore_id=f"lore-{session_id}-{mem.id}",
                source_memory_id=mem.id,
                themed_title=themed_title,
                content=mem.text,
                author=mem.author,
                category=mem.category,
            )
        )

    # 6. Map Dependencies -> Visual Paths
    paths: List[Dict[str, Any]] = []
    for dep in world_model.dependencies:
        src_reg = mod_to_region.get(dep.source_module_id)
        tgt_reg = mod_to_region.get(dep.target_module_id)
        if src_reg and tgt_reg:
            paths.append(
                {
                    "source_region_id": src_reg,
                    "target_region_id": tgt_reg,
                    "dependency_type": dep.dependency_type,
                    "path_style": game_bible.world_structure.connection_style,
                }
            )

    mapped_world = MappedWorld(
        session_id=session_id,
        game_name=game_bible.game_name,
        theme_version=theme_version,
        archetype=archetype,
        regions=regions,
        quests=quests,
        bosses=bosses,
        checkpoints=checkpoints,
        lore_items=lore_items,
        paths=paths,
    )

    # Post-validation: ensure zero missing, zero invented, zero duplicate IDs
    validate_mapped_world(world_model, mapped_world)

    return mapped_world


def _derive_themed_module_name(name: str, path: str, bible: GameBible) -> str:
    """Generate dynamic themed label based on real module name and game bible."""
    game_lower = bible.game_name.lower()
    clean_name = name.lower()

    if "minecraft" in game_lower:
        if "api" in clean_name:
            return "Redstone Railway Gateway"
        if "core" in clean_name:
            return "Command Block Citadel"
        if "agent" in clean_name:
            return "Iron Golem Workshop"
        if "storage" in clean_name or "db" in clean_name:
            return "Deepslate Obsidian Vault"
        if "frontend" in clean_name or "page" in clean_name or "component" in clean_name:
            return "Emerald Trading Village"
        if "service" in clean_name:
            return "Piston Automaton Factory"
        if "test" in clean_name:
            return "Target Block Proving Grounds"
        return f"{name} Biome"

    if "swordigo" in game_lower:
        if "api" in clean_name:
            return "Ancient Whispering Gate"
        if "core" in clean_name:
            return "Heart of the Kingdom"
        if "agent" in clean_name:
            return "Mage Guild Chambers"
        if "storage" in clean_name:
            return "Crystal Cavern Vault"
        if "frontend" in clean_name:
            return "Sunken City Sanctuary"
        if "service" in clean_name:
            return "Mana Forge"
        if "test" in clean_name:
            return "Trial of the Blade"
        return f"{name} Realm"

    if "gta" in game_lower:
        if "api" in clean_name:
            return "Vinewood Data Exchange"
        if "core" in clean_name:
            return "Maze Bank Operations HQ"
        if "storage" in clean_name:
            return "Union Depository Safe Vault"
        if "frontend" in clean_name:
            return "Del Perro Pier Boardwalk"
        if "agent" in clean_name:
            return "FIB Surveillance Cell"
        return f"{name} District"

    # Universal dynamic fallback from bible vocabulary
    reg_noun = bible.vocabulary.regions.split()[0].rstrip("s")
    return f"{name} {reg_noun}"


def _derive_themed_boss_name(title: str, severity: str, bible: GameBible) -> str:
    """Derive authentic themed boss name."""
    game_lower = bible.game_name.lower()
    if "minecraft" in game_lower:
        if "cors" in title.lower():
            return "The Void Spectre of Unbound Portals (CORS Titan)"
        if "except" in title.lower():
            return "The Silent Bedrock Lurker (Unchecked Error Golem)"
        return f"Ender Warden of {title[:24]}"

    if "swordigo" in game_lower:
        if "cors" in title.lower():
            return "Corrupted Shadow Lord of Unsealed Portals"
        if "except" in title.lower():
            return "Ancient Gargoyle of Muffled Curses"
        return f"Corrupted Titan: {title[:24]}"

    boss_noun = bible.vocabulary.security_findings.split()[0]
    return f"{severity.upper()} {boss_noun}: {title[:28]}"


def validate_mapped_world(world_model: RealWorldModel, mapped: MappedWorld) -> None:
    """
    Strict post-validation enforcing:
    1. Every real project entity appears exactly once.
    2. No missing IDs.
    3. No invented IDs.
    4. No duplicate mappings.
    5. Every quest maps to a real task.
    6. Every boss maps to a real finding or test.
    7. Every checkpoint maps to a real milestone.
    """
    # 1. Modules <-> Regions
    real_mod_ids = {m.id for m in world_model.modules}
    mapped_mod_ids = {r.module_id for r in mapped.regions}
    if real_mod_ids != mapped_mod_ids:
        missing = real_mod_ids - mapped_mod_ids
        invented = mapped_mod_ids - real_mod_ids
        raise ValueError(f"Module mapping mismatch! Missing: {missing}, Invented: {invented}")
    if len(mapped.regions) != len(real_mod_ids):
        raise ValueError("Duplicate region mappings detected.")

    # 2. Tasks <-> Quests
    real_task_ids = {t.id for t in world_model.tasks}
    mapped_task_ids = {q.source_id for q in mapped.quests}
    if real_task_ids != mapped_task_ids:
        missing = real_task_ids - mapped_task_ids
        invented = mapped_task_ids - real_task_ids
        raise ValueError(f"Task mapping mismatch! Missing: {missing}, Invented: {invented}")
    if len(mapped.quests) != len(real_task_ids):
        raise ValueError("Duplicate quest mappings detected.")

    # 3. Security Findings + Failing Tests <-> Bosses
    real_boss_ids = {s.id for s in world_model.security_findings} | {t.id for t in world_model.failing_tests}
    mapped_boss_ids = {b.source_finding_id for b in mapped.bosses}
    if real_boss_ids != mapped_boss_ids:
        missing = real_boss_ids - mapped_boss_ids
        invented = mapped_boss_ids - real_boss_ids
        raise ValueError(f"Boss mapping mismatch! Missing: {missing}, Invented: {invented}")
    if len(mapped.bosses) != len(real_boss_ids):
        raise ValueError("Duplicate boss mappings detected.")

    # 4. Milestones <-> Checkpoints
    real_ms_ids = {m.id for m in world_model.milestones}
    mapped_ms_ids = {c.source_id for c in mapped.checkpoints}
    if real_ms_ids != mapped_ms_ids:
        missing = real_ms_ids - mapped_ms_ids
        invented = mapped_ms_ids - real_ms_ids
        raise ValueError(f"Milestone mapping mismatch! Missing: {missing}, Invented: {invented}")
    if len(mapped.checkpoints) != len(real_ms_ids):
        raise ValueError("Duplicate checkpoint mappings detected.")

    logger.info("Project-to-World mapping successfully verified: 100% strict 1:1 bijection.")
