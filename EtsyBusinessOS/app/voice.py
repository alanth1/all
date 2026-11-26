"""Local NPC voices with Kokoro (English, offline, CPU via onnxruntime).
NPCs speak ENGLISH while every on-screen text stays Indonesian (owner's choice).
The model (~90 MB int8 + 28 MB voices) is downloaded once into data/voices; lines are cached as WAV.
Callers should pass an English line (`en`). If only Indonesian text is given, it is translated with the local
Gemma model when Ollama is available, otherwise a short English summary is picked from known phrases."""
from __future__ import annotations

import hashlib
import io
import json
import re
import threading
import urllib.request
import wave
from pathlib import Path

from . import config

ENGINE = "kokoro-v1.0"
MODEL = "kokoro-v1.0.int8.onnx"
VOICES = "voices-v1.0.bin"
URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
# one distinct natural voice per NPC (+ speed)
VOICE_OF = {"KAI-07": ("am_michael", 1.0), "RAZE-11": ("am_fenrir", 1.02), "JUNO-X9": ("af_bella", 1.0), "VOLT-3": ("am_eric", .98),
            "NYX-21": ("af_nicole", 1.0), "KADE-12": ("bm_george", .96), "SABLE-6": ("bf_emma", .98), "HEX-04": ("af_sky", 1.06),
            "ORIN-88": ("am_puck", 1.0), "ZERO-1": ("am_onyx", .95), "NEKO": ("af_kore", 1.1)}
DEFAULT_VOICE = ("af_heart", 1.0)
_lock = threading.Lock()
_dl_lock = threading.Lock()
_tts = None
_status = {"state": "idle", "error": None}


def vdir() -> Path:
    return config.DATA / "voices"


def status() -> dict:
    have = (vdir() / MODEL).exists() and (vdir() / VOICES).exists()
    try:
        import kokoro_onnx  # noqa: F401
        lib = True
    except Exception:
        lib = False
    return {"voice": ENGINE, "language": "en", "model_ready": have, "library": lib, **_status}


def _ensure_model():
    with _dl_lock:
        d = vdir()
        d.mkdir(parents=True, exist_ok=True)
        for name in (VOICES, MODEL):
            p = d / name
            if not p.exists() or p.stat().st_size == 0:
                _status["state"] = f"downloading {name}"
                tmp = p.with_name(f"{p.name}.{threading.get_ident()}.part")
                urllib.request.urlretrieve(URL + name, tmp)
                tmp.replace(p)
        _status["state"] = "ready"


def _load():
    global _tts
    if _tts is None:
        _ensure_model()
        from kokoro_onnx import Kokoro
        _tts = Kokoro(str(vdir() / MODEL), str(vdir() / VOICES))
    return _tts


# ---------------------------------------------------------------- Indonesian -> English for speech
_ID_WORDS = re.compile(r"\b(yang|dan|ada|untuk|sudah|belum|tidak|menunggu|listing|toko|pendapatan|laba|dengan|ini|itu|saya|kamu|lagi|siap|dulu|baru|di|ke|dari|sedang|akan|mau|bisa|kita|aku|nih|dong|ya|oke|beres|selesai)\b", re.I)
_FALLBACK = [  # (pattern in Indonesian text, English line)
    (r"approv", "Owner, a listing is waiting for your approval."),
    (r"order baru|order masuk", "Ka-ching! A new order just came in."),
    (r"live", "The listing is live on Etsy."),
    (r"draft", "The listing is saved as a draft on Etsy."),
    (r"gagal|error|rusak", "Heads up, something failed. Please take a look."),
    (r"sinkron|sync", "Shop sync is running."),
    (r"riset|kata kunci", "Market research is in progress."),
    (r"backup", "Backup is done and verified."),
    (r"pendapatan|laba|keuangan", "Here are the latest numbers on the finance board."),
    (r"listing", "Listing update on the board."),
    (r"tersimpan|disimpan|siap", "Done. Saved."),
]


def looks_indonesian(text: str) -> bool:
    return len(_ID_WORDS.findall(text)) >= 1


def to_english(text: str) -> str:
    text = " ".join(str(text).split())
    if not looks_indonesian(text):
        return text
    cache = config.DATA / "tts_cache" / "en.json"
    try:
        memo = json.loads(cache.read_text("utf-8")) if cache.exists() else {}
    except Exception:  # noqa: BLE001
        memo = {}
    if text in memo:
        return memo[text]
    en = None
    try:  # local Gemma via Ollama, short timeout so speech never blocks long
        from .ai import client as ai_client
        st = ai_client.ollama_status()
        if st.get("ok") and st.get("models"):
            from . import db
            s = db.settings()["ai"]
            body = json.dumps({"model": s.get("active_model") or s["primary_model"], "stream": False, "options": {"temperature": 0.2},
                               "prompt": "Translate to short natural spoken English. Keep numbers and names. Output only the translation.\n\n" + text}).encode()
            req = urllib.request.Request(s["ollama_url"].rstrip("/") + "/api/generate", body, {"content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=12) as r:
                en = (json.loads(r.read()).get("response") or "").strip().strip('"')[:280] or None
    except Exception:  # noqa: BLE001
        en = None
    if not en:
        low = text.lower()
        en = next((e for pat, e in _FALLBACK if re.search(pat, low)), "Update on the board, owner.")
    else:
        memo[text] = en
        try:
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(dict(list(memo.items())[-500:]), ensure_ascii=False), "utf-8")
        except Exception:  # noqa: BLE001
            pass
    return en


def _speakable(text: str) -> str:
    t = re.sub(r"Rp\s?([\d.]+)\s?(jt|M|rb)?", lambda m: _rp(m.group(1), m.group(2)), text)
    t = t.replace("&", " and ").replace("·", ",").replace("→", " to ")
    return " ".join(t.split())[:300]


def _rp(num: str, unit: str | None) -> str:
    n = num.replace(".", "").replace(",", ".")
    word = {"jt": " million", "M": " billion", "rb": " thousand"}.get(unit or "", "")
    return f"{n}{word} rupiah"


def synth(text: str, agent: str = "", en: str = "") -> bytes:
    line = _speakable(en.strip() if en and en.strip() else to_english(text))
    voice, speed = VOICE_OF.get(agent, DEFAULT_VOICE)
    key = hashlib.sha1(f"{ENGINE}|{voice}|{speed}|{line}".encode()).hexdigest()[:20]
    cache = config.DATA / "tts_cache"
    cache.mkdir(parents=True, exist_ok=True)
    out = cache / f"{key}.wav"
    if out.exists():
        return out.read_bytes()
    with _lock:
        try:
            tts = _load()
            samples, sr = tts.create(line, voice=voice, speed=speed, lang="en-us")
            import numpy as np
            pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
            buf = io.BytesIO()
            with wave.open(buf, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(sr)
                w.writeframes(pcm)
            data = buf.getvalue()
            out.write_bytes(data)
            _status.update(state="ready", error=None)
            return data
        except Exception as e:  # noqa: BLE001
            _status.update(state="error", error=str(e)[:200])
            raise
