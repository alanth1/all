"""Ollama client + deterministic demo model.
- One AI task at a time (global lock) -> no VRAM contention.
- Context fixed to num_ctx (8k), model kept loaded only while busy and unloaded after idle.
- Output is requested as JSON (schema-constrained) and ALWAYS validated by pydantic in runner.py."""
from __future__ import annotations

import json
import logging
import threading
import time

import requests

from .. import db

log = logging.getLogger("ebos.ai")
AI_LOCK = threading.Lock()
_last_used = 0.0
_loaded_model: str | None = None


class AIUnavailable(Exception):
    pass


def cfg() -> dict:
    return db.settings()["ai"]


def active_model() -> str:
    c = cfg()
    return c.get("active_model") or c["primary_model"]


def is_demo() -> bool:
    return db.settings()["mode"] == "demo"


def ollama_status(timeout: float = 3.0) -> dict:
    c = cfg()
    try:
        r = requests.get(c["ollama_url"] + "/api/tags", timeout=timeout)
        r.raise_for_status()
        models = [m["name"] for m in r.json().get("models", [])]
        ps = requests.get(c["ollama_url"] + "/api/ps", timeout=timeout).json().get("models", [])
        loaded = [{"name": m["name"], "size_vram": m.get("size_vram", 0), "size": m.get("size", 0)} for m in ps]
        return {"ok": True, "models": models, "loaded": loaded}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "models": [], "loaded": []}


def chat(system: str, user: str, schema: dict | None, *, model: str | None = None, temperature: float | None = None,
         num_predict: int = 1500) -> dict:
    """Returns {"text", "model", "eval_count", "eval_duration_ns", "load_duration_ns", "total_ns"}."""
    global _last_used, _loaded_model
    c = cfg()
    model = model or active_model()
    body = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "stream": False,
        "format": schema if schema else "json",
        "keep_alive": f"{int(c['idle_unload_seconds'])}s",
        "options": {"num_ctx": int(c["num_ctx"]), "temperature": c["temperature"] if temperature is None else temperature,
                    "num_predict": num_predict},
    }
    with AI_LOCK:
        try:
            r = requests.post(c["ollama_url"] + "/api/chat", json=body, timeout=int(c["request_timeout"]))
        except requests.RequestException as e:
            raise AIUnavailable(f"Ollama not reachable at {c['ollama_url']}: {e}") from e
        if r.status_code == 404:
            raise AIUnavailable(f"model '{model}' is not installed in Ollama (run: ollama pull {model})")
        r.raise_for_status()
        data = r.json()
        _last_used = time.time()
        _loaded_model = model
    return {
        "text": data.get("message", {}).get("content", ""),
        "model": model,
        "eval_count": data.get("eval_count", 0),
        "eval_duration_ns": data.get("eval_duration", 0),
        "load_duration_ns": data.get("load_duration", 0),
        "total_ns": data.get("total_duration", 0),
    }


def unload(model: str | None = None):
    """Free VRAM immediately (keep_alive=0)."""
    global _loaded_model
    c = cfg()
    m = model or _loaded_model
    if not m:
        return
    try:
        with AI_LOCK:
            requests.post(c["ollama_url"] + "/api/generate", json={"model": m, "keep_alive": 0}, timeout=30)
        _loaded_model = None
    except requests.RequestException:
        pass


def unload_if_idle():
    c = cfg()
    if _loaded_model and time.time() - _last_used > int(c["idle_unload_seconds"]) and not AI_LOCK.locked():
        unload()


def pull(model: str) -> dict:
    c = cfg()
    r = requests.post(c["ollama_url"] + "/api/pull", json={"model": model, "stream": False}, timeout=3600)
    r.raise_for_status()
    return r.json()


def parse_json(text: str):
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{"):]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in model output")
    return json.loads(text[start:end + 1])
