"""The AI team. Agents are ROLES executed by the single local model, one at a time.
Each role owns job types; its status is derived from the persistent job table."""
from __future__ import annotations

from . import db

AGENTS = [
    {"name": "Boss", "role": "Chief of Staff", "room": "Command Deck", "color": "#f59e0b", "x": 3, "y": 0,
     "desc": "Plans the day, watches queues, chases pending approvals, writes the daily brief.",
     "types": ["daily_brief", "approval_reminder", "backup", "unload_ai_idle"]},
    {"name": "Scout", "role": "Market Researcher", "room": "Research Lab", "color": "#22c55e", "x": 0, "y": 0,
     "desc": "Keyword & competitor research through the Etsy API only (no scraping).",
     "types": ["research_keyword", "research_competitor", "research_daily"]},
    {"name": "Quill", "role": "SEO Writer", "room": "Writers Room", "color": "#a855f7", "x": 6, "y": 0,
     "desc": "Writes titles, descriptions and 13 tags from real product facts.",
     "types": ["listing_generate"]},
    {"name": "Sherlock", "role": "Quality Control", "room": "QA Desk", "color": "#06b6d4", "x": 0, "y": 3,
     "desc": "Deterministic validators: SEO rules, files, images, pricing consistency.",
     "types": ["listing_validate"]},
    {"name": "Etta", "role": "Etsy Shop Manager", "room": "Front Office", "color": "#f97316", "x": 3, "y": 3,
     "desc": "Syncs shop, listings, orders, payments, ledger; publishes approved listings.",
     "types": ["etsy_sync", "etsy_publish", "etsy_sync_listings", "etsy_sync_receipts", "etsy_sync_ledger"]},
    {"name": "Pixie", "role": "Social Media Manager", "room": "Growth Studio", "color": "#ec4899", "x": 6, "y": 3,
     "desc": "Plans, writes and publishes Pinterest & YouTube posts from ready assets.",
     "types": ["social_plan", "social_copy", "social_publish", "social_metrics"]},
    {"name": "Libby", "role": "Asset Librarian", "room": "Archive", "color": "#84cc16", "x": 0, "y": 6,
     "desc": "Reads asset folders (read-only), hashes, extracts metadata, maps assets to products.",
     "types": ["asset_scan"]},
    {"name": "Nova", "role": "Business Analyst", "room": "Data Room", "color": "#3b82f6", "x": 3, "y": 6,
     "desc": "Explains KPIs computed by Python, finds trends and anomalies.",
     "types": ["analytics_report", "listing_snapshot"]},
    {"name": "Judith", "role": "Finance & Bookkeeping", "room": "Finance Office", "color": "#eab308", "x": 6, "y": 6,
     "desc": "Double-entry ledger, reconciliation, financial reports. Never moves money.",
     "types": ["accounting_post_etsy", "expense_classify", "reconcile"]},
]

_BY_TYPE = {t: a["name"] for a in AGENTS for t in a["types"]}


def agent_for(job_type: str) -> str:
    return _BY_TYPE.get(job_type, "Boss")


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
        out.append({**{k: a[k] for k in ("name", "role", "room", "color", "x", "y", "desc")}, "status": status,
                    "current": running["type"] if running else None, "queued": queued, "waiting": waiting, "failed": failed,
                    "last": dict(last) if last else None})
    return out
