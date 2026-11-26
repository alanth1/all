"""Multi-shop: up to 3 Etsy shops, each on its own Etsy account (own OAuth token), managed from one app.
Operations (listings, approvals, publishing, sync) are kept per shop; accounting is combined (one owner)."""
from __future__ import annotations

from . import db

SLOTS = (1, 2, 3)
COLORS = {1: "#3ff0ff", 2: "#ff3fa4", 3: "#ffb13f"}


def norm(slot) -> int:
    try:
        s = int(slot or 1)
    except (TypeError, ValueError):
        raise ValueError("invalid shop")
    if s not in SLOTS:
        raise ValueError("invalid shop")
    return s


def platform(slot) -> str:
    """api_connections key. Shop 1 keeps the historic 'etsy' key so existing connections keep working."""
    s = norm(slot)
    return "etsy" if s == 1 else f"etsy{s}"


def token_key(slot) -> str:
    s = norm(slot)
    return "etsy_token" if s == 1 else f"etsy_token_{s}"


def app_key_name(slot) -> str:
    s = norm(slot)
    return "etsy_app" if s == 1 else f"etsy_app_{s}"


def info(slot) -> dict:
    s = norm(slot)
    cfg = (db.settings().get("shops") or {}).get(str(s), {}) or {}
    return {"slot": s, "name": (cfg.get("name") or f"Toko {s}").strip(), "enabled": bool(cfg.get("enabled", True)),
            "publish_target": cfg.get("publish_target") or None, "color": COLORS[s]}


def publish_target(slot) -> str:
    t = info(slot)["publish_target"]
    if t in ("draft", "active"):
        return t
    return db.settings()["listing_defaults"].get("publish_target", "draft")


def active_slots() -> list[int]:
    """Shops that should be synced: enabled, and in live mode also connected."""
    from .integrations import base, providers
    out = []
    for s in SLOTS:
        if not info(s)["enabled"]:
            continue
        if providers.is_demo() or base.connection(platform(s)).get("status") in ("connected", "expired", "error"):
            if providers.is_demo() or base.connection(platform(s)).get("account_id"):
                out.append(s)
    return out


def all_info() -> list[dict]:
    from .integrations import base
    out = []
    for s in SLOTS:
        i = info(s)
        c = base.connection(platform(s))
        i.update({"status": c.get("status", "not_connected"), "account": c.get("account_name"), "shop_id": c.get("account_id"),
                  "last_error": c.get("last_error"), "effective_target": publish_target(s)})
        out.append(i)
    return out
