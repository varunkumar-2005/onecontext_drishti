"""
backend/arena/layout.py
World Layout Engine for OneContext Arena:
- Takes GameBible, RealWorldModel, and Dependency Graph.
- Dynamically arranges nodes into archetype-specific geometries:
  * voxel_isometric: Isometric diamond grid with staggered elevations and orthogonal path routing.
  * platformer: Multi-tier floating platforms with vertical rope/ladder connections.
  * cyberpunk_district / gta: Metropolitan street blocks with highway corridors.
  * fantasy_adventure: Radial world tree / island clusters with curved trail connections.
  * strategy_territory: Hexagonal / polygonal territory grid.
- Places hotspots, quest markers, boss markers, checkpoints, and player spawn points.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from backend.models.arena_schemas import GameBible, MappedWorld, RealWorldModel


class WorldLayoutEngine:
    """Computes coordinate systems, path routing, and visual markers according to game archetype."""

    def compute_layout(
        self,
        mapped_world: MappedWorld,
        game_bible: GameBible,
    ) -> Dict[str, Any]:
        archetype = game_bible.world_archetype
        regions = mapped_world.regions
        paths = mapped_world.paths
        bosses = mapped_world.bosses
        quests = mapped_world.quests
        checkpoints = mapped_world.checkpoints

        # Calculate canvas bounds based on number of regions
        canvas_width = 1200
        canvas_height = 800

        if archetype == "voxel_isometric":
            positioned_regions = self._layout_voxel_isometric(regions, canvas_width, canvas_height)
        elif archetype == "platformer":
            positioned_regions = self._layout_platformer(regions, canvas_width, canvas_height)
        elif archetype in ("cyberpunk_district", "racing"):
            positioned_regions = self._layout_street_grid(regions, canvas_width, canvas_height)
        else:
            # Default: fantasy_adventure / radial cluster
            positioned_regions = self._layout_radial_adventure(regions, canvas_width, canvas_height)

        # Build region lookup map
        reg_map = {r["region_id"]: r for r in positioned_regions}

        # Build path coordinates
        routed_paths = []
        for p in paths:
            src = reg_map.get(p["source_region_id"])
            tgt = reg_map.get(p["target_region_id"])
            if src and tgt:
                routed_paths.append(
                    {
                        "source_id": p["source_region_id"],
                        "target_id": p["target_region_id"],
                        "x1": src["x"],
                        "y1": src["y"],
                        "x2": tgt["x"],
                        "y2": tgt["y"],
                        "type": p.get("dependency_type", "import"),
                        "style": p.get("path_style", "path"),
                    }
                )

        # Place Boss Markers (offset near top-right of affected region)
        boss_markers = []
        for b in bosses:
            reg = reg_map.get(b.region_id or "")
            if reg:
                boss_markers.append(
                    {
                        "boss_id": b.boss_id,
                        "source_finding_id": b.source_finding_id,
                        "themed_name": b.themed_name,
                        "severity": b.severity,
                        "status": b.status,
                        "current_health": b.current_health,
                        "max_health": b.max_health,
                        "region_id": b.region_id,
                        "x": reg["x"] + 38,
                        "y": reg["y"] - 32,
                    }
                )

        # Place Quest Markers
        quest_markers = []
        for q in quests:
            reg = reg_map.get(q.region_id or "")
            if reg:
                quest_markers.append(
                    {
                        "quest_id": q.quest_id,
                        "source_id": q.source_id,
                        "themed_title": q.themed_title,
                        "status": q.status,
                        "xp_reward": q.xp_reward,
                        "region_id": q.region_id,
                        "x": reg["x"] - 35,
                        "y": reg["y"] + 25,
                    }
                )

        # Place Checkpoints / Portals
        checkpoint_markers = []
        for idx, cp in enumerate(checkpoints):
            # Anchor checkpoints at perimeter or dedicated focal points
            cp_x = 100 + (idx * 300)
            cp_y = 60
            checkpoint_markers.append(
                {
                    "checkpoint_id": cp.checkpoint_id,
                    "source_id": cp.source_id,
                    "themed_title": cp.themed_title,
                    "status": cp.status,
                    "x": cp_x,
                    "y": cp_y,
                }
            )

        # Player spawn point: near first region or central hub
        spawn_x = positioned_regions[0]["x"] - 50 if positioned_regions else 600
        spawn_y = positioned_regions[0]["y"] if positioned_regions else 400

        return {
            "archetype": archetype,
            "canvas_width": canvas_width,
            "canvas_height": canvas_height,
            "regions": positioned_regions,
            "paths": routed_paths,
            "boss_markers": boss_markers,
            "quest_markers": quest_markers,
            "checkpoint_markers": checkpoint_markers,
            "spawn_point": {"x": spawn_x, "y": spawn_y},
            "palette": [p.model_dump() for p in game_bible.palette],
            "visual_identity": game_bible.visual_identity.model_dump(),
        }

    def _layout_voxel_isometric(self, regions: List[Any], width: int, height: int) -> List[Dict[str, Any]]:
        """Isometric 3D diamond layout with stepped elevations."""
        positioned = []
        cols = 3
        tile_w = 260
        tile_h = 130
        origin_x = width // 2
        origin_y = 160

        for idx, r in enumerate(regions):
            grid_x = (idx % cols) - (cols // 2)
            grid_y = idx // cols

            # Isometric projection: isoX = (x - y) * tileW/2, isoY = (x + y) * tileH/2
            iso_x = origin_x + (grid_x - grid_y) * (tile_w // 2)
            elevation = (idx % 3) * 20
            iso_y = origin_y + (grid_x + grid_y) * (tile_h // 2) - elevation

            positioned.append(
                {
                    "region_id": r.region_id,
                    "module_id": r.module_id,
                    "original_name": r.original_name,
                    "themed_name": r.themed_name,
                    "theme_zone": r.theme_biome_or_zone,
                    "health": r.health,
                    "issues_count": r.issues_count,
                    "boss_count": r.boss_count,
                    "x": iso_x,
                    "y": iso_y,
                    "elevation": elevation,
                    "shape": "isometric_cube",
                }
            )
        return positioned

    def _layout_platformer(self, regions: List[Any], width: int, height: int) -> List[Dict[str, Any]]:
        """Multi-tiered floating platforms with horizontal progression."""
        positioned = []
        tiers = [height - 180, height - 360, height - 540]
        step_x = width // (max(2, (len(regions) + 1) // 2))

        for idx, r in enumerate(regions):
            tier_idx = idx % 3
            tier_y = tiers[tier_idx]
            tier_x = 140 + ((idx // 2) * 220)

            positioned.append(
                {
                    "region_id": r.region_id,
                    "module_id": r.module_id,
                    "original_name": r.original_name,
                    "themed_name": r.themed_name,
                    "theme_zone": r.theme_biome_or_zone,
                    "health": r.health,
                    "issues_count": r.issues_count,
                    "boss_count": r.boss_count,
                    "x": tier_x,
                    "y": tier_y,
                    "elevation": (tier_idx + 1) * 30,
                    "shape": "floating_platform",
                }
            )
        return positioned

    def _layout_street_grid(self, regions: List[Any], width: int, height: int) -> List[Dict[str, Any]]:
        """Orthogonal urban district blocks with street avenues."""
        positioned = []
        cols = 3
        start_x = 180
        start_y = 180
        spacing_x = 280
        spacing_y = 200

        for idx, r in enumerate(regions):
            col = idx % cols
            row = idx // cols
            x = start_x + (col * spacing_x)
            y = start_y + (row * spacing_y)

            positioned.append(
                {
                    "region_id": r.region_id,
                    "module_id": r.module_id,
                    "original_name": r.original_name,
                    "themed_name": r.themed_name,
                    "theme_zone": r.theme_biome_or_zone,
                    "health": r.health,
                    "issues_count": r.issues_count,
                    "boss_count": r.boss_count,
                    "x": x,
                    "y": y,
                    "elevation": 0,
                    "shape": "urban_block",
                }
            )
        return positioned

    def _layout_radial_adventure(self, regions: List[Any], width: int, height: int) -> List[Dict[str, Any]]:
        """Radial cluster with hub at center and zones fanning outward."""
        positioned = []
        center_x = width // 2
        center_y = height // 2 + 30
        radius = 260
        count = len(regions)

        for idx, r in enumerate(regions):
            if idx == 0:
                # Central hub
                x = center_x
                y = center_y
            else:
                angle = (2 * math.pi / (count - 1)) * (idx - 1) - (math.pi / 2)
                x = center_x + int(radius * math.cos(angle))
                y = center_y + int(radius * 0.7 * math.sin(angle))

            positioned.append(
                {
                    "region_id": r.region_id,
                    "module_id": r.module_id,
                    "original_name": r.original_name,
                    "themed_name": r.themed_name,
                    "theme_zone": r.theme_biome_or_zone,
                    "health": r.health,
                    "issues_count": r.issues_count,
                    "boss_count": r.boss_count,
                    "x": x,
                    "y": y,
                    "elevation": 10 if idx > 0 else 25,
                    "shape": "radial_isle",
                }
            )
        return positioned


layout_engine = WorldLayoutEngine()
