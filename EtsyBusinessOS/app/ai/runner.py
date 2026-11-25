"""run_task(): the only way modules talk to the AI.
prompt -> model (JSON) -> pydantic validation -> (retry with error feedback) -> validated object.
In demo mode, or when Ollama is unavailable and demo fallback is allowed, a deterministic
demo generator returns clearly-labelled sample output."""
from __future__ import annotations

import logging
import time
from typing import Callable, TypeVar

from pydantic import BaseModel, ValidationError

from .. import brain, db
from ..util import dumps, now
from . import client

log = logging.getLogger("ebos.ai")
T = TypeVar("T", bound=BaseModel)

BASE_RULES = (
    "You are part of Etsy Business OS. Rules: (1) Reply with ONE JSON object only, matching the schema. "
    "(2) Never invent numbers: sales, search volume, competitor statistics or prices must come from the DATA "
    "section; if data is missing, say so in text and do not guess. (3) Mark opinions as interpretation or hypothesis. "
    "(4) Do not perform calculations for final figures - Python does that. (5) Be concise."
)


class AITaskError(Exception):
    pass


def _record(task, model, prompt_chars, ok, attempts, t0, tps, error, output, job_id):
    db.ex("INSERT INTO ai_runs(task, model, prompt_chars, ok, attempts, duration_ms, tokens_per_sec, error, output, job_id, created_at) "
          "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          (task, model, prompt_chars, 1 if ok else 0, attempts, int((time.time() - t0) * 1000), tps,
           (error or "")[:2000], (output or "")[:8000], job_id, now()))


def run_task(task: str, agent: str, instructions: str, data: dict, model_cls: type[T], *,
             demo: Callable[[], dict] | None = None, job_id: int | None = None,
             extra_check: Callable[[T], list[str]] | None = None, use_brain: bool = True) -> tuple[T, dict]:
    """Returns (validated_object, meta). meta = {"model", "demo": bool, "attempts"}."""
    t0 = time.time()
    if client.is_demo():
        if demo is None:
            raise AITaskError("demo mode: no demo output for this task")
        obj = model_cls.model_validate(demo())
        _record(task, "demo", 0, True, 1, t0, None, None, dumps(obj.model_dump()), job_id)
        return obj, {"model": "demo", "demo": True, "attempts": 1}

    system = BASE_RULES + f"\nYour role: {agent}."
    if use_brain:
        system += "\n\nSHOP BRAIN (owner's instructions and context):\n" + brain.context_text()
    schema = model_cls.model_json_schema()
    user = f"TASK: {instructions}\n\nDATA (JSON):\n{dumps(data)}\n\nReturn JSON matching this schema:\n{dumps(schema)}"
    prompt_chars = len(system) + len(user)
    retries = int(client.cfg().get("json_retries", 2))
    last_err = ""
    model = client.active_model()
    for attempt in range(1, retries + 2):
        msg = user if not last_err else user + f"\n\nYour previous answer was rejected: {last_err}\nFix it and return valid JSON."
        try:
            res = client.chat(system, msg, schema)
        except client.AIUnavailable as e:
            _record(task, model, prompt_chars, False, attempt, t0, None, str(e), None, job_id)
            raise
        tps = (res["eval_count"] / (res["eval_duration_ns"] / 1e9)) if res["eval_duration_ns"] else None
        try:
            obj = model_cls.model_validate(client.parse_json(res["text"]))
            problems = extra_check(obj) if extra_check else []
            if problems:
                raise ValueError("; ".join(problems))
            _record(task, res["model"], prompt_chars, True, attempt, t0, tps, None, res["text"], job_id)
            return obj, {"model": res["model"], "demo": False, "attempts": attempt}
        except (ValueError, ValidationError) as e:
            last_err = str(e)[:800]
            log.info("AI output rejected (%s attempt %d): %s", task, attempt, last_err)
    _record(task, model, prompt_chars, False, retries + 1, t0, None, last_err, None, job_id)
    raise AITaskError(f"AI output failed validation after {retries + 1} attempts: {last_err}")
