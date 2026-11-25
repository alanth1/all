"""SEO & Listing Intelligence (PRD module 02).
- AI writes the listing (JSON validated by pydantic).
- Deterministic validators enforce the shop's configurable, versioned rules."""
from __future__ import annotations

import re

from pydantic import BaseModel, Field

from .. import db

WORD_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9'\-]*")


class ListingDraft(BaseModel):
    focus_keyword: str = Field(min_length=2, max_length=60)
    title: str = Field(min_length=10, max_length=140)
    description: str = Field(min_length=50)
    secondary_keywords: list[str] = Field(default_factory=list, max_length=20)
    tags: list[str]
    category_suggestion: str = ""
    attributes: dict[str, str] = Field(default_factory=dict)
    price_suggestion_usd: float | None = Field(default=None, ge=0)
    price_reasoning: str = ""
    positioning: str = ""
    image_choices: list[int] = Field(default_factory=list, description="asset ids in display order")
    video_choice: int | None = None
    file_choices: list[int] = Field(default_factory=list)


def _words(s: str) -> list[str]:
    return [w.lower() for w in WORD_RE.findall(s)]


def rules() -> dict:
    return db.settings()["seo_rules"]


def validate_listing(content: dict, facts: dict | None = None, assets: dict | None = None, r: dict | None = None) -> dict:
    """Returns {"ok", "rules_version", "checks": [{"id","ok","msg","severity"}]}. Pure function - unit tested."""
    r = r or rules()
    facts = facts or {}
    assets = assets or {}
    checks = []

    def add(cid, ok, msg, severity="error"):
        checks.append({"id": cid, "ok": bool(ok), "msg": msg, "severity": severity})

    title = (content.get("title") or "").strip()
    focus = (content.get("focus_keyword") or "").strip()
    suffix = r.get("required_suffix") or ""
    core = title[: -len(suffix)].strip() if suffix and title.endswith(suffix) else title
    title_words = _words(title)
    core_words = _words(core)

    add("title_words", len(title_words) <= r["max_title_words"], f"{len(title_words)} words (max {r['max_title_words']})")
    add("title_chars", len(title) <= r["max_title_chars"], f"{len(title)} characters (max {r['max_title_chars']})")
    if suffix:
        add("title_suffix", title.endswith(suffix), f"title must end with '{suffix}'")
    if r.get("focus_keyword_first"):
        fw = _words(focus)
        add("focus_first", bool(fw) and core_words[: len(fw)] == fw, f"title must start with focus keyword '{focus}'")
    if r.get("no_repeated_words"):
        ignore = {w.lower() for w in r.get("repeat_ignore", [])}
        seen, reps = set(), set()
        for w in title_words:
            if w in ignore:
                continue
            if w in seen:
                reps.add(w)
            seen.add(w)
        add("no_repeats", not reps, "no repeated words" if not reps else f"repeated: {', '.join(sorted(reps))}")
    banned = [b.lower() for b in r.get("banned_words", [])]
    all_text = " ".join([title, content.get("description", ""), " ".join(content.get("tags", []))]).lower()
    hit = [b for b in banned if re.search(rf"\b{re.escape(b)}\b", all_text)]
    add("banned_words", not hit, "no banned words" if not hit else f"banned word used: {', '.join(hit)}")

    tags = [t.strip() for t in content.get("tags", []) if t.strip()]
    add("tag_count", len(tags) == r["tag_count"], f"{len(tags)} tags (need {r['tag_count']})")
    long = [t for t in tags if len(t) > r["max_tag_chars"]]
    add("tag_length", not long, "tag length ok" if not long else f"too long (> {r['max_tag_chars']}): {', '.join(long)}")
    lower = [t.lower() for t in tags]
    dup = sorted({t for t in lower if lower.count(t) > 1})
    add("tag_unique", not dup, "tags unique" if not dup else f"duplicate tags: {', '.join(dup)}")
    bad_chars = [t for t in tags if not re.fullmatch(r"[A-Za-z0-9 '\-&]+", t)]
    add("tag_chars", not bad_chars, "tag characters ok" if not bad_chars else f"invalid characters: {', '.join(bad_chars)}")
    # keyword stuffing: share of tag words that are the same word
    tw = [w for t in tags for w in _words(t)]
    top_share = max((tw.count(w) for w in set(tw)), default=0) / max(len(tags), 1)
    add("no_stuffing", top_share <= r.get("max_tag_word_overlap", 0.6),
        f"most frequent tag word appears in {top_share:.0%} of tags (max {r.get('max_tag_word_overlap', 0.6):.0%})", "warning")
    # relevance: tags should relate to focus keyword / product text
    product_words = set(_words(" ".join([focus, title, content.get("description", ""), facts.get("text", "")])))
    unrelated = [t for t in tags if not (set(_words(t)) & product_words)]
    add("tag_relevance", len(unrelated) <= 3, "tags relate to product" if len(unrelated) <= 3 else
        f"{len(unrelated)} tags have no word in common with the product text: {', '.join(unrelated[:5])}", "warning")

    desc = content.get("description", "")
    add("description_length", len(_words(desc)) >= r["min_description_words"],
        f"{len(_words(desc))} words in description (min {r['min_description_words']})")
    # product accuracy: numeric facts mentioned must match known facts (e.g. bedrooms, sqft, pages)
    mism = []
    for key, val in (facts.get("numbers") or {}).items():
        for m in re.finditer(rf"(\d[\d,\.]*)\s*[- ]?\s*{re.escape(key)}", desc + " " + title, re.I):
            if m.group(1).replace(",", "") != str(val):
                mism.append(f"{key}: text says {m.group(1)}, product has {val}")
    add("product_accuracy", not mism, "numbers match product facts" if not mism else "; ".join(mism))

    if assets:
        add("images", assets.get("images", 0) >= 1, f"{assets.get('images', 0)} listing image(s) selected")
        add("digital_file", assets.get("files", 0) >= 1, f"{assets.get('files', 0)} digital file(s) selected")
        if assets.get("file_errors"):
            add("file_integrity", False, "; ".join(assets["file_errors"]))
        if assets.get("video_bad"):
            add("video_compat", False, assets["video_bad"], "warning")
    price = content.get("price_usd")
    add("price", price is not None and float(price) > 0, f"price {price}")
    if price is not None and facts.get("price_range"):
        lo, hi = facts["price_range"]
        add("price_consistency", lo <= float(price) <= hi, f"price {price} within research range {lo}-{hi}", "warning")
    ok = all(c["ok"] for c in checks if c["severity"] == "error")
    return {"ok": ok, "rules_version": r.get("version", 1), "checks": checks}


