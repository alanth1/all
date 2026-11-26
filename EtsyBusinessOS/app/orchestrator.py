"""Automation & Workflow Orchestration (PRD module 08): APScheduler only *enqueues* jobs into the
persistent table (with per-period idempotency keys), workers execute them."""
from __future__ import annotations

import logging
import threading
from datetime import date, datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from . import brain, db, jobs
from .ai import client as ai_client
from .audit import audit, notify
from .engines import accounting, research
from .jobs import enqueue, handler
from .util import now

# register all job handlers
from .engines import analytics, assets, etsy_sync, listings, social  # noqa: F401

log = logging.getLogger("ebos.orchestrator")
_stop = threading.Event()
_workers: list[jobs.Worker] = []
_sched: BackgroundScheduler | None = None


def _hour_key(prefix: str) -> str:
    return f"{prefix}:{datetime.now(timezone.utc).strftime('%Y%m%d%H')}"


def _minute_bucket(prefix: str, minutes: int) -> str:
    t = datetime.now(timezone.utc)
    return f"{prefix}:{t.strftime('%Y%m%d')}:{(t.hour * 60 + t.minute) // max(minutes, 1)}"


def tick_frequent():
    """Every minute: enqueue whatever is due (idempotent)."""
    s = db.settings()
    sch = s["schedules"]
    try:
        from .shops import active_slots
        for slot in active_slots():
            key = _minute_bucket("etsy_sync", sch["etsy_sync_minutes"]) + ("" if slot == 1 else f":s{slot}")
            enqueue("etsy_sync", {} if slot == 1 else {"slot": slot}, idempotency_key=key, priority=4)
        if s["assets"].get("folders"):
            enqueue("asset_scan", {}, idempotency_key=_minute_bucket("asset_scan", s["assets"]["scan_minutes"]), priority=6)
        enqueue("social_plan", {}, idempotency_key=_minute_bucket("social_plan", 60), priority=6)
        enqueue("social_publish", {}, idempotency_key=_minute_bucket("social_publish", sch["social_post_check_minutes"]), priority=3)
        hour = datetime.now(timezone.utc).hour
        today = date.today().isoformat()
        if hour >= sch["research_daily_hour"]:
            enqueue("research_daily", {}, idempotency_key=f"research_daily:{today}")
        if hour >= sch["metrics_daily_hour"]:
            enqueue("social_metrics", {}, idempotency_key=f"social_metrics:{today}")
            enqueue("approval_reminder", {}, idempotency_key=f"approval_reminder:{today}")
            enqueue("daily_brief", {}, idempotency_key=f"daily_brief:{today}")
            enqueue("reconcile", {}, idempotency_key=f"reconcile:{today}")
        if hour >= sch["backup_daily_hour"]:
            enqueue("backup", {}, idempotency_key=f"backup:{today}")
        if date.today().weekday() == 0 and hour >= sch["metrics_daily_hour"]:
            enqueue("analytics_report", {}, idempotency_key=f"analytics_weekly:{today}")
            enqueue("social_review", {}, idempotency_key=f"social_review:{today}")
    except Exception:
        log.exception("scheduler tick failed")
    try:
        _maybe_banter()
    except Exception:  # noqa: BLE001
        log.exception("banter scheduling failed")
    try:
        ai_client.unload_if_idle()
    except Exception:  # noqa: BLE001
        pass


@handler("backup", lane="io", agent="KAI-07", max_attempts=3)
def job_backup(payload, job):
    p = db.backup()
    ok = db.verify_backup(p)
    if not ok:
        notify("error", "Backup verification failed", str(p))
        raise RuntimeError("backup integrity check failed")
    audit("system", "db.backup", "file", p.name, {"verified": ok})
    return {"file": str(p), "verified": ok}


