"""Local NPC voices with Piper TTS (Indonesian `id_ID-news_tts-medium`, CPU only).
The model (~63 MB) is downloaded once into data/voices on first use; synthesized lines are cached as WAV."""
import hashlib
import io
import threading
import urllib.request
import wave
from pathlib import Path

from . import config

VOICE = "id_ID-news_tts-medium"
URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium/"
# per-agent speaking rate (length_scale); timbre effects are applied in the HQ view
PACE = {"KAI-07": 1.0, "RAZE-11": .92, "JUNO-X9": 1.05, "VOLT-3": .95, "NYX-21": .9, "KADE-12": 1.08,
        "SABLE-6": 1.12, "HEX-04": .88, "ORIN-88": 1.0, "ZERO-1": .96}
_lock = threading.Lock()
_voice = None
_status = {"state": "idle", "error": None}


def vdir() -> Path:
    return config.DATA / "voices"


def status() -> dict:
    have = (vdir() / f"{VOICE}.onnx").exists()
    try:
        import piper  # noqa: F401
        lib = True
    except Exception:
        lib = False
    return {"voice": VOICE, "model_ready": have, "library": lib, **_status}


def _ensure_model():
    d = vdir()
    d.mkdir(parents=True, exist_ok=True)
    for name in (f"{VOICE}.onnx.json", f"{VOICE}.onnx"):
        p = d / name
        if not p.exists() or p.stat().st_size == 0:
            _status["state"] = f"downloading {name}"
            tmp = p.with_suffix(p.suffix + ".part")
            urllib.request.urlretrieve(URL + name, tmp)
            tmp.replace(p)
    _status["state"] = "ready"


def _load():
    global _voice
    if _voice is None:
        _ensure_model()
        from piper import PiperVoice
        _voice = PiperVoice.load(str(vdir() / f"{VOICE}.onnx"))
    return _voice


def synth(text: str, agent: str = "") -> bytes:
    text = " ".join(str(text).split())[:280]
    pace = PACE.get(agent, 1.0)
    key = hashlib.sha1(f"{VOICE}|{pace}|{text}".encode()).hexdigest()[:20]
    cache = config.DATA / "tts_cache"
    cache.mkdir(parents=True, exist_ok=True)
    out = cache / f"{key}.wav"
    if out.exists():
        return out.read_bytes()
    with _lock:
        try:
            v = _load()
            from piper import SynthesisConfig
            buf = io.BytesIO()
            with wave.open(buf, "wb") as w:
                v.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=pace))
            data = buf.getvalue()
            out.write_bytes(data)
            _status.update(state="ready", error=None)
            return data
        except Exception as e:  # noqa: BLE001
            _status.update(state="error", error=str(e)[:200])
            raise
