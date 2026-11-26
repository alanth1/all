"""Data for the living office view: agents, real events turned into NPC speech, real system metrics,
service issues, weather and NPC banter. Everything here is read-only except the banter cache."""
from __future__ import annotations

import logging
import random
import shutil
import subprocess
import threading
import time

import requests

from . import agents, config, db, jobs
from .ai import client as ai_client
from .integrations import base as ibase
from .util import loads, now

log = logging.getLogger("ebos.world")

# ---------------------------------------------------------------- events -> speech
TYPE_TALK = {
    "research_keyword": ("Lagi narik data listing dari Etsy API…", "Data keyword '{kw}' masuk: {count} listing aktif."),
    "research_interpret": ("Menganalisis pola keyword…", "Laporan riset siap! Cek Lab Riset."),
    "research_competitor": ("Ngecek listing kompetitor via API…", "Data kompetitor tersimpan."),
    "research_competitor_interpret": ("Membedah strategi kompetitor…", "Analisis kompetitor selesai."),
    "listing_generate": ("Menulis judul, deskripsi & 13 tag…", "Draft listing siap, tolong dicek QA."),
    "etsy_publish": ("Upload file & gambar ke Etsy…", "Listing LIVE di Etsy! ✅"),
    "etsy_sync": ("Sinkron toko, order & ledger…", "Sinkron Etsy beres: {listings} listing, {receipts} order."),
    "asset_scan": ("Memindai folder aset (read-only)…", "Scan aset selesai."),
    "social_copy": ("Nulis caption & hashtag…", "Caption baru siap dijadwalkan."),
    "social_publish_one": ("Posting ke platform…", "Post terbit & terverifikasi!"),
    "social_plan": ("Nyusun kalender konten…", "Kalender konten diperbarui."),
    "social_metrics": ("Ambil metrik postingan…", "Metrik sosial terkumpul."),
    "social_review": ("Evaluasi kampanye…", "Review kampanye siap."),
    "analytics_report": ("Membaca KPI 30 hari…", "Analisis KPI siap di Ruang Data."),
    "accounting_post_etsy": ("Posting jurnal dari ledger Etsy…", "Jurnal terposting, debit = kredit ✔"),
    "expense_classify": ("Mengklasifikasi pengeluaran…", "Saran akun untuk pengeluaran siap."),
    "reconcile": ("Rekonsiliasi payout vs bank…", "Rekonsiliasi selesai."),
    "backup": ("Backup database…", "Backup aman & terverifikasi."),
    "daily_brief": ("Menyusun brief harian…", "Brief harian sudah di papan."),
    "approval_reminder": ("Cek approval yang tertunda…", "Ada listing yang menunggu kamu."),
    "ai_benchmark": ("Benchmark model AI di GPU…", "Benchmark selesai."),
    "ai_pull": ("Mengunduh model AI…", "Model AI terunduh."),
}
HANDOFF = {  # who walks to whom after a job completes (visual delivery)
    "research_interpret": "JUNO-X9", "listing_generate": "VOLT-3", "etsy_publish": "KAI-07",
    "analytics_report": "KAI-07", "reconcile": "KAI-07", "social_review": "KAI-07",
}


def _talk(job) -> str:
    start, done = TYPE_TALK.get(job["type"], ("Mengerjakan {t}…", "Selesai: {t}"))
    res = loads(job["result"], {}) or {}
    pay = loads(job["payload"], {}) or {}
    vals = {"t": job["type"], "kw": pay.get("keyword", ""), "count": res.get("count", "?"),
            "listings": res.get("listings", "?"), "receipts": res.get("receipts", "?")}
    st = job["state"]
    try:
        if st in ("DONE", "PUBLISHED"):
            txt = done.format(**vals)
            return txt if "?" not in txt else done.split(":")[0].split("{")[0].strip().rstrip(":") + "."
        if st == "FAILED":
            return f"Gagal: {(job['error'] or '')[:90]}"
        if st == "WAITING_APPROVAL":
            return "Menunggu keputusan kamu."
        if st == "RETRYING":
            return "Ada gangguan, aku coba lagi sebentar lagi."
        return start.format(**vals)
    except (KeyError, IndexError):
        return start


