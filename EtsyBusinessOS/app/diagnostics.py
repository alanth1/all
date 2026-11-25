"""Diagnostic report for support: versions, connection states, failed jobs, recent errors. Never includes secrets."""
from __future__ import annotations

import platform
import sys

from . import config, db
from .ai import client as ai_client
from .util import now


def report() -> str:
    s = db.settings()
    lines = [f"Etsy Business OS diagnostic report  {now()}", f"version: {config.VERSION}", f"python: {sys.version.split()[0]}",
             f"os: {platform.platform()}", f"mode: {s['mode']}", ""]
    st = ai_client.ollama_status()
    lines += ["[AI]", f"ollama ok: {st['ok']} {st.get('error', '')}", f"installed models: {', '.join(st['models'])}",
              f"loaded: {st['loaded']}", f"primary: {s['ai']['primary_model']} fallback: {s['ai']['fallback_model']} active: {s['ai']['active_model']}"]
    b = db.q1("SELECT model, passed, result, created_at FROM benchmarks ORDER BY id DESC LIMIT 1")
    if b:
        lines.append(f"last benchmark: {b['model']} passed={b['passed']} at {b['created_at']}\n  {b['result'][:800]}")
    lines += ["", "[Connections]"]
    for r in db.q("SELECT platform, status, account_name, last_ok_at, last_error FROM api_connections"):
        lines.append(f"{r['platform']}: {r['status']} {r['account_name'] or ''} last_ok={r['last_ok_at']} err={(r['last_error'] or '')[:200]}")
    lines += ["", "[Jobs]", str({r['state']: r['n'] for r in db.q('SELECT state, COUNT(*) n FROM jobs GROUP BY state')})]
    for j in db.q("SELECT id, type, attempts, error, updated_at FROM jobs WHERE state='FAILED' ORDER BY id DESC LIMIT 15"):
        lines.append(f"FAILED #{j['id']} {j['type']} x{j['attempts']} {j['updated_at']}: {(j['error'] or '')[:300]}")
    lines += ["", "[AI runs - last 10]"]
    for r in db.q("SELECT task, model, ok, attempts, duration_ms, tokens_per_sec, error FROM ai_runs ORDER BY id DESC LIMIT 10"):
        lines.append(f"{r['task']} {r['model']} ok={r['ok']} tries={r['attempts']} {r['duration_ms']}ms tps={r['tokens_per_sec']} {(r['error'] or '')[:150]}")
    lines += ["", "[Counts]"]
    for t in ("listings", "receipts", "etsy_ledger_entries", "journal_entries", "social_assets", "published_posts", "market_reports"):
        lines.append(f"{t}: {db.q1(f'SELECT COUNT(*) n FROM {t}')['n']}")
    log = config.LOGS / "app.log"
    if log.exists():
        tail = log.read_text(encoding="utf-8", errors="replace").splitlines()[-60:]
        lines += ["", "[app.log tail - errors/warnings]"] + [l for l in tail if " ERROR " in l or " WARNING " in l][-30:]
    text = "\n".join(lines)
    config.LOGS.mkdir(parents=True, exist_ok=True)
    (config.LOGS / "report.txt").write_text(text, encoding="utf-8")
    return text
