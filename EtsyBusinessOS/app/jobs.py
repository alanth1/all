"""Persistent job queue (SQLite table `jobs`) with two worker lanes:
- 'ai' lane: exactly one worker -> AI tasks run strictly one at a time (serial GPU use)
- 'io' lane: API sync, publishing, scanning, reports
Job state survives restarts; RUNNING jobs found at startup are moved to RETRYING."""
from __future__ import annotations

import logging
import threading
import time
import traceback
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable

from . import db
from .audit import audit, notify
from .util import dumps, loads, now

log = logging.getLogger("ebos.jobs")

STATES = ("QUEUED", "RUNNING", "VALIDATING", "WAITING_APPROVAL", "APPROVED", "PUBLISHED",
          "DONE", "FAILED", "RETRYING", "CANCELLED")
TERMINAL = ("DONE", "PUBLISHED", "FAILED", "CANCELLED")


class RetryLater(Exception):
    def __init__(self, msg: str, seconds: int | None = None):
        super().__init__(msg)
        self.seconds = seconds


class Fatal(Exception):
    """Do not retry (validation failure, feature unavailable, permission denied)."""


class WaitApproval(Exception):
    """Handler finished its part; job now waits for a human decision."""


@dataclass
class Handler:
    fn: Callable
    lane: str
    agent: str
    max_attempts: int


HANDLERS: dict[str, Handler] = {}


def handler(job_type: str, lane: str = "io", agent: str = "Boss", max_attempts: int = 5):
    def deco(fn):
        HANDLERS[job_type] = Handler(fn, lane, agent, max_attempts)
        return fn
    return deco


def _iso_in(seconds: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).replace(microsecond=0).isoformat()


def event(job_id: int, state: str, message: str = ""):
    db.ex("INSERT INTO job_events(job_id, state, message, created_at) VALUES(?,?,?,?)", (job_id, state, message[:2000], now()))


def enqueue(job_type: str, payload: dict | None = None, *, priority: int = 5, idempotency_key: str | None = None,
            delay_seconds: float = 0, parent_id: int | None = None, actor: str = "system") -> int:
    """Create a job. Same idempotency_key => returns the existing job (duplicate prevention)."""
    h = HANDLERS.get(job_type)
    if h is None:
        raise ValueError(f"unknown job type {job_type}")
    if idempotency_key:
        row = db.q1("SELECT id FROM jobs WHERE idempotency_key=?", (idempotency_key,))
        if row:
            return row["id"]
    ts = now()
    try:
        jid = db.ex(
            "INSERT INTO jobs(type, lane, state, priority, payload, max_attempts, idempotency_key, agent, parent_id, run_after, created_at, updated_at) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (job_type, h.lane, "QUEUED", priority, dumps(payload or {}), h.max_attempts, idempotency_key, h.agent,
             parent_id, _iso_in(delay_seconds), ts, ts))
    except Exception:
        if idempotency_key:
            row = db.q1("SELECT id FROM jobs WHERE idempotency_key=?", (idempotency_key,))
            if row:
                return row["id"]
        raise
    event(jid, "QUEUED", f"by {actor}")
    return jid


def set_state(job_id: int, state: str, message: str = "", **fields):
    assert state in STATES
    cols = ["state=?", "updated_at=?"]
    vals: list = [state, now()]
    for k, v in fields.items():
        cols.append(f"{k}=?")
        vals.append(v)
    vals.append(job_id)
    db.ex(f"UPDATE jobs SET {', '.join(cols)} WHERE id=?", vals)
    event(job_id, state, message)


def get(job_id: int):
    return db.q1("SELECT * FROM jobs WHERE id=?", (job_id,))


def cancel(job_id: int, actor: str):
    j = get(job_id)
    if j and j["state"] not in TERMINAL:
        set_state(job_id, "CANCELLED", f"cancelled by {actor}", finished_at=now())
        audit(actor, "job.cancel", "job", job_id)


def retry_now(job_id: int, actor: str):
    j = get(job_id)
    if j and j["state"] in ("FAILED", "RETRYING", "CANCELLED"):
        set_state(job_id, "QUEUED", f"manual retry by {actor}", run_after=now(), attempts=0, error=None)
        audit(actor, "job.retry", "job", job_id)


