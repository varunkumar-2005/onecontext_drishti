"""
backend/models/arena_schemas.py
Pydantic v2 schemas for OneContext Arena:
- Game Bible validation
- Real Project World Model
- Project-to-World Mappings
- Arena Sessions and Members
- Quests, Bosses, Checkpoints, XP Events, Assets, World Events
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


# --- GAME BIBLE SCHEMAS ---

class VisualIdentity(BaseModel):
    art_style: str = Field(..., description="E.g. voxel_isometric, low_poly, hand_drawn, pixel_art")
    atmosphere: str = Field(..., description="Lighting, fog, weather, color mood")
    primary_materials: List[str] = Field(default_factory=list, description="Core textures/materials")
    lighting_style: str = Field(..., description="E.g. blocky_sunlight, torchlit_dungeon, neon_glow")


class PaletteColor(BaseModel):
    name: str
    hex: str
    usage: str


class WorldStructureSpec(BaseModel):
    hub_name: str
    district_type: str
    connection_style: str
    boundary_type: str


class VocabularySpec(BaseModel):
    regions: str = Field(..., description="E.g. Biomes, Districts, Levels, Islands")
    tasks: str = Field(..., description="E.g. Quests, Bounties, Missions, Crafting Orders")
    bugs: str = Field(..., description="E.g. Hostile Mobs, Glitches, Rogues, Mutants")
    security_findings: str = Field(..., description="E.g. Dungeon Bosses, World Bosses, Corrupted Titans")
    milestones: str = Field(..., description="E.g. Nether Portals, Warp Gates, Checkpoints, Citadels")
    memories: str = Field(..., description="E.g. Enchantment Books, Lore Scrolls, Ancient Tablets")
    currency_or_xp: str = Field(..., description="E.g. Experience Orbs, Emeralds, Gold Coins, Tech Points")


class GameBible(BaseModel):
    game_name: str
    genre: str
    world_archetype: Literal[
        "voxel_isometric",
        "fantasy_adventure",
        "platformer",
        "strategy_territory",
        "racing",
        "survival",
        "dungeon_exploration",
        "social_deduction",
        "cyberpunk_district",
        "custom"
    ] = "voxel_isometric"
    environment: str
    visual_identity: VisualIdentity
    palette: List[PaletteColor]
    world_structure: WorldStructureSpec
    vocabulary: VocabularySpec
    player_style: Dict[str, Any] = Field(default_factory=dict)
    agent_style: Dict[str, Any] = Field(default_factory=dict)
    map_layout: Dict[str, Any] = Field(default_factory=dict)
    art_direction: Dict[str, Any] = Field(default_factory=dict)
    # Fixed-key, non-structural UI vocabulary. The theme may name these only.
    building_archetypes: Dict[str, str] = Field(default_factory=lambda: {
        "route": "Gateway", "model": "Archive", "ui": "Workshop", "test": "Proving Ground",
        "config": "Control Room", "docs": "Library", "migration": "Foundry", "other": "Building",
    })
    alert_wording: Dict[str, str] = Field(default_factory=lambda: {
        "collision": "Collision", "dependency_risk": "Dependency Risk", "ci_storm": "CI Storm",
        "security_boss": "Security Boss", "migration_conflict": "Migration Conflict", "stale_lore": "Stale Lore",
    })
    alert_voice: str = "Clear, factual, and concise."
    theme_source: Literal["llm", "fallback", "curated"] = "fallback"
    phase_landmark_names: List[str] = Field(default_factory=lambda: [
        "Trailhead Camp", "Crafting Workshop", "River Bridge", "Beacon Tower", "Victory Castle",
    ])
    terrain_style: Literal["grass", "stone", "sand", "snow", "water"] = "grass"
    phase_landmark_archetypes: List[Literal["camp", "workshop", "bridge", "tower", "castle"]] = Field(
        default_factory=lambda: ["camp", "workshop", "bridge", "tower", "castle"]
    )


# --- REAL PROJECT WORLD MODEL SCHEMAS ---

class ProjectModule(BaseModel):
    id: str
    name: str
    path: str
    file_count: int = 0
    languages: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    health_score: int = 100


class ProjectTask(BaseModel):
    id: str
    title: str
    body: Optional[str] = None
    url: Optional[str] = None
    module_id: Optional[str] = None
    labels: List[str] = Field(default_factory=list)
    author: Optional[str] = None
    state: str = "open"
    verification_requirements: str = "Linked PR merged with green CI verification."


class ProjectMilestone(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    due_date: Optional[str] = None
    completed: bool = False
    progress: float = 0.0


class ProjectDependency(BaseModel):
    source_module_id: str
    target_module_id: str
    dependency_type: str = "import"  # import, package, service


class FailingTest(BaseModel):
    id: str
    name: str
    suite: str
    file_path: Optional[str] = None
    error_message: str
    module_id: Optional[str] = None


class SecurityFinding(BaseModel):
    id: str
    title: str
    severity: Literal["low", "medium", "high", "critical"] = "high"
    scanner: str = "StaticSecurityScanner"
    affected_files: List[str] = Field(default_factory=list)
    description: str
    cwe: Optional[str] = None
    module_id: Optional[str] = None


class ProjectMemoryItem(BaseModel):
    id: str
    text: str
    author: Optional[str] = None
    category: str = "architecture"
    created_at: Optional[str] = None


class RealWorldModel(BaseModel):
    project_id: str
    project_name: str
    repo_name: Optional[str] = None
    modules: List[ProjectModule] = Field(default_factory=list)
    tasks: List[ProjectTask] = Field(default_factory=list)
    milestones: List[ProjectMilestone] = Field(default_factory=list)
    dependencies: List[ProjectDependency] = Field(default_factory=list)
    failing_tests: List[FailingTest] = Field(default_factory=list)
    security_findings: List[SecurityFinding] = Field(default_factory=list)
    memories: List[ProjectMemoryItem] = Field(default_factory=list)
    extracted_at: str


# --- MAPPED ENTITIES SCHEMAS ---

class ThemedRegion(BaseModel):
    region_id: str
    module_id: str
    original_name: str
    themed_name: str
    theme_biome_or_zone: str
    description: str
    health: int = 100
    pos_x: float = 0.0
    pos_y: float = 0.0
    issues_count: int = 0
    boss_count: int = 0
    image_url: Optional[str] = None


class ThemedQuest(BaseModel):
    quest_id: str
    source_id: str
    region_id: Optional[str] = None
    original_title: str
    themed_title: str
    description: str
    issue_url: Optional[str] = None
    assigned_to: Optional[str] = None
    status: Literal["available", "claimed", "in_progress", "verified", "closed"] = "available"
    verification_requirements: str
    xp_reward: int = 100
    evidence: Optional[Dict[str, Any]] = None


class ThemedBoss(BaseModel):
    boss_id: str
    source_finding_id: str
    region_id: Optional[str] = None
    themed_name: str
    original_finding: str
    severity: Literal["low", "medium", "high", "critical"] = "high"
    scanner_or_agent: str
    affected_files: List[str] = Field(default_factory=list)
    max_health: int = 100
    current_health: int = 100
    status: Literal["active", "proposed_fix", "defeated"] = "active"
    proposed_fix_diff: Optional[str] = None
    proposed_fix_branch: Optional[str] = None
    approved_by: Optional[str] = None
    image_url: Optional[str] = None
    xp_reward: int = 250


class ThemedCheckpoint(BaseModel):
    checkpoint_id: str
    source_id: str
    original_title: str
    themed_title: str
    status: Literal["locked", "unlocked"] = "locked"
    milestone_due: Optional[str] = None


class ThemedLoreItem(BaseModel):
    lore_id: str
    source_memory_id: str
    themed_title: str
    content: str
    author: Optional[str] = None
    category: str = "architecture"


class MappedWorld(BaseModel):
    session_id: str
    game_name: str
    theme_version: int = 1
    archetype: str
    regions: List[ThemedRegion] = Field(default_factory=list)
    quests: List[ThemedQuest] = Field(default_factory=list)
    bosses: List[ThemedBoss] = Field(default_factory=list)
    checkpoints: List[ThemedCheckpoint] = Field(default_factory=list)
    lore_items: List[ThemedLoreItem] = Field(default_factory=list)
    paths: List[Dict[str, Any]] = Field(default_factory=list)


# --- ARENA SESSION & MEMBER SCHEMAS ---

class CreateArenaSessionRequest(BaseModel):
    project_id: str
    game_name: str
    game_description: Optional[str] = None
    objective: str = "Crush technical debt and conquer release milestone"
    host_name: str = "Lead Adventurer"
    host_user_id: Optional[str] = None


class JoinArenaSessionRequest(BaseModel):
    join_code: str
    user_name: str
    user_id: Optional[str] = None
    avatar_style: Optional[str] = "adventurer"


class RepositoryImportRequest(BaseModel):
    repo_url: str = Field(..., min_length=1, max_length=500)


class TaskMarkdownImportRequest(BaseModel):
    markdown: str = Field(..., min_length=1, max_length=1_000_000)
    default_xp: int = Field(default=100, ge=10, le=500)
    verification_type: Literal["pr_merged_ci_green", "host_approval"] = "host_approval"


class ApproveQuestRequest(BaseModel):
    evidence_note: str = Field(..., min_length=1, max_length=1000)


class SubmitQuestRequest(BaseModel):
    evidence_note: str = Field(..., min_length=1, max_length=1000)


class PhaseUnlockOverrideRequest(BaseModel):
    unlocked: bool


class ArenaMemberPresence(BaseModel):
    user_id: str
    user_name: str
    role: str
    avatar_style: str
    current_region_id: Optional[str] = None
    current_quest_id: Optional[str] = None
    is_online: bool = True
    last_seen: str


class SwitchThemeRequest(BaseModel):
    new_game_name: str
    new_game_description: Optional[str] = None


class ClaimQuestRequest(BaseModel):
    user_id: Optional[str] = None
    user_name: Optional[str] = None


class VerifyQuestRequest(BaseModel):
    pr_number: Optional[int] = None
    commit_sha: Optional[str] = None
    ci_status: Optional[str] = "success"
    evidence_notes: Optional[str] = None


class ProposeBossFixRequest(BaseModel):
    agent_id: str = "agent-builder"
    diff: str
    branch_name: str
    explanation: str


class ApproveBossFixRequest(BaseModel):
    approved_by: str
    run_verification: bool = True


class ArenaSessionSummary(BaseModel):
    id: str
    project_id: str
    project_name: str
    game_name: str
    objective: str
    join_code: str
    status: str
    member_count: int
    created_at: str
