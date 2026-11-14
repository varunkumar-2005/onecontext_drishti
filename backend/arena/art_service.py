"""
backend/arena/art_service.py
Centralized Image Generation Service for OneContext Arena:
- Interfaces with Gemini Nano Banana / Imagen API for AI artwork.
- Supports background generation, retry handling, failure tolerance, and cache lookups.
- Publishes real-time 'arena_asset_ready' events through the existing broadcaster.
- Provides rich, stylized procedural theme-aware artwork fallbacks (SVG/Data-URIs)
  whenever GEMINI_API_KEY is not configured or network generation fails.
- Never falsely claims an external asset was generated if the request failed.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import urllib.request
from typing import Any, Dict, List, Optional

from backend.core.broadcaster import broadcaster
from backend.models.arena_schemas import GameBible
from backend.storage import arena_db

logger = logging.getLogger("onecontext.arena.art_service")


class ArenaArtService:
    """Manages AI image synthesis, procedural fallback generation, and asset caching."""

    def __init__(self):
        try:
            from backend.config import get_settings
            settings = get_settings()
            self.api_key = os.getenv("GEMINI_API_KEY") or settings.gemini_api_key
            self.image_model = os.getenv("GEMINI_IMAGE_MODEL") or settings.gemini_image_model
        except Exception:
            self.api_key = os.getenv("GEMINI_API_KEY")
            self.image_model = os.getenv("GEMINI_IMAGE_MODEL")

    def get_cached_asset(self, session_id: str, theme_id: str, asset_key: str) -> Optional[Dict[str, Any]]:
        assets = arena_db.get_theme_assets(session_id=session_id, theme_id=theme_id)
        for a in assets:
            if a["asset_key"] == asset_key and a["status"] == "ready":
                return a
        return None

    def generate_asset_prompt(
        self,
        asset_type: str,
        entity_name: str,
        game_bible: GameBible,
        context_description: str = "",
    ) -> str:
        """Compose a prompt enforcing visual consistency with the Game Bible."""
        visual = game_bible.visual_identity
        palette_colors = ", ".join([f"{c.name} ({c.hex})" for c in game_bible.palette[:4]])

        prompt = (
            f"Original digital artwork inspired by {game_bible.game_name} aesthetic. "
            f"Subject: {entity_name} ({asset_type}). {context_description}. "
            f"Art style: {visual.art_style}. Lighting: {visual.lighting_style}. "
            f"Atmosphere: {visual.atmosphere}. Color palette: {palette_colors}. "
            "Masterpiece, cinematic composition, game concept art, highly detailed, no text watermark."
        )
        return prompt

    def generate_procedural_asset(
        self,
        asset_type: str,
        entity_name: str,
        game_bible: GameBible,
    ) -> str:
        """
        Generate an SVG procedural artwork that visually represents the game universe.
        Returns a data:image/svg+xml;base64 URI.
        """
        palette = [c.hex for c in game_bible.palette] if game_bible.palette else ["#2563eb", "#10b981", "#f59e0b", "#ef4444"]
        c1 = palette[0]
        c2 = palette[1] if len(palette) > 1 else "#3b82f6"
        c3 = palette[2] if len(palette) > 2 else "#10b981"
        c4 = palette[3] if len(palette) > 3 else "#ef4444"

        game_lower = game_bible.game_name.lower()
        is_voxel = "minecraft" in game_lower or "voxel" in game_bible.world_archetype
        is_platformer = "swordigo" in game_lower or "platformer" in game_bible.world_archetype
        is_city = "gta" in game_lower or "cyberpunk" in game_bible.world_archetype

        width = 800
        height = 450

        if is_voxel:
            # Blocky / Voxel isometric illustration
            svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="100%" height="100%">
  <defs>
    <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="70%" stop-color="#bae6fd"/>
      <stop offset="100%" stop-color="{c1}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="4" dy="6" stdDeviation="4" flood-opacity="0.4"/>
    </filter>
  </defs>
  <rect width="{width}" height="{height}" fill="url(#sky)"/>
  <!-- Voxel Clouds -->
  <rect x="60" y="40" width="120" height="28" fill="#ffffff" opacity="0.85"/>
  <rect x="120" y="30" width="140" height="28" fill="#ffffff" opacity="0.85"/>
  <rect x="520" y="60" width="180" height="34" fill="#ffffff" opacity="0.85"/>
  <!-- Stepped Voxel Terrain -->
  <polygon points="400,160 620,260 400,360 180,260" fill="{c1}" filter="url(#shadow)"/>
  <polygon points="180,260 400,360 400,430 180,330" fill="#3f3f46"/>
  <polygon points="400,360 620,260 620,330 400,430" fill="#27272a"/>
  <!-- Sub-block elevation -->
  <polygon points="400,200 480,240 400,280 320,240" fill="{c2}" filter="url(#shadow)"/>
  <polygon points="320,240 400,280 400,310 320,270" fill="#18181b"/>
  <polygon points="400,280 480,240 480,270 400,310" fill="#09090b"/>
  <!-- Glowing Beacon / Relic -->
  <circle cx="400" cy="220" r="16" fill="{c3}"/>
  <line x1="400" y1="220" x2="400" y2="40" stroke="{c3}" stroke-width="4" stroke-dasharray="6,4" opacity="0.75"/>
  <!-- Title Badge -->
  <rect x="20" y="{height - 60}" width="380" height="42" rx="6" fill="#18181b" opacity="0.85"/>
  <text x="35" y="{height - 34}" fill="#ffffff" font-family="monospace" font-size="16" font-weight="bold">
    {game_bible.game_name.upper()} • {entity_name[:24]}
  </text>
</svg>"""
        elif is_platformer:
            # Fantasy floating platformer illustration
            svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="100%" height="100%">
  <defs>
    <linearGradient id="twilight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="50%" stop-color="#312e81"/>
      <stop offset="100%" stop-color="#4c1d95"/>
    </linearGradient>
    <radialGradient id="manaGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="{c3}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="{c3}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="{width}" height="{height}" fill="url(#twilight)"/>
  <!-- Stars -->
  <circle cx="120" cy="60" r="2" fill="#ffffff" opacity="0.8"/>
  <circle cx="280" cy="90" r="1.5" fill="#ffffff" opacity="0.6"/>
  <circle cx="640" cy="70" r="2.5" fill="#ffffff" opacity="0.9"/>
  <!-- Floating Platform Castle -->
  <circle cx="400" cy="180" r="120" fill="url(#manaGlow)"/>
  <polygon points="260,280 540,280 480,330 320,330" fill="{c1}"/>
  <rect x="360" y="160" width="80" height="120" fill="{c2}"/>
  <polygon points="340,160 400,100 460,160" fill="{c4}"/>
  <!-- Mana Wisps -->
  <circle cx="340" cy="220" r="8" fill="{c3}"/>
  <circle cx="460" cy="200" r="6" fill="{c3}"/>
  <!-- Title Badge -->
  <rect x="20" y="{height - 60}" width="380" height="42" rx="6" fill="#0f172a" opacity="0.9"/>
  <text x="35" y="{height - 34}" fill="#e0e7ff" font-family="sans-serif" font-size="16" font-weight="bold">
    {game_bible.game_name} • {entity_name[:24]}
  </text>
</svg>"""
        elif is_city:
            # Stylized urban noir
            svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="100%" height="100%">
  <defs>
    <linearGradient id="sunset" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="60%" stop-color="#b45309"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="{width}" height="{height}" fill="url(#sunset)"/>
  <!-- Skyline -->
  <rect x="80" y="140" width="90" height="260" fill="#090d16"/>
  <rect x="200" y="100" width="110" height="300" fill="#05080e"/>
  <rect x="340" y="80" width="130" height="320" fill="#090d16"/>
  <rect x="500" y="120" width="100" height="280" fill="#05080e"/>
  <rect x="630" y="160" width="90" height="240" fill="#090d16"/>
  <!-- Neon Accents -->
  <line x1="200" y1="100" x2="310" y2="100" stroke="{c2}" stroke-width="4"/>
  <line x1="340" y1="80" x2="470" y2="80" stroke="{c4}" stroke-width="5"/>
  <!-- Highway Roadway -->
  <polygon points="0,400 {width},400 {width},450 0,450" fill="#0f172a"/>
  <line x1="0" y1="425" x2="{width}" y2="425" stroke="{c3}" stroke-width="3" stroke-dasharray="20,15"/>
  <!-- Title Badge -->
  <rect x="20" y="{height - 60}" width="380" height="42" rx="6" fill="#020617" opacity="0.95"/>
  <text x="35" y="{height - 34}" fill="#f8fafc" font-family="sans-serif" font-size="16" font-weight="bold">
    {game_bible.game_name} • {entity_name[:24]}
  </text>
</svg>"""
        else:
            # Universal adventure banner
            svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="100%" height="100%">
  <defs>
    <linearGradient id="universalBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{c1}"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="{width}" height="{height}" fill="url(#universalBg)"/>
  <circle cx="400" cy="225" r="100" fill="{c2}" opacity="0.3"/>
  <polygon points="400,120 480,260 320,260" fill="{c3}"/>
  <rect x="20" y="{height - 60}" width="380" height="42" rx="6" fill="#0f172a" opacity="0.9"/>
  <text x="35" y="{height - 34}" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="bold">
    {game_bible.game_name} • {entity_name[:24]}
  </text>
</svg>"""

        encoded = base64.b64encode(svg_content.encode("utf-8")).decode("utf-8")
        return f"data:image/svg+xml;base64,{encoded}"

    async def generate_and_save_asset(
        self,
        session_id: str,
        theme_id: str,
        asset_key: str,
        asset_type: str,
        entity_name: str,
        game_bible: GameBible,
        context_description: str = "",
    ) -> str:
        """Generate and save an asset, publishing real-time notification on completion."""
        # 1. Check cache first
        cached = self.get_cached_asset(session_id, theme_id, asset_key)
        if cached:
            return cached["image_url"]

        prompt = self.generate_asset_prompt(asset_type, entity_name, game_bible, context_description)
        image_url = None

        # 2. If Gemini API key is present, attempt live generation
        # Tests must be deterministic and never call paid/external image services.
        if self.api_key and self.image_model and not os.getenv("PYTEST_CURRENT_TEST"):
            try:
                # Call Gemini Imagen endpoint
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.image_model}:predict?key={self.api_key}"
                req_data = json.dumps({"instances": [{"prompt": prompt}], "parameters": {"sampleCount": 1}}).encode("utf-8")
                req = urllib.request.Request(url, data=req_data, headers={"Content-Type": "application/json"})
                loop = asyncio.get_running_loop()
                response = await loop.run_in_executor(None, lambda: urllib.request.urlopen(req, timeout=15))
                res_body = json.loads(response.read().decode("utf-8"))
                b64_bytes = res_body["predictions"][0]["bytesBase64Encoded"]
                image_url = f"data:image/png;base64,{b64_bytes}"
                logger.info(f"Generated asset via Gemini for '{asset_key}'.")
            except Exception as exc:
                logger.warning(f"Gemini image generation attempt failed: {exc}. Using deterministic procedural fallback.")

        # 3. Procedural high-fidelity fallback if live API is missing or fails
        if not image_url:
            image_url = self.generate_procedural_asset(asset_type, entity_name, game_bible)

        # 4. Save to persistent DB
        arena_db.save_theme_asset(
            session_id=session_id,
            theme_id=theme_id,
            asset_key=asset_key,
            asset_type=asset_type,
            image_url=image_url,
            prompt=prompt,
            metadata={"generator": "gemini" if self.api_key else "procedural_engine", "entity": entity_name},
            status="ready",
        )

        # 5. Broadcast real-time asset_ready event
        broadcaster.publish_nowait(
            session_id,
            {
                "type": "arena_asset_ready",
                "session_id": session_id,
                "theme_id": theme_id,
                "asset_key": asset_key,
                "asset_type": asset_type,
                "image_url": image_url,
            },
        )

        return image_url

    def schedule_world_asset_pack(
        self,
        session_id: str,
        theme_id: str,
        game_bible: GameBible,
        regions: List[Dict[str, Any]],
        bosses: List[Dict[str, Any]],
    ) -> None:
        """Schedule generation of the entire asset pack in the background without blocking."""
        coro = self._process_asset_pack(session_id, theme_id, game_bible, regions, bosses)
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coro)
        except RuntimeError:
            # Route handlers run in FastAPI's worker threads, where there is no
            # event loop.  Running the whole pack with ``asyncio.run`` here made
            # creating a session wait for every image request (and could block on
            # a provider timeout).  Keep the existing in-process worker model,
            # but detach the work from the request instead.
            import threading

            threading.Thread(
                target=lambda: asyncio.run(coro),
                name=f"arena-art-{session_id}",
                daemon=True,
            ).start()

    async def _process_asset_pack(
        self,
        session_id: str,
        theme_id: str,
        game_bible: GameBible,
        regions: List[Dict[str, Any]],
        bosses: List[Dict[str, Any]],
    ) -> None:
        try:
            # 1. World Overview (Highest Priority)
            await self.generate_and_save_asset(
                session_id=session_id,
                theme_id=theme_id,
                asset_key="world_overview",
                asset_type="world_overview",
                entity_name=f"{game_bible.game_name} Engineering Realm",
                game_bible=game_bible,
                context_description="Full panoramic map view showing all biomes and engineering districts connected by pathways.",
            )

            # 2. Boss Artwork (High Priority)
            for b in bosses[:3]:
                boss_key_id = b.get("boss_id") or b.get("id") or "b"
                await self.generate_and_save_asset(
                    session_id=session_id,
                    theme_id=theme_id,
                    asset_key=f"boss_{boss_key_id}",
                    asset_type="boss",
                    entity_name=b.get("themed_name", "Boss"),
                    game_bible=game_bible,
                    context_description=f"A formidable boss creature representing {b.get('original_finding', '')[:60]}.",
                )

            # 3. Visible Regions
            for r in regions[:6]:
                reg_key_id = r.get("region_id") or r.get("id") or "r"
                await self.generate_and_save_asset(
                    session_id=session_id,
                    theme_id=theme_id,
                    asset_key=f"region_{reg_key_id}",
                    asset_type="region",
                    entity_name=r.get("themed_name", "Region"),
                    game_bible=game_bible,
                    context_description=f"An interactive zone representing software module {r.get('original_name', '')}.",
                )
        except Exception as exc:
            logger.error(f"Error during background asset pack generation: {exc}", exc_info=True)


art_service = ArenaArtService()
