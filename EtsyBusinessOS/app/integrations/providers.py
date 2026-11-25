"""Pick demo or live clients based on Settings > mode."""
from __future__ import annotations

from .. import db
from . import demo


def is_demo() -> bool:
    return db.settings()["mode"] == "demo"


def etsy():
    if is_demo():
        return demo.DemoEtsy()
    from .etsy import EtsyClient
    return EtsyClient()


def etsy_shop_id() -> str:
    if is_demo():
        return demo.DEMO_SHOP_ID
    from .etsy import shop_id
    return shop_id()


def pinterest():
    if is_demo():
        return demo.DemoPinterest()
    from .pinterest import PinterestClient
    return PinterestClient()


def youtube():
    if is_demo():
        return demo.DemoYouTube()
    from .youtube import YouTubeClient
    return YouTubeClient()


def source_tag() -> str:
    return "demo" if is_demo() else "live"


PLATFORMS = {
    "pinterest": {"label": "Pinterest", "official": "Pinterest API v5"},
    "youtube": {"label": "YouTube", "official": "YouTube Data API v3"},
    "instagram": {"label": "Instagram", "official": "Instagram Graph API (Meta App Review required)"},
    "facebook": {"label": "Facebook", "official": "Facebook Graph API (Meta App Review required)"},
}


def platform_available(platform: str) -> tuple[bool, str]:
    s = db.settings()["social"].get(platform, {})
    if s.get("status") == "unavailable":
        return False, s.get("reason", "unavailable")
    if is_demo():
        return True, "demo"
    from .base import connection
    st = connection(platform)["status"]
    return (st == "connected"), ("connected" if st == "connected" else f"not connected ({st})")
