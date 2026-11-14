"""
backend/config.py
Loads .env via python-dotenv and exposes a Settings singleton used across the app.
Never prints or logs secrets.
"""

from __future__ import annotations

from functools import lru_cache

from typing import Optional
from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings  # pydantic v2 ships pydantic-settings separately

# Load .env from the project root (two levels up from this file)
load_dotenv()


class Settings(BaseSettings):
    """All configuration loaded from environment variables."""

    # --- Hindsight ---
    hindsight_api_key: str = Field(..., alias="HINDSIGHT_API_KEY")
    hindsight_base_url: str = Field(
        default="https://api.hindsight.vectorize.io",
        alias="HINDSIGHT_BASE_URL",
    )

    # --- Groq ---
    groq_api_key: str = Field(..., alias="GROQ_API_KEY")
    groq_primary_model: str = Field(
        default="openai/gpt-oss-120b",
        alias="GROQ_PRIMARY_MODEL",
    )
    groq_fallback_model: str = Field(
        default="qwen/qwen3.8-27b",  # confirmed available on Groq
        alias="GROQ_FALLBACK_MODEL",
    )

    # --- Gemini (Arena Image Generation) ---
    gemini_api_key: Optional[str] = Field(
        default=None,
        alias="GEMINI_API_KEY",
    )
    gemini_image_model: str = Field(
        default="",
        alias="GEMINI_IMAGE_MODEL",
    )
    gemini_text_model: Optional[str] = Field(default=None, alias="GEMINI_TEXT_MODEL")

    model_config = {"populate_by_name": True}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance (reads .env once)."""
    return Settings()
