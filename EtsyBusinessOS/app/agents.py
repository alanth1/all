"""The AI team. Agents are ROLES executed by the single local model, one at a time.
Each role owns job types; its status is derived from the persistent job table."""
from __future__ import annotations

from . import db

AGENTS = [
    {"name": "KAI-07", "role": "Chief of Operations", "room": "Command Deck", "room_id": "command", "color": "#22d3ee",
     "desc": "Plans the day, watches every queue, chases pending approvals, writes the daily brief, keeps the audit trail.",
     "types": ["daily_brief", "approval_reminder", "unload_ai_idle"]},
    {"name": "RAZE-11", "role": "Market Researcher", "room": "Research Lab", "room_id": "lab", "color": "#4ade80",
     "desc": "Keyword & competitor research through the official Etsy API only (no scraping).",
     "types": ["research_keyword", "research_interpret", "research_competitor", "research_competitor_interpret", "research_daily"]},
    {"name": "JUNO-X9", "role": "SEO Copywriter", "room": "Writers Studio", "room_id": "studio", "color": "#c084fc",
     "desc": "Writes titles, descriptions and 13 tags from real product facts.",
     "types": ["listing_generate"]},
    {"name": "VOLT-3", "role": "Quality Control", "room": "QA Bay", "room_id": "qa", "color": "#facc15",
     "desc": "Deterministic validators: SEO rules, files, images, pricing consistency.",
     "types": ["listing_validate"]},
    {"name": "NYX-21", "role": "Etsy Shop Manager", "room": "Shop Floor", "room_id": "shop", "color": "#f472b6",
     "desc": "Syncs shop, listings, orders and ledger; publishes listings you approved.",
     "types": ["etsy_sync", "etsy_publish", "etsy_sync_listings", "etsy_sync_receipts", "etsy_sync_ledger"]},
    {"name": "HEX-04", "role": "Social Media Manager", "room": "Growth Studio", "room_id": "growth", "color": "#fb7185",
     "desc": "Plans, writes and publishes Pinterest & YouTube posts from ready assets.",
     "types": ["social_plan", "social_copy", "social_publish", "social_publish_one", "social_metrics", "social_review"]},
    {"name": "SABLE-6", "role": "Asset Archivist", "room": "Archive", "room_id": "archive", "color": "#d6a76c",
     "desc": "Reads asset folders read-only, hashes files, extracts metadata, maps assets to products.",
     "types": ["asset_scan"]},
    {"name": "ORIN-88", "role": "Business Analyst", "room": "Data Room", "room_id": "data", "color": "#60a5fa",
     "desc": "Explains KPIs computed by Python, finds trends and anomalies.",
     "types": ["analytics_report", "listing_snapshot"]},
    {"name": "KADE-12", "role": "Finance & Bookkeeping", "room": "Finance Vault", "room_id": "finance", "color": "#fbbf24",
     "desc": "Double-entry ledger, reconciliation, financial reports. Never moves money.",
     "types": ["accounting_post_etsy", "expense_classify", "reconcile"]},
    {"name": "ZERO-1", "role": "Systems Engineer", "room": "Server Room", "room_id": "server", "color": "#fb923c",
     "desc": "Keeps the machine alive: settings, connections, AI model, backups, CPU/GPU/RAM/VRAM, repairs.",
     "types": ["backup", "ai_benchmark", "ai_pull", "npc_banter"]},
]

_BY_TYPE = {t: a["name"] for a in AGENTS for t in a["types"]}


def agent_for(job_type: str) -> str:
    return _BY_TYPE.get(job_type, "KAI-07")


def statuses() -> list[dict]:
    out = []
    for a in AGENTS:
        types = a["types"]
        ph = ",".join("?" * len(types))
        running = db.q1(f"SELECT id, type FROM jobs WHERE type IN ({ph}) AND state IN ('RUNNING','VALIDATING') ORDER BY id DESC LIMIT 1", types)
        waiting = db.q1(f"SELECT COUNT(*) n FROM jobs WHERE type IN ({ph}) AND state='WAITING_APPROVAL'", types)["n"]
        queued = db.q1(f"SELECT COUNT(*) n FROM jobs WHERE type IN ({ph}) AND state IN ('QUEUED','RETRYING','APPROVED')", types)["n"]
        failed = db.q1(f"SELECT COUNT(*) n FROM jobs WHERE type IN ({ph}) AND state='FAILED' AND updated_at > strftime('%Y-%m-%dT%H:%M:%S','now','-1 day')", types)["n"]
        last = db.q1(f"SELECT type, state, updated_at FROM jobs WHERE type IN ({ph}) ORDER BY updated_at DESC LIMIT 1", types)
        if running:
            status = "working"
        elif failed:
            status = "error"
        elif waiting:
            status = "waiting"
        elif queued:
            status = "queued"
        else:
            status = "idle"
        out.append({**{k: a[k] for k in ("name", "role", "room", "room_id", "color", "desc")}, "status": status,
                    "current": running["type"] if running else None, "queued": queued, "waiting": waiting, "failed": failed,
                    "last": dict(last) if last else None})
    return out