def events(since_id: int) -> tuple[list[dict], int]:
    rows = db.q("SELECT e.id, e.state, e.created_at, j.id job_id, j.type, j.result, j.payload, j.error, j.state jstate "
                "FROM job_events e JOIN jobs j ON j.id=e.job_id WHERE e.id>? ORDER BY e.id LIMIT 200", (since_id,))
    out = []
    last = since_id
    for r in rows:
        last = r["id"]
        if r["state"] not in ("RUNNING", "DONE", "PUBLISHED", "FAILED", "WAITING_APPROVAL", "RETRYING"):
            continue
        if r["type"] in ("social_publish", "unload_ai_idle", "npc_banter") and r["state"] in ("DONE", "RUNNING"):
            continue
        fake = {"type": r["type"], "state": r["state"], "result": r["result"], "payload": r["payload"], "error": r["error"]}
        out.append({"id": r["id"], "agent": agents.agent_for(r["type"]), "kind": r["state"].lower(), "job": r["job_id"],
                    "type": r["type"], "text": _talk(fake), "handoff": HANDOFF.get(r["type"]) if r["state"] in ("DONE", "PUBLISHED") else None})
    return out[-40:], last


# ---------------------------------------------------------------- system metrics
_gpu_cache = {"t": 0, "v": None}