def demo_draft(product_name: str, facts_text: str, research: dict) -> dict:
    """Demo-mode generator (deterministic). Produces a rule-compliant sample so the workflow is testable."""
    base = product_name.replace("-", " ").replace("_", " ").strip().title() or "Modern Cabin"
    focus = f"{base} House Plan"
    title = f"{focus} Small Home Blueprint Digital Floor Design (PDF Download)"
    pool = [focus.lower()[:20], "house plan", "floor plan", "small home plan", "cabin blueprint", "tiny house design",
            "diy home plan", "pdf house plan", "digital download", "home blueprint", "building plan", "cottage plan",
            "modern home design", "guest house plan", "lake house plan"]
    tags = []
    for t in pool:
        while len(t) > 20 and " " in t:  # shorten on word boundaries, never mid-word
            t = t.rsplit(" ", 1)[0]
        t = t[:20].strip()
        if t not in tags:
            tags.append(t)
        if len(tags) == 13:
            break
    desc = (f"{base} house plan delivered as an instant PDF download. " + (facts_text[:600] or "") +
            " What you get: floor plans, elevations and key dimensions as described in the file. This is a digital product; "
            "no physical item will be shipped. Please check local building codes and consult a licensed professional before "
            "construction. Files are available right after purchase from your Etsy account. If you have any question about "
            "the plan, send a message and we will reply within one business day. Thank you for supporting a small studio.")
    return {"focus_keyword": focus, "title": title, "description": desc, "secondary_keywords": ["floor plan", "blueprint"],
            "tags": tags, "category_suggestion": "Craft Supplies & Tools > Patterns & How To",
            "attributes": {"format": "PDF"}, "price_suggestion_usd": research.get("median_price_usd") or 24.99,
            "price_reasoning": "DEMO: median of researched competitor prices", "positioning": "DEMO sample positioning"}
