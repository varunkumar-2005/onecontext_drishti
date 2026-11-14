"""
backend/arena/game_engine.py
Dynamic Game Understanding Engine for OneContext Arena:
- Evaluates any game name and optional description.
- Identifies genre, world archetype, environment, visual characteristics, vocabulary, and player/agent styles.
- Generates a fully validated GameBible using Groq LLM and Pydantic schemas.
- Features high-fidelity instant knowledge for iconic games (Minecraft, Swordigo, Zelda, Pokémon, GTA, etc.)
  with seamless dynamic generation for any custom or obscure game universe.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

from backend.models.arena_schemas import (
    GameBible,
    PaletteColor,
    VisualIdentity,
    VocabularySpec,
    WorldStructureSpec,
)

logger = logging.getLogger("onecontext.arena.game_engine")

# High-fidelity curated world bibles for instant, reliable zero-latency startup & test scenarios
CURATED_GAME_BIBLES: Dict[str, Dict[str, Any]] = {
    "minecraft": {
        "game_name": "Minecraft",
        "genre": "sandbox_voxel",
        "world_archetype": "voxel_isometric",
        "environment": "blocky_overworld_and_nether",
        "visual_identity": {
            "art_style": "voxel_isometric",
            "atmosphere": "crisp daylight with pixelated clouds, blocky terrain, torchlit dungeons, and mysterious obsidian glow",
            "primary_materials": ["oak_wood", "cobblestone", "redstone_dust", "smooth_stone", "obsidian", "glowstone"],
            "lighting_style": "voxel_sunlight_and_block_lighting",
        },
        "palette": [
            {"name": "Grass Green", "hex": "#477c26", "usage": "surface_biomes"},
            {"name": "Stone Grey", "hex": "#737373", "usage": "dungeons_and_caves"},
            {"name": "Redstone Red", "hex": "#dc2626", "usage": "api_wires_and_power"},
            {"name": "Oak Plank Tan", "hex": "#b48450", "usage": "villages_and_workbenches"},
            {"name": "Diamond Cyan", "hex": "#06b6d4", "usage": "verified_relics_and_armor"},
            {"name": "Obsidian Purple", "hex": "#581c87", "usage": "portals_and_security_bosses"},
        ],
        "world_structure": {
            "hub_name": "Spawn Village & Central Crafting Hall",
            "district_type": "Biomes & Caverns",
            "connection_style": "Minecart Rails & Dirt Paths",
            "boundary_type": "Bedrock Layer & Infinite Ocean",
        },
        "vocabulary": {
            "regions": "Biomes",
            "tasks": "Quests & Crafting Orders",
            "bugs": "Hostile Mobs",
            "security_findings": "Dungeon Bosses & Corrupted Golems",
            "milestones": "Nether Portals",
            "memories": "Enchanted Books & Lectern Archives",
            "currency_or_xp": "Experience Orbs",
        },
        "player_style": {
            "appearance": "Blocky adventurer with pixelated tunic and iron tools",
            "animation": "Voxel stride with pickaxe swing",
        },
        "agent_style": {
            "appearance": "Friendly Iron Golem and Allay companion carrying redstone torches",
            "indicator": "Floating floating beacon beam",
        },
        "map_layout": {
            "projection": "isometric_3d_grid",
            "tile_size": 48,
            "elevation_steps": [0, 1, 2, 3],
        },
        "art_direction": {
            "theme_rules": "Strict 16x16 voxel texture aesthetics, volumetric cube shadows, grid-aligned structure",
        },
    },
    "swordigo": {
        "game_name": "Swordigo",
        "genre": "fantasy_action_platformer",
        "world_archetype": "platformer",
        "environment": "mythic_valleys_ancient_castles_and_corrupted_caves",
        "visual_identity": {
            "art_style": "low_poly_fantasy",
            "atmosphere": "mystical twilight, floating mana wisps, ancient stone statues, and dark corruption",
            "primary_materials": ["ancient_granite", "magic_shards", "dungeon_chains", "enchanted_iron"],
            "lighting_style": "magical_crystal_glow_and_torchlight",
        },
        "palette": [
            {"name": "Forest Emerald", "hex": "#059669", "usage": "starting_valley"},
            {"name": "Ancient Stone", "hex": "#4b5563", "usage": "ruins_and_kingdom"},
            {"name": "Mana Violet", "hex": "#7c3aed", "usage": "magic_spells_and_api"},
            {"name": "Corrupted Crimson", "hex": "#b91c1c", "usage": "dungeon_bosses"},
            {"name": "Soul Gold", "hex": "#f59e0b", "usage": "checkpoints_and_mastery"},
        ],
        "world_structure": {
            "hub_name": "Ancient Kingdom Sanctuary",
            "district_type": "Adventure Levels & Castles",
            "connection_style": "Rope Bridges & Stone Portals",
            "boundary_type": "Mystic Chasms",
        },
        "vocabulary": {
            "regions": "Adventure Realms",
            "tasks": "Heroic Quests",
            "bugs": "Shadow Bats & Spiders",
            "security_findings": "Corrupted Dungeon Bosses",
            "milestones": "Ancient Healing Portals",
            "memories": "Ancient Knowledge Tablets",
            "currency_or_xp": "Soul Shards",
        },
        "player_style": {
            "appearance": "Hero with enchanted blue tunic and magic blade",
            "animation": "Double jump and sword slash",
        },
        "agent_style": {
            "appearance": "Wise village Elder and floating Spirit Companion",
            "indicator": "Radiant mana spark",
        },
        "map_layout": {
            "projection": "side_scroll_multi_tiered",
            "tile_size": 40,
            "elevation_steps": [0, 1, 2, 4],
        },
        "art_direction": {
            "theme_rules": "Low-poly stylized 3D rendered in vibrant fantasy gradients with glowing edges",
        },
    },
    "zelda": {
        "game_name": "Zelda",
        "genre": "fantasy_adventure",
        "world_archetype": "fantasy_adventure",
        "environment": "hyrule_kingdom_and_ancient_shrines",
        "visual_identity": {
            "art_style": "cel_shaded_watercolor",
            "atmosphere": "sweeping green pastures, ancient Sheikah ruins, glowing blue runes",
            "primary_materials": ["ancient_shrine_stone", "divine_wood", "sheikah_alloy"],
            "lighting_style": "sunlit_pasture_and_neon_blue_runic_glow",
        },
        "palette": [
            {"name": "Hyrule Green", "hex": "#15803d", "usage": "open_fields"},
            {"name": "Sheikah Cyan", "hex": "#0ea5e9", "usage": "ancient_tech_and_apis"},
            {"name": "Triforce Gold", "hex": "#eab308", "usage": "milestones_and_glory"},
            {"name": "Calamity Crimson", "hex": "#991b1b", "usage": "bosses_and_security_flaws"},
        ],
        "world_structure": {
            "hub_name": "Great Plateau Citadel",
            "district_type": "Provinces & Ancient Shrines",
            "connection_style": "Ancient Roads & Wind Currents",
            "boundary_type": "Mount Hylia Ranges",
        },
        "vocabulary": {
            "regions": "Provinces",
            "tasks": "Shrine Quests",
            "bugs": "Bokoblin Outposts",
            "security_findings": "Blight Ganon Incarnations",
            "milestones": "Sheikah Towers",
            "memories": "Ancient Sheikah Slate Lore",
            "currency_or_xp": "Spirit Orbs",
        },
        "player_style": {
            "appearance": "Champion in tunic wielding Master Sword",
            "animation": "Shield surf and parry",
        },
        "agent_style": {
            "appearance": "Guardian Scout AI companion",
            "indicator": "Blue laser focus ring",
        },
        "map_layout": {
            "projection": "top_down_adventure_map",
            "tile_size": 44,
            "elevation_steps": [0, 1, 2],
        },
        "art_direction": {
            "theme_rules": "Cel-shaded watercolor look with bold outlines and warm, luminous natural lighting",
        },
    },
    "gta v": {
        "game_name": "GTA V",
        "genre": "open_world_action",
        "world_archetype": "cyberpunk_district",
        "environment": "los_santos_metropolis_and_coastal_highways",
        "visual_identity": {
            "art_style": "stylized_urban_noir",
            "atmosphere": "golden sunset over coastal highway, skyscrapers with neon signage, gritty industrial alleys",
            "primary_materials": ["asphalt", "reinforced_concrete", "tinted_glass", "chromed_steel"],
            "lighting_style": "streetlights_and_car_headlights_with_golden_hour_bloom",
        },
        "palette": [
            {"name": "Asphalt Dark", "hex": "#1e293b", "usage": "districts_and_roads"},
            {"name": "Sunset Amber", "hex": "#f59e0b", "usage": "downtown_towers"},
            {"name": "Neon Cyan", "hex": "#06b6d4", "usage": "api_networks"},
            {"name": "Wanted Red", "hex": "#ef4444", "usage": "syndicate_bosses"},
            {"name": "Heist Green", "hex": "#10b981", "usage": "payouts_and_xp"},
        ],
        "world_structure": {
            "hub_name": "Downtown High-Rise HQ",
            "district_type": "Metropolitan Districts",
            "connection_style": "Multi-Lane Expressways",
            "boundary_type": "Pacific Ocean Coastline",
        },
        "vocabulary": {
            "regions": "City Districts",
            "tasks": "Heist Missions & Bounties",
            "bugs": "Rogue Street Gangs",
            "security_findings": "Syndicate Cartel Bosses",
            "milestones": "Major Heist Finales",
            "memories": "Encrypted Flash Drives & Wiretap Archives",
            "currency_or_xp": "Clean Payout Cash",
        },
        "player_style": {
            "appearance": "Tactical operative in tailored jacket and sunglasses",
            "animation": "Quick draw and sports car drift",
        },
        "agent_style": {
            "appearance": "Master Hacker in surveillance van",
            "indicator": "HUD minimap radar ping",
        },
        "map_layout": {
            "projection": "top_down_street_grid",
            "tile_size": 48,
            "elevation_steps": [0, 1],
        },
        "art_direction": {
            "theme_rules": "Sleek metropolitan aesthetic with high-contrast road layouts and glowing city nodes",
        },
    },
    "pokémon": {
        "game_name": "Pokémon",
        "genre": "monster_collection_rpg",
        "world_archetype": "fantasy_adventure",
        "environment": "vibrant_kanto_routes_and_gym_cities",
        "visual_identity": {
            "art_style": "pixel_art_nostalgia",
            "atmosphere": "bright sunlit routes, tall grass patches, cheerful poké-centers, and bustling gyms",
            "primary_materials": ["route_dirt", "pokéball_composite", "gym_hardwood"],
            "lighting_style": "bright_clean_isometric_sunlight",
        },
        "palette": [
            {"name": "Route Green", "hex": "#22c55e", "usage": "overworld_routes"},
            {"name": "Pokéball Red", "hex": "#ef4444", "usage": "gym_challenges"},
            {"name": "Water Blue", "hex": "#3b82f6", "usage": "coastal_networks"},
            {"name": "Electric Yellow", "hex": "#eab308", "usage": "badges_and_milestones"},
        ],
        "world_structure": {
            "hub_name": "Pallet Town Research Lab",
            "district_type": "Towns & Routes",
            "connection_style": "Fenced Routes & Cycling Roads",
            "boundary_type": "Ledge Jumps & Mountain Passes",
        },
        "vocabulary": {
            "regions": "Routes & Cities",
            "tasks": "Trainer Battles & Field Research",
            "bugs": "Wild Encounters in Tall Grass",
            "security_findings": "Gym Leaders & Team Rocket Admins",
            "milestones": "Elite Four Badges",
            "memories": "Pokédex Technical Data",
            "currency_or_xp": "Trainer XP & PokéDollars",
        },
        "player_style": {
            "appearance": "Youthful trainer with baseball cap and backpack",
            "animation": "Pokéball toss and victory spin",
        },
        "agent_style": {
            "appearance": "Professor Oak assistant hologram with Rotom-Dex",
            "indicator": "Bouncing Pokéball indicator",
        },
        "map_layout": {
            "projection": "top_down_adventure_map",
            "tile_size": 40,
            "elevation_steps": [0, 1],
        },
        "art_direction": {
            "theme_rules": "Crisp 16-bit color palettes with cheerful route signposts and clearly defined tiles",
        },
    },
}


class GameUnderstandingEngine:
    """Understands any selected game universe and returns a validated GameBible."""

    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    def generate_game_bible(
        self,
        game_name: str,
        optional_description: Optional[str] = None,
    ) -> GameBible:
        """Derive or look up a full Game Bible for the given game universe."""
        clean_name = game_name.strip()
        lookup_key = clean_name.lower()

        # 1. Fast match on curated bibles
        for key, bible_dict in CURATED_GAME_BIBLES.items():
            if key in lookup_key or lookup_key in key:
                logger.info(f"Loaded curated Game Bible for '{clean_name}'.")
                return GameBible.model_validate(bible_dict)

        # 2. Dynamic generation using Groq LLM
        if self.llm_client:
            try:
                dynamic_bible = self._generate_with_llm(clean_name, optional_description)
                if dynamic_bible:
                    logger.info(f"Successfully generated dynamic Game Bible for '{clean_name}' via LLM.")
                    return dynamic_bible
            except Exception as exc:
                logger.warning(f"Dynamic LLM game bible generation failed: {exc}. Using fallback archetype.")

        # 3. Fallback archetype derivation
        return self._generate_fallback_bible(clean_name, optional_description)

    def _generate_with_llm(
        self,
        game_name: str,
        description: Optional[str] = None,
    ) -> Optional[GameBible]:
        """Prompt LLM for a structured JSON Game Bible adhering to Zod/Pydantic schemas."""
        prompt = f"""