def gpu() -> dict | None:
    if time.time() - _gpu_cache["t"] < 5:
        return _gpu_cache["v"]
    v = None
    exe = shutil.which("nvidia-smi")
    if exe:
        try:
            out = subprocess.run([exe, "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
                                  "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=4,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout.strip().splitlines()
            if out:
                name, util, used, total, temp = [x.strip() for x in out[0].split(",")]
                v = {"name": name, "util": float(util), "vram_used_mb": float(used), "vram_total_mb": float(total), "temp": float(temp)}
        except Exception as e:  # noqa: BLE001
            log.debug("nvidia-smi failed: %s", e)
    _gpu_cache.update(t=time.time(), v=v)
    return v


def system() -> dict:
    out = {"cpu": None, "ram_used_gb": None, "ram_total_gb": None, "disk_free_gb": None, "gpu": gpu()}
    try:
        import psutil
        out["cpu"] = psutil.cpu_percent(interval=None)
        vm = psutil.virtual_memory()
        out["ram_used_gb"] = round((vm.total - vm.available) / 1e9, 1)
        out["ram_total_gb"] = round(vm.total / 1e9, 1)
    except Exception:  # noqa: BLE001
        pass
    try:
        du = shutil.disk_usage(str(config.DATA if config.DATA.exists() else config.ROOT))
        out["disk_free_gb"] = round(du.free / 1e9, 1)
    except OSError:
        pass
    return out


# ---------------------------------------------------------------- service issues
ROOM_OF_AGENT = {a["name"]: a["room_id"] for a in agents.AGENTS}


def issues(sysm: dict, ollama: dict) -> list[dict]:
    out = []
    s = db.settings()
    for r in db.q("SELECT type, COUNT(*) n, MAX(error) err FROM jobs WHERE state='FAILED' AND updated_at > strftime('%Y-%m-%dT%H:%M:%S','now','-1 day') GROUP BY type"):
        ag = agents.agent_for(r["type"])
        out.append({"room": ROOM_OF_AGENT.get(ag, "command"), "level": "error", "text": f"{r['n']}× gagal: {r['type']}",
                    "detail": (r["err"] or "")[:160], "agent": ag})
    if s["mode"] == "live":
        for p in ("etsy", "pinterest", "youtube"):
            c = ibase.connection(p)
            if c["status"] in ("error", "expired"):
                out.append({"room": "server", "level": "error", "text": f"Koneksi {p} {c['status']}", "detail": (c.get("last_error") or "")[:160]})
        if not ollama.get("ok"):
            out.append({"room": "server", "level": "error", "text": "Ollama mati - AI tidak bisa berpikir", "detail": ollama.get("error", "")[:160]})
    g = sysm.get("gpu")
    if g and g["temp"] >= 83:
        out.append({"room": "server", "level": "warn", "text": f"GPU panas {g['temp']:.0f}°C"})
    if sysm.get("ram_total_gb") and sysm["ram_used_gb"] / sysm["ram_total_gb"] > 0.92:
        out.append({"room": "server", "level": "warn", "text": "RAM hampir penuh"})
    if sysm.get("disk_free_gb") is not None and sysm["disk_free_gb"] < 5:
        out.append({"room": "archive", "level": "warn", "text": f"Disk tinggal {sysm['disk_free_gb']} GB"})
    pend = db.q1("SELECT COUNT(*) n FROM listings WHERE state='pending_approval'")["n"]
    if pend:
        out.append({"room": "shop", "level": "approval", "text": f"{pend} listing menunggu approval kamu"})
    stats_day = db.q1("SELECT MAX(day) d FROM traffic_metrics WHERE source='shop_stats_import'")["d"]
    if not stats_day or stats_day < time.strftime("%Y-%m-%d", time.gmtime(time.time() - 8 * 86400)):
        out.append({"room": "data", "level": "info", "text": "Shop Stats minggu ini belum diimpor"})
    return out


# ---------------------------------------------------------------- weather
_weather = {"t": 0, "v": None}
WMO = {0: "clear", 1: "clear", 2: "cloudy", 3: "cloudy", 45: "fog", 48: "fog", 51: "rain", 53: "rain", 55: "rain", 61: "rain",
       63: "rain", 65: "storm", 71: "snow", 73: "snow", 75: "snow", 80: "rain", 81: "rain", 82: "storm", 95: "storm", 96: "storm", 99: "storm"}


def weather() -> dict:
    w = db.settings().get("world", {})
    lat, lon = w.get("lat"), w.get("lon")
    if lat in (None, "") or lon in (None, ""):
        # simulated: changes every 2 hours, deterministic per day
        rnd = random.Random(time.strftime("%Y%m%d") + str(int(time.time() // 7200)))
        return {"kind": rnd.choice(["clear", "clear", "cloudy", "rain", "rain", "storm", "fog"]), "temp": None, "source": "simulated"}
    if time.time() - _weather["t"] < 1800 and _weather["v"]:
        return _weather["v"]
    try:
        r = requests.get("https://api.open-meteo.com/v1/forecast", params={"latitude": lat, "longitude": lon,
                         "current": "temperature_2m,weather_code,is_day"}, timeout=8)
        cur = r.json()["current"]
        v = {"kind": WMO.get(int(cur["weather_code"]), "cloudy"), "temp": cur["temperature_2m"], "source": "open-meteo",
             "city": w.get("city", "")}
    except Exception as e:  # noqa: BLE001
        v = {"kind": "cloudy", "temp": None, "source": f"error: {e}"[:80]}
    _weather.update(t=time.time(), v=v)
    return v


# ---------------------------------------------------------------- banter
BANTER = [
    ("Kopi pantry hari ini enak banget.", "Serius? Tadi aku dapat yang dingin."),
    ("Kamu lihat hujannya? Neon kota jadi cantik.", "Iya, mood kerja naik."),
    ("Main satu ronde di arcade?", "Boleh, kalah traktir kopi!"),
    ("Server lagi adem hari ini.", "Syukurlah, kemarin GPU sempat panas."),
    ("Judul listing tadi pas 15 kata loh.", "Validatornya ketat, aku suka."),
    ("Ada ide konten Pinterest minggu ini?", "Video tour kabin kelihatannya menarik."),
    ("Ledger seimbang lagi, lega.", "Debit sama dengan kredit, selalu."),
    ("Aku ngantuk… lembur scan aset.", "Rebahan di bean bag dulu sana."),
    ("Kenapa semua orang suka A-frame?", "Atapnya ikonik, gampang diingat."),
    ("Jangan pakai kata prefab ya!", "Haha, aturan nomor satu toko ini."),
]
_banter_cache: list[tuple[str, str]] = []
_banter_lock = threading.Lock()


def banter() -> tuple[str, str]:
    with _banter_lock:
        if _banter_cache:
            return _banter_cache.pop(0)
    return random.choice(BANTER)


def add_banter(pairs: list[tuple[str, str]]):
    with _banter_lock:
        _banter_cache.extend(pairs[:20])


def snapshot(since: int) -> dict:
    sysm = system()
    st = ai_client.ollama_status(timeout=1.5) if db.settings()["mode"] == "live" else {"ok": True, "models": [], "loaded": []}
    ev, last = events(since)
    return {"time": now(), "mode": db.settings()["mode"], "agents": agents.statuses(), "events": ev, "last_event": last,
            "system": sysm, "ai": {"ok": st.get("ok"), "loaded": st.get("loaded", []), "model": ai_client.active_model(),
                                   "busy": ai_client.AI_LOCK.locked()},
            "issues": issues(sysm, st), "weather": weather(), "jobs": jobs.stats(),
            "unread": db.q1("SELECT COUNT(*) n FROM notifications WHERE read=0")["n"]}
