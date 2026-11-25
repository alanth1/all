"""Permission matrix (PRD 12.3) and the AI tool registry (PRD 3.4).
The AI never calls code directly: it returns a structured action request, which is validated
(schema), permission-checked, executed by Python, verified and audited."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from pydantic import BaseModel, ValidationError

from .audit import audit

# level: execute | execute_within_rules | prepare | propose | limited | not_permitted
MATRIX: dict[str, tuple[str, str]] = {
    "market_research": ("execute", "monitor"),
    "seo_generation": ("execute", "review"),
    "etsy_draft_creation": ("execute", "monitor"),
    "etsy_publishing": ("prepare", "approve"),
    "social_content_creation": ("execute", "monitor"),
    "social_publishing": ("execute", "monitor"),
    "accounting_entry": ("execute_within_rules", "review"),
    "financial_correction": ("propose", "authorize"),
    "money_transfer": ("not_permitted", "manual_control"),
    "system_settings": ("limited", "authorize"),
    "filesystem_write_assets": ("not_permitted", "not_permitted"),
}


class PermissionDenied(Exception):
    pass


def check(actor: str, action: str) -> str:
    """Returns 'allow' or 'needs_human'. Raises PermissionDenied."""
    if action not in MATRIX:
        raise PermissionDenied(f"unknown action {action}")
    ai_level, human_level = MATRIX[action]
    if actor == "human":
        if human_level == "not_permitted":
            raise PermissionDenied(f"{action} is not permitted in this software")
        return "allow"
    if ai_level in ("execute", "execute_within_rules"):
        return "allow"
    if ai_level in ("prepare", "propose", "limited"):
        return "needs_human"
    raise PermissionDenied(f"AI is not permitted to perform {action}")


@dataclass
class Tool:
    name: str
    action: str
    args_model: type[BaseModel]
    fn: Callable
    description: str


TOOLS: dict[str, Tool] = {}


def tool(name: str, action: str, args_model: type[BaseModel], description: str):
    def deco(fn):
        TOOLS[name] = Tool(name, action, args_model, fn, description)
        return fn
    return deco


def execute_ai_request(request: dict, agent: str) -> dict:
    """request = {"tool": str, "args": {...}} produced by the AI."""
    name = request.get("tool")
    t = TOOLS.get(name)
    if t is None:
        audit(f"ai:{agent}", "tool.rejected", "tool", name, {"reason": "unknown tool"}, outcome="denied")
        return {"ok": False, "error": f"unknown tool {name}"}
    try:
        args = t.args_model.model_validate(request.get("args") or {})
    except ValidationError as e:
        audit(f"ai:{agent}", "tool.rejected", "tool", name, {"reason": "invalid args"}, outcome="denied")
        return {"ok": False, "error": f"invalid args: {e.errors()[:3]}"}
    try:
        decision = check("ai", t.action)
    except PermissionDenied as e:
        audit(f"ai:{agent}", "tool.denied", "tool", name, {"reason": str(e)}, outcome="denied")
        return {"ok": False, "error": str(e)}
    if decision == "needs_human":
        audit(f"ai:{agent}", "tool.needs_approval", "tool", name, args.model_dump())
        return {"ok": False, "needs_human": True, "error": "requires human approval"}
    result = t.fn(args)
    audit(f"ai:{agent}", "tool.executed", "tool", name, {"args": args.model_dump()})
    return {"ok": True, "result": result}
