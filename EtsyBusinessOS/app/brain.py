"""Shared Brain: a folder of Markdown notes, compatible with Obsidian (open the folder as a vault).
Every agent reads it as context. Owner edits it in the app or in Obsidian."""
from __future__ import annotations

import re
from pathlib import Path

from . import config, db
from .audit import audit

SEED = {
    "00 Shop Profile.md": "# Shop Profile\n\n- Shop name: \n- What we sell: digital house plans and construction drawings (PDF download)\n"
                          "- Target buyers: \n- Price range: \n- Unique selling points: \n",
    "01 Brand Voice.md": "# Brand Voice\n\n- Tone: clear, friendly, professional\n- Language: English for Etsy and social media\n"
                         "- Avoid: hype, false claims, the word 'prefab'\n",
    "02 SEO Rules.md": "# SEO Rules (human notes)\n\nMachine-enforced rules live in Settings > SEO Rules.\n\n"
                       "- Max 15 words in title, focus keyword first\n- No repeated words\n- End title with (PDF Download)\n"
                       "- Never use 'prefab'\n- 13 relevant tags, no keyword stuffing\n- Description must match the real PDF content\n",
    "03 Decisions.md": "# Owner Decisions\n\nWrite decisions here so all agents follow them. Example:\n- 2026-11-25: focus on cabin & A-frame niches this quarter\n",
    "04 Important Information.md": "# Important Information\n\n- What is included in every PDF: \n- What is NOT included: \n- Units (ft/m): \n",
    "Agents/README.md": "# Agents\n\nOne note per agent may hold extra instructions, e.g. `Agents/Writer.md`.\n",
}


def path() -> Path:
    p = db.settings()["brain"].get("path") or ""
    return Path(p) if p else config.BRAIN_DEFAULT


def ensure_seed():
    root = path()
    root.mkdir(parents=True, exist_ok=True)
    for name, body in SEED.items():
        f = root / name
        if not f.exists():
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(body, encoding="utf-8")


def _safe(name: str) -> Path:
    root = path().resolve()
    p = (root / name).resolve()
    if root not in p.parents and p != root:
        raise ValueError("path outside brain folder")
    if p.suffix.lower() != ".md":
        raise ValueError("only .md notes")
    return p


def list_notes() -> list[dict]:
    root = path()
    if not root.exists():
        return []
    out = []
    for f in sorted(root.rglob("*.md")):
        if any(part.startswith(".") for part in f.relative_to(root).parts):
            continue  # skip .obsidian etc.
        out.append({"name": f.relative_to(root).as_posix(), "size": f.stat().st_size})
    return out


def read(name: str) -> str:
    return _safe(name).read_text(encoding="utf-8")


def write(name: str, body: str, actor: str = "human"):
    p = _safe(name)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(body, encoding="utf-8")
    audit(actor, "brain.write", "note", name, {"chars": len(body)})


def context_text(agent: str | None = None) -> str:
    """Compact text for the AI system prompt, limited to brain.max_chars (8k context budget)."""
    limit = int(db.settings()["brain"].get("max_chars", 6000))
    parts = []
    for n in list_notes():
        if n["name"].startswith("Agents/") and not (agent and n["name"] == f"Agents/{agent}.md"):
            continue
        body = read(n["name"])
        body = re.sub(r"\n{3,}", "\n\n", body).strip()
        parts.append(f"## {n['name'][:-3]}\n{body}")
    text = "\n\n".join(parts)
    return text[:limit]
