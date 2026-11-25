"""Benchmark a model on this PC: load time, tokens/sec, VRAM use (via /api/ps), JSON validity
and simple rule following. Picks the primary model if it passes, otherwise the fallback."""
from __future__ import annotations

import time

from pydantic import BaseModel, Field

from .. import db
from ..audit import audit
from ..util import dumps, now
from . import client


class _BenchOut(BaseModel):
    title: str
    tags: list[str] = Field(min_length=13, max_length=13)
    category: str


PROMPTS = [
    ("json_listing", "Write an Etsy title (max 15 words, ending with '(PDF Download)') and exactly 13 tags for: "
                     "a 2-bedroom modern cabin house floor plan sold as a PDF. Also give a category."),
    ("json_listing_2", "Write an Etsy title (max 15 words, ending with '(PDF Download)') and exactly 13 tags for: "
                       "a small A-frame tiny house plan with loft, digital download. Also give a category."),
]


def benchmark_model(model: str) -> dict:
    out = {"model": model, "started": now(), "runs": [], "errors": []}
    st = client.ollama_status()
    if not st["ok"]:
        out["errors"].append("Ollama is not running: " + st.get("error", ""))
        return _finish(out, False)
    if model not in st["models"] and f"{model}:latest" not in st["models"]:
        out["errors"].append(f"model {model} is not installed. Use 'Download model' first.")
        return _finish(out, False)
    client.unload()
    ok_json = 0
    tps_list = []
    for i, (name, prompt) in enumerate(PROMPTS):
        t0 = time.time()
        try:
            res = client.chat("Reply with JSON only.", prompt, _BenchOut.model_json_schema(), model=model, temperature=0.2, num_predict=400)
        except Exception as e:  # noqa: BLE001
            out["errors"].append(f"{name}: {e}")
            continue
        wall = time.time() - t0
        tps = res["eval_count"] / (res["eval_duration_ns"] / 1e9) if res["eval_duration_ns"] else 0
        valid, rule_ok = False, False
        try:
            obj = _BenchOut.model_validate(client.parse_json(res["text"]))
            valid = True
            rule_ok = obj.title.strip().endswith("(PDF Download)") and len(obj.title.split()) <= 15
        except Exception as e:  # noqa: BLE001
            out["errors"].append(f"{name}: invalid JSON ({str(e)[:120]})")
        ok_json += int(valid)
        tps_list.append(tps)
        out["runs"].append({"name": name, "wall_s": round(wall, 1), "load_s": round(res["load_duration_ns"] / 1e9, 1),
                            "tokens_per_sec": round(tps, 1), "json_valid": valid, "rules_ok": rule_ok, "cold": i == 0})
    ps = client.ollama_status()
    loaded = next((m for m in ps["loaded"] if m["name"].startswith(model.split(":")[0])), None)
    if loaded:
        out["vram_gb"] = round(loaded["size_vram"] / 1e9, 2)
        out["total_gb"] = round(loaded["size"] / 1e9, 2)
        out["fully_on_gpu"] = loaded["size"] > 0 and loaded["size_vram"] >= loaded["size"] * 0.98
    client.unload(model)
    min_tps = float(client.cfg().get("min_tokens_per_sec", 8))
    out["avg_tokens_per_sec"] = round(sum(tps_list) / len(tps_list), 1) if tps_list else 0
    out["json_valid_rate"] = f"{ok_json}/{len(PROMPTS)}"
    passed = bool(tps_list) and ok_json == len(PROMPTS) and out["avg_tokens_per_sec"] >= min_tps and out.get("fully_on_gpu", True)
    return _finish(out, passed)


def _finish(out: dict, passed: bool) -> dict:
    out["passed"] = passed
    out["finished"] = now()
    db.ex("INSERT INTO benchmarks(model, result, passed, created_at) VALUES(?,?,?,?)", (out["model"], dumps(out), int(passed), now()))
    return out


def run_and_select() -> dict:
    c = client.cfg()
    primary = benchmark_model(c["primary_model"])
    chosen, fallback = None, None
    if primary["passed"]:
        chosen = c["primary_model"]
    else:
        fallback = benchmark_model(c["fallback_model"])
        if fallback["passed"]:
            chosen = c["fallback_model"]
    if chosen:
        db.update_settings({"ai": {"active_model": chosen}}, "system:benchmark")
    audit("system", "ai.benchmark", "model", chosen or "none", {"primary_passed": primary["passed"],
                                                                 "fallback_passed": (fallback or {}).get("passed")})
    return {"primary": primary, "fallback": fallback, "chosen": chosen}