def recover() -> int:
    """Called at startup: unfinished RUNNING/VALIDATING jobs are resumed safely."""
    rows = db.q("SELECT id FROM jobs WHERE state IN ('RUNNING','VALIDATING')")
    for r in rows:
        set_state(r["id"], "RETRYING", "recovered after application restart", run_after=now())
    if rows:
        audit("system", "jobs.recover", "jobs", None, {"count": len(rows)})
    return len(rows)


def _claim(lane: str):
    with db.tx() as c:
        row = c.execute(
            "SELECT * FROM jobs WHERE lane=? AND state IN ('QUEUED','RETRYING','APPROVED') AND run_after<=? "
            "ORDER BY priority ASC, run_after ASC, id ASC LIMIT 1", (lane, now())).fetchone()
        if not row:
            return None
        c.execute("UPDATE jobs SET state='RUNNING', attempts=attempts+1, started_at=?, updated_at=? WHERE id=?",
                  (now(), now(), row["id"]))
    event(row["id"], "RUNNING", f"attempt {row['attempts'] + 1}")
    return get(row["id"])


def run_one(lane: str) -> bool:
    job = _claim(lane)
    if job is None:
        return False
    h = HANDLERS.get(job["type"])
    jid = job["id"]
    try:
        if h is None:
            raise Fatal(f"no handler for {job['type']}")
        result = h.fn(loads(job["payload"], {}), job)
        final = "DONE"
        if isinstance(result, dict) and result.get("_state") in ("PUBLISHED",):
            final = result.pop("_state")
        set_state(jid, final, "completed", result=dumps(result), finished_at=now(), error=None)
    except WaitApproval as e:
        set_state(jid, "WAITING_APPROVAL", str(e) or "waiting for human approval")
    except Fatal as e:
        set_state(jid, "FAILED", str(e), error=str(e), finished_at=now())
        notify("error", f"Job failed: {job['type']}", str(e), f"/automation#job-{jid}")
        audit("system", "job.failed", "job", jid, {"type": job["type"], "error": str(e)}, outcome="failed")
    except Exception as e:  # noqa: BLE001 - every error is recorded, never swallowed silently
        attempts = job["attempts"]
        msg = f"{type(e).__name__}: {e}"
        if attempts >= job["max_attempts"]:
            set_state(jid, "FAILED", msg, error=msg + "\n" + traceback.format_exc()[-1500:], finished_at=now())
            notify("error", f"Job failed after {attempts} attempts: {job['type']}", msg, f"/automation#job-{jid}")
            audit("system", "job.failed", "job", jid, {"type": job["type"], "error": msg}, outcome="failed")
        else:
            delay = e.seconds if isinstance(e, RetryLater) and e.seconds else min(3600, 30 * (2 ** (attempts - 1)))
            set_state(jid, "RETRYING", f"{msg} -> retry in {delay}s", error=msg, run_after=_iso_in(delay))
        log.warning("job %s %s error: %s", jid, job["type"], msg)
    return True


def drain(lanes=("io", "ai"), max_jobs: int = 500):
    """Run due jobs synchronously (tests / 'run now')."""
    n = 0
    progressed = True
    while progressed and n < max_jobs:
        progressed = False
        for lane in lanes:
            if run_one(lane):
                n += 1
                progressed = True
    return n


class Worker(threading.Thread):
    def __init__(self, lane: str, stop: threading.Event):
        super().__init__(name=f"worker-{lane}", daemon=True)
        self.lane = lane
        self.stop = stop

    def run(self):
        while not self.stop.is_set():
            try:
                if not run_one(self.lane):
                    self.stop.wait(2.0)
            except Exception:  # database locked etc. - keep worker alive
                log.exception("worker %s loop error", self.lane)
                time.sleep(5)
        db.reset_thread_connection()


def stats() -> dict:
    rows = db.q("SELECT state, COUNT(*) n FROM jobs GROUP BY state")
    return {r["state"]: r["n"] for r in rows}
