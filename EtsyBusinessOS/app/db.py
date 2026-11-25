"""SQLite (WAL) access, migrations and versioned settings."""
from __future__ import annotations

import copy
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

from . import config
from .util import dumps, loads, now

_local = threading.local()
_settings_lock = threading.Lock()
SCHEMA_VERSION = 1


def _connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=30, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def conn() -> sqlite3.Connection:
    """One connection per thread."""
    c = getattr(_local, "conn", None)
    if c is None or getattr(_local, "path", None) != str(config.DB_PATH):
        c = _connect(config.DB_PATH)
        _local.conn = c
        _local.path = str(config.DB_PATH)
    return c


def reset_thread_connection():
    c = getattr(_local, "conn", None)
    if c is not None:
        c.close()
    _local.conn = None


@contextmanager
def tx():
    """Explicit transaction (BEGIN IMMEDIATE) - all or nothing."""
    c = conn()
    if c.in_transaction:
        yield c
        return
    c.execute("BEGIN IMMEDIATE")
    try:
        yield c
        c.execute("COMMIT")
    except BaseException:
        c.execute("ROLLBACK")
        raise


def q(sql: str, params=()) -> list[sqlite3.Row]:
    return conn().execute(sql, params).fetchall()


def q1(sql: str, params=()):
    return conn().execute(sql, params).fetchone()


def ex(sql: str, params=()) -> int:
    cur = conn().execute(sql, params)
    return cur.lastrowid


def migrate():
    schema = (Path(__file__).parent / "schema.sql").read_text(encoding="utf-8")
    c = conn()
    c.executescript(schema)
    if not q1("SELECT 1 FROM schema_migrations WHERE version=?", (SCHEMA_VERSION,)):
        ex("INSERT INTO schema_migrations(version, applied_at) VALUES(?,?)", (SCHEMA_VERSION, now()))
    if not q1("SELECT 1 FROM users"):
        ex("INSERT INTO users(name, role, created_at) VALUES('owner','owner',?)", (now(),))
    if not q1("SELECT 1 FROM system_settings"):
        ex("INSERT INTO system_settings(version, data, changed_by, created_at) VALUES(1,?,?,?)",
           (dumps(config.DEFAULT_SETTINGS), "system", now()))


def _deep_merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def settings() -> dict:
    row = q1("SELECT data FROM system_settings ORDER BY version DESC LIMIT 1")
    stored = loads(row["data"], {}) if row else {}
    return _deep_merge(config.DEFAULT_SETTINGS, stored)


def settings_version() -> int:
    row = q1("SELECT MAX(version) v FROM system_settings")
    return int(row["v"] or 0)


def update_settings(patch: dict, changed_by: str) -> dict:
    """Store a new settings version (never overwrites history)."""
    from .audit import audit
    with _settings_lock:
        merged = _deep_merge(settings(), patch)
        if "seo_rules" in patch:
            merged["seo_rules"]["version"] = int(settings()["seo_rules"].get("version", 1)) + 1
        v = settings_version() + 1
        ex("INSERT INTO system_settings(version, data, changed_by, created_at) VALUES(?,?,?,?)",
           (v, dumps(merged), changed_by, now()))
    audit(changed_by, "settings.update", "system_settings", str(v), {"keys": sorted(patch.keys())})
    return merged


def backup(dest_dir: Path | None = None, keep: int = 14) -> Path:
    dest_dir = dest_dir or config.BACKUPS
    dest_dir.mkdir(parents=True, exist_ok=True)
    stamp = now().replace(":", "").replace("-", "")[:15]
    dest = dest_dir / f"ebos-{stamp}.sqlite3"
    target = sqlite3.connect(str(dest))
    with target:
        conn().backup(target)
    target.close()
    files = sorted(dest_dir.glob("ebos-*.sqlite3"))
    for old in files[:-keep]:
        old.unlink(missing_ok=True)
    return dest


def verify_backup(path: Path) -> bool:
    c = sqlite3.connect(str(path))
    try:
        ok = c.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        c.execute("SELECT COUNT(*) FROM jobs").fetchone()
        return ok
    finally:
        c.close()