@handler("daily_brief", lane="io", agent="KAI-07", max_attempts=2)
def job_brief(payload, job):
    pending = db.q1("SELECT COUNT(*) n FROM listings WHERE state='pending_approval'")["n"]
    failed = db.q1("SELECT COUNT(*) n FROM jobs WHERE state='FAILED' AND updated_at > strftime('%Y-%m-%dT%H:%M:%S','now','-1 day')")["n"]
    stats_age = db.q1("SELECT MAX(day) d FROM traffic_metrics WHERE source='shop_stats_import'")["d"]
    lines = [f"{pending} listing(s) waiting for approval", f"{failed} failed job(s) in the last 24h"]
    if not stats_age or stats_age < date.fromordinal(date.today().toordinal() - 7).isoformat():
        lines.append("Shop Stats not imported this week - import to get conversion rate")
    notify("info", "Daily brief from KAI-07", " · ".join(lines), "/")
    return {"lines": lines}


def init():
    db.migrate()
    brain.ensure_seed()
    research.seed_sources()
    accounting.seed_coa()
    for p in ("instagram", "facebook"):
        if not db.q1("SELECT 1 FROM social_accounts WHERE platform=?", (p,)):
            db.ex("INSERT INTO social_accounts(platform, status, reason, updated_at) VALUES(?,?,?,?)",
                  (p, "unavailable", "Meta App Review not approved yet", now()))
    n = jobs.recover()
    if n:
        notify("info", "Recovered unfinished work", f"{n} job(s) resumed after restart", "/automation")


def start():
    global _sched
    init()
    _stop.clear()
    for lane in ("ai", "io"):
        w = jobs.Worker(lane, _stop)
        w.start()
        _workers.append(w)
    _sched = BackgroundScheduler(timezone="UTC")
    _sched.add_job(tick_frequent, "interval", seconds=60, id="tick", next_run_time=datetime.now(timezone.utc), max_instances=1,
                   coalesce=True)
    _sched.start()
    audit("system", "app.start", "app", None, {"version": __import__("app.config", fromlist=["VERSION"]).VERSION})


def stop():
    _stop.set()
    if _sched:
        _sched.shutdown(wait=False)
    try:
        ai_client.unload()
    except Exception:  # noqa: BLE001
        pass


@handler("ai_benchmark", lane="ai", agent="KAI-07", max_attempts=1)
def job_benchmark(payload, job):
    from .ai import benchmark
    res = benchmark.run_and_select()
    if res["chosen"]:
        notify("success", "AI benchmark finished", f"Active model: {res['chosen']}", "/settings#ai")
    else:
        notify("error", "AI benchmark: no model passed", "See Settings > AI for details", "/settings#ai")
    return res


@handler("ai_pull", lane="io", agent="KAI-07", max_attempts=2)
def job_pull(payload, job):
    return ai_client.pull(payload["model"])


@handler("npc_banter", lane="ai", agent="ZERO-1", max_attempts=1)
def job_banter(payload, job):
    """Fresh small talk for the HQ view, written only when the AI lane is otherwise idle."""
    from pydantic import BaseModel, Field

    from . import world
    from .ai.runner import run_task

    class Pair(BaseModel):
        a: str = Field(max_length=90)
        b: str = Field(max_length=90)

    class Banter(BaseModel):
        pairs: list[Pair] = Field(min_length=3, max_length=10)

    ctx = {"weather": world.weather().get("kind"), "time": datetime.now().strftime("%H:%M"),
           "recent_work": [r["type"] for r in db.q("SELECT type FROM jobs WHERE state IN ('DONE','PUBLISHED') ORDER BY id DESC LIMIT 8")]}
    res, meta = run_task("npc_banter", "Office small-talk writer",
                         "Write short, friendly Indonesian small-talk exchanges between two coworkers in a cyberpunk office that runs an "
                         "Etsy shop selling digital house plans. Each line max 12 words. No numbers about sales.",
                         ctx, Banter, demo=lambda: {"pairs": [{"a": a, "b": b} for a, b in world.BANTER[:5]]}, job_id=job["id"], use_brain=False)
    world.add_banter([(p.a, p.b) for p in res.pairs])
    return {"pairs": len(res.pairs), "model": meta["model"]}


def _maybe_banter():
    s = db.settings()
    if s["mode"] != "live" or not s.get("world", {}).get("ai_banter", True):
        return
    busy = db.q1("SELECT COUNT(*) n FROM jobs WHERE lane='ai' AND state IN ('QUEUED','RUNNING','RETRYING','APPROVED')")["n"]
    if busy == 0:
        enqueue("npc_banter", {}, idempotency_key=_minute_bucket("npc_banter", 120), priority=9)
