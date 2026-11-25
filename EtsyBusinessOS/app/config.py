"""Paths and default settings. All runtime data lives in ./data (never inside asset folders)."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(os.environ.get("EBOS_ROOT", Path(__file__).resolve().parent.parent))
DATA = Path(os.environ.get("EBOS_DATA", ROOT / "data"))
LOGS = ROOT / "logs"
BRAIN_DEFAULT = DATA / "brain"
BACKUPS = DATA / "backups"
DB_PATH = DATA / "ebos.sqlite3"
VERSION = (ROOT / "VERSION").read_text(encoding="utf-8").strip() if (ROOT / "VERSION").exists() else "dev"
HOST = "127.0.0.1"
PORT = int(os.environ.get("EBOS_PORT", "8765"))
BASE_URL = f"http://{HOST}:{PORT}"

# Default, user-editable settings. Every change is stored as a new version in system_settings.
DEFAULT_SETTINGS: dict = {
    "mode": "demo",  # demo | live
    "shop": {"name": "My Etsy Shop", "currency": "USD", "timezone": "UTC"},
    "ai": {
        "ollama_url": "http://127.0.0.1:11434",
        "primary_model": "gemma4:12b",
        "fallback_model": "gemma4:4b",
        "active_model": "",  # chosen by benchmark; empty = primary
        "num_ctx": 8192,
        "temperature": 0.4,
        "idle_unload_seconds": 120,
        "request_timeout": 600,
        "json_retries": 2,
        "min_tokens_per_sec": 8.0,
    },
    "seo_rules": {
        "version": 1,
        "max_title_words": 15,
        "max_title_chars": 140,
        "focus_keyword_first": True,
        "no_repeated_words": True,
        "repeat_ignore": [],
        "required_suffix": "(PDF Download)",
        "banned_words": ["prefab"],
        "tag_count": 13,
        "max_tag_chars": 20,
        "max_tag_word_overlap": 0.6,
        "min_description_words": 80,
    },
    "listing_defaults": {
        "who_made": "i_did",
        "when_made": "made_to_order",
        "is_supply": False,
        "type": "download",
        "quantity": 999,
        "taxonomy_id": 0,
    },
    "assets": {"folders": [], "scan_minutes": 30, "marketing_ready_dirname": "marketing"},
    "brain": {"path": "", "max_chars": 6000},
    "schedules": {
        "etsy_sync_minutes": 60,
        "research_daily_hour": 6,
        "social_post_check_minutes": 15,
        "metrics_daily_hour": 7,
        "backup_daily_hour": 3,
    },
    "social": {
        "pinterest": {"posts_per_day": 3, "board_id": "", "post_hours": [9, 13, 19]},
        "youtube": {"posts_per_week": 2, "privacy": "public", "post_hours": [17], "category_id": "26"},
        "instagram": {"status": "unavailable", "reason": "Meta App Review not approved yet"},
        "facebook": {"status": "unavailable", "reason": "Meta App Review not approved yet"},
    },
    "etsy": {
        "scopes": "listings_r listings_w listings_d shops_r transactions_r",
        "rate_per_second": 5,
        "daily_quota": 5000,
    },
    "accounting": {"base_currency": "USD"},
}