You are the Lead Game Architect & Narrative Systems Designer for OneContext Arena.
Analyze the game universe '{game_name}'.
User description (if any): {description or 'None provided'}

Select the most appropriate worldArchetype from:
["voxel_isometric", "fantasy_adventure", "platformer", "strategy_territory", "racing", "survival", "dungeon_exploration", "social_deduction", "cyberpunk_district", "custom"]

Output a STRICT JSON object matching this schema exactly (no code fence, no text outside JSON):
{{
  "game_name": "{game_name}",
  "genre": "<concise genre string, e.g. survival_crafting, stealth_action, sci_fi_rpg>",
  "world_archetype": "<one of the valid archetypes above>",
  "environment": "<description of world environment, e.g. floating_cyber_islands>",
  "visual_identity": {{
    "art_style": "<e.g. low_poly, hand_drawn, voxel_isometric, dark_fantasy_realism>",
    "atmosphere": "<lighting, weather, atmospheric mood>",
    "primary_materials": ["<material 1>", "<material 2>", "<material 3>"],
    "lighting_style": "<e.g. neon_rim_lighting, flickering_torchlight, harsh_sunlight>"
  }},
  "palette": [
    {{"name": "Color 1", "hex": "#10b981", "usage": "surface"}},
    {{"name": "Color 2", "hex": "#3b82f6", "usage": "technology"}},
    {{"name": "Color 3", "hex": "#ef4444", "usage": "danger"}},
    {{"name": "Color 4", "hex": "#f59e0b", "usage": "reward"}}
  ],
  "world_structure": {{
    "hub_name": "<central spawn hub name in this universe>",
    "district_type": "<e.g. Sectors, Realms, Quadrants, Biomes>",
    "connection_style": "<e.g. Teleporters, Hyperlanes, Dirt Roads, Rope Bridges>",
    "boundary_type": "<e.g. Deep Space, Bedrock, Force Field, Ancient Ruins>"
  }},
  "vocabulary": {{
    "regions": "<term for map regions>",
    "tasks": "<term for quests/tasks>",
    "bugs": "<term for minor bugs/hostiles>",
    "security_findings": "<term for security bosses>",
    "milestones": "<term for major checkpoints>",
    "memories": "<term for knowledge archives/lore>",
    "currency_or_xp": "<term for XP or points>"
  }},
  "player_style": {{
    "appearance": "<visual description of developer avatar>",
    "animation": "<signature player movement>"
  }},
  "agent_style": {{
    "appearance": "<visual description of AI agent in this universe>",
    "indicator": "<visual beacon or companion marker>"
  }},
  "map_layout": {{
    "projection": "isometric_3d_grid",
    "tile_size": 48,
    "elevation_steps": [0, 1, 2]
  }},
  "art_direction": {{
    "theme_rules": "<concise art rules for rendering this world>"
  }},
  "phase_landmark_names": ["<phase landmark name>"],
  "terrain_style": "<one of grass, stone, sand, snow, water>",
  "phase_landmark_archetypes": ["<one of camp, workshop, bridge, tower, castle>"]
}}
"""
        messages = [
            {"role": "system", "content": "You are a specialized game architecture compiler that returns only strict JSON."},
            {"role": "user", "content": prompt},
        ]
        raw_text, _ = self.llm_client.chat(messages, max_tokens=1024, temperature=0.1)

        # Clean any accidental markdown quotes
        clean_json = raw_text.strip()
        if clean_json.startswith("```"):
            lines = clean_json.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            clean_json = "\n".join(lines).strip()

        data = json.loads(clean_json)
        allowed_terrain = {"grass", "stone", "sand", "snow", "water"}
        allowed_landmarks = {"camp", "workshop", "bridge", "tower", "castle"}
        terrain_style = data.get("terrain_style")
        if not isinstance(terrain_style, str) or terrain_style not in allowed_terrain:
            data["terrain_style"] = "grass"
        archetypes = data.get("phase_landmark_archetypes")
        if not isinstance(archetypes, list) or not archetypes:
            data["phase_landmark_archetypes"] = ["camp", "workshop", "bridge", "tower", "castle"]
        else:
            data["phase_landmark_archetypes"] = [
                value if isinstance(value, str) and value in allowed_landmarks else "camp"
                for value in archetypes
            ]
        names = data.get("phase_landmark_names")
        if isinstance(names, list):
            names = [name.strip()[:80] for name in names if isinstance(name, str) and name.strip()]
        if not names:
            data["phase_landmark_names"] = [
                "Ingestion Gateway", "Engine Pipeline", "Agent Matrix", "Telemetry Nexus", "Production Citadel",
            ]
        else:
            data["phase_landmark_names"] = names[:20]
        bible = GameBible.model_validate(data)
        expected_kinds = {"route", "model", "ui", "test", "config", "docs", "migration", "other"}
        expected_alerts = {"collision", "dependency_risk", "ci_storm", "security_boss", "migration_conflict", "stale_lore"}
        if set(bible.building_archetypes) != expected_kinds or set(bible.alert_wording) != expected_alerts:
            raise ValueError("Theme vocabulary must contain exactly the fixed file and alert kinds.")
        return bible.model_copy(update={"theme_source": "llm"})

    def _generate_fallback_bible(
        self,
        game_name: str,
        optional_description: Optional[str] = None,
    ) -> GameBible:
        """Deterministic fallback when LLM is unavailable."""
        return GameBible(
            game_name=game_name,
            genre="dynamic_adventure",
            world_archetype="fantasy_adventure",
            environment=f"The themed realms of {game_name}",
            visual_identity=VisualIdentity(
                art_style="stylized_isometric",
                atmosphere=f"Rich atmospheric world reflecting the spirit of {game_name}",
                primary_materials=["ancient_stone", "energy_crystals", "reinforced_alloy"],
                lighting_style="dynamic_ambient_glow",
            ),
            palette=[
                PaletteColor(name="Primary", hex="#3b82f6", usage="regions"),
                PaletteColor(name="Accent", hex="#10b981", usage="cleared_nodes"),
                PaletteColor(name="Hazard", hex="#ef4444", usage="boss_encounters"),
                PaletteColor(name="Milestone", hex="#8b5cf6", usage="portals"),
            ],
            world_structure=WorldStructureSpec(
                hub_name=f"{game_name} Citadel",
                district_type="Zones",
                connection_style="Energy Bridges",
                boundary_type="Void Perimeter",
            ),
            vocabulary=VocabularySpec(
                regions="Sectors",
                tasks="Missions",
                bugs="System Anomalies",
                security_findings="Sector Overlords",
                milestones="Warp Beacons",
                memories="Core Archives",
                currency_or_xp="Credits",
            ),
            player_style={"appearance": "Heroic explorer", "animation": "Forward dash"},
            agent_style={"appearance": "Companion drone", "indicator": "Aura ping"},
            map_layout={"projection": "isometric_3d_grid", "tile_size": 48, "elevation_steps": [0, 1, 2]},
            art_direction={"theme_rules": "Polished stylized isometric rendering with high visual clarity"},
            theme_source="fallback",
        )


game_engine = GameUnderstandingEngine()
