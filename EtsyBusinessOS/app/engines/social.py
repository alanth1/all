"""Autonomous Social Media Engine (PRD module 04). Uses existing assets only (no generation).
Publishes without per-post approval, but only: marketing-ready assets, validated content, no duplicates,
within rate limits, via official APIs, with proof of success; failures go to the retry queue."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from pydantic import BaseModel, Field

from .. import db
from ..ai.runner import run_task
from ..audit import audit, notify
from ..integrations import providers
from ..jobs import Fatal, RetryLater, enqueue, handler
from ..permissions import check
from ..util import dumps, loads, now, sha256_text

LIMITS = {"pinterest": {"title": 100, "description": 500, "hashtags": 20},
          "youtube": {"title": 100, "description": 5000, "hashtags": 15}}


class PlatformCopy(BaseModel):
    title: str = Field(min_length=3)
    caption: str = ""
    description: str = Field(min_length=10)
    hashtags: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    cta: str = ""


class SocialCopy(BaseModel):
    understanding: str = Field(description="what the asset shows and its marketing goal")
    goal: str
    pinterest: PlatformCopy | None = None
    youtube: PlatformCopy | None = None


def validate_copy(platform: str, c: dict) -> list[str]:
    lim = LIMITS[platform]
    errs = []
    if len(c.get("title", "")) > lim["title"]:
        errs.append(f"{platform} title > {lim['title']} chars")
    if len(c.get("description", "")) > lim["description"]:
        errs.append(f"{platform} description > {lim['description']} chars")
    if len(c.get("hashtags", [])) > lim["hashtags"]:
        errs.append(f"{platform}: too many hashtags")
    banned = [b.lower() for b in db.settings()["seo_rules"].get("banned_words", [])]
    text = (c.get("title", "") + " " + c.get("description", "")).lower()
    for b in banned:
        if b in text:
            errs.append(f"{platform}: banned word '{b}'")
    if platform == "youtube" and sum(len(k) for k in c.get("keywords", [])) > 450:
        errs.append("youtube tags too long")
    return errs


def platforms_for(kind: str) -> list[str]:
    return {"image": ["pinterest"], "video": ["pinterest", "youtube"]}.get(kind, [])


def product_link(product_id: int | None) -> str:
    if not product_id:
        return ""
    r = db.q1("SELECT url FROM listings WHERE product_id=? AND state='active' AND url IS NOT NULL ORDER BY id DESC LIMIT 1", (product_id,))
    return r["url"] if r else ""


@handler("social_plan", lane="io", agent="Pixie", max_attempts=2)
def job_plan(payload, job):
    rows = db.q("SELECT a.* FROM social_assets a LEFT JOIN content_items c ON c.asset_id=a.id WHERE a.marketing_ready=1 AND a.missing=0 "
                "AND a.kind IN ('image','video') AND c.id IS NULL LIMIT 50")
    for a in rows:
        enqueue("social_copy", {"asset_id": a["id"]}, idempotency_key=f"copy:{a['id']}:{a['sha256'][:16]}")
    sched = schedule()
    return {"copy_jobs": len(rows), "scheduled": sched}


@handler("social_copy", lane="ai", agent="Pixie", max_attempts=3)
def job_copy(payload, job):
    a = db.q1("SELECT * FROM social_assets WHERE id=?", (payload["asset_id"],))
    if not a or not a["marketing_ready"]:
        raise Fatal("asset is not marketing-ready")
    prod = db.q1("SELECT name, facts FROM products WHERE id=?", (a["product_id"],)) if a["product_id"] else None
    plats = [p for p in platforms_for(a["kind"]) if providers.platform_available(p)[0] or providers.is_demo()]
    data = {"file": a["rel_path"], "kind": a["kind"], "width": a["width"], "height": a["height"], "duration_s": a["duration_s"],
            "product": prod["name"] if prod else None, "product_link_available": bool(product_link(a["product_id"])), "platforms": plats,
            "limits": {p: LIMITS[p] for p in plats}}
    name = (prod["name"] if prod else Path(a["rel_path"]).stem).replace("-", " ").title()

    def demo():
        out = {"understanding": f"DEMO: {a['kind']} of {name}", "goal": "drive visits to the Etsy listing"}
        for p in plats:
            out[p] = {"title": f"{name} House Plan - Instant PDF", "description": f"{name} plan you can build. Digital download on Etsy.",
                      "hashtags": ["#houseplan", "#cabin", "#tinyhouse"], "keywords": ["house plan", "floor plan"], "cta": "See the plan on Etsy"}
        return out

    def extra(o: SocialCopy):
        errs = []
        for p in plats:
            c = getattr(o, p)
            if c is None:
                errs.append(f"missing copy for {p}")
            else:
                errs += validate_copy(p, c.model_dump())
        return errs

    res, meta = run_task("social_copy", "Social Media Manager",
                         "Write platform-specific copy for this existing asset (do not describe things you cannot know).",
                         data, SocialCopy, demo=demo, job_id=job["id"], extra_check=extra)
    cid = db.ex("INSERT INTO content_items(asset_id, product_id, goal, understanding, created_at) VALUES(?,?,?,?,?)",
                (a["id"], a["product_id"], res.goal, res.understanding, now()))
    link = product_link(a["product_id"])
    made = 0
    for p in plats:
        c = getattr(res, p).model_dump()
        h = sha256_text(dumps({"p": p, "t": c["title"], "d": c["description"], "asset": a["sha256"]}))
        errs = validate_copy(p, c)
        db.ex("INSERT INTO content_variants(content_item_id, platform, title, caption, description, hashtags, keywords, cta, link, content_hash, validation, status, created_at) "
              "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", (cid, p, c["title"], c["caption"], c["description"], dumps(c["hashtags"]), dumps(c["keywords"]),
                                                   c["cta"], link, h, dumps(errs), "ready" if not errs else "invalid", now()))
        made += 1
    scheduled = schedule()  # fill free calendar slots right away
    return {"content_item": cid, "variants": made, "scheduled": scheduled, "model": meta["model"]}


def _slots(platform: str, days: int = 7) -> list[str]:
    cfg = db.settings()["social"][platform]
    hours = cfg.get("post_hours", [12])
    per_day = cfg.get("posts_per_day") or max(1, round(cfg.get("posts_per_week", 2) / 7 * len(hours)))
    out = []
    d0 = datetime.now(timezone.utc).date()
    for i in range(days):
        d = d0 + timedelta(days=i)
        if "posts_per_week" in cfg and not cfg.get("posts_per_day"):
            step = max(1, round(7 / max(cfg["posts_per_week"], 1)))
            if i % step:
                continue
        for h in hours[:per_day]:
            ts = datetime(d.year, d.month, d.day, h, 0, tzinfo=timezone.utc)
            if ts > datetime.now(timezone.utc):
                out.append(ts.replace(microsecond=0).isoformat())
    return out


def schedule() -> int:
    """Fill free calendar slots with ready, unpublished, unscheduled variants (duplicate-safe)."""
    n = 0
    for platform in ("pinterest", "youtube"):
        ok, _ = providers.platform_available(platform)
        if not ok:
            continue
        taken = {r["scheduled_at"] for r in db.q("SELECT scheduled_at FROM publishing_calendar WHERE platform=? AND status IN ('scheduled','queued')", (platform,))}
        free = [s for s in _slots(platform) if s not in taken]
        cands = db.q("""SELECT v.id, a.sha256 FROM content_variants v JOIN content_items c ON c.id=v.content_item_id JOIN social_assets a ON a.id=c.asset_id
            WHERE v.platform=? AND v.status='ready' AND a.marketing_ready=1 AND a.missing=0
            AND NOT EXISTS (SELECT 1 FROM publishing_calendar pc WHERE pc.variant_id=v.id AND pc.status IN ('scheduled','queued','published'))
            AND NOT EXISTS (SELECT 1 FROM published_posts pp WHERE pp.platform=v.platform AND (pp.asset_sha256=a.sha256 OR pp.content_hash=v.content_hash))
            ORDER BY v.id""", (platform,))
        used_sha = set()
        for slot, v in zip(free, [c for c in cands if not (c["sha256"] in used_sha or used_sha.add(c["sha256"]))]):
            db.ex("INSERT INTO publishing_calendar(variant_id, platform, scheduled_at, status, created_at) VALUES(?,?,?,?,?)",
                  (v["id"], platform, slot, "scheduled", now()))
            n += 1
    return n


@handler("social_publish", lane="io", agent="Pixie", max_attempts=1)
def job_publish_due(payload, job):
    due = db.q("SELECT id FROM publishing_calendar WHERE status='scheduled' AND scheduled_at<=?", (now(),))
    for r in due:
        jid = enqueue("social_publish_one", {"calendar_id": r["id"]}, idempotency_key=f"cal:{r['id']}")
        db.ex("UPDATE publishing_calendar SET status='queued', job_id=? WHERE id=?", (jid, r["id"]))
    return {"queued": len(due)}


@handler("social_publish_one", lane="io", agent="Pixie", max_attempts=5)
def job_publish_one(payload, job):
    cal = db.q1("SELECT * FROM publishing_calendar WHERE id=?", (payload["calendar_id"],))
    v = db.q1("SELECT v.*, a.path, a.kind, a.sha256, a.marketing_ready, a.missing, a.product_id FROM content_variants v "
              "JOIN content_items c ON c.id=v.content_item_id JOIN social_assets a ON a.id=c.asset_id WHERE v.id=?", (cal["variant_id"],))
    platform = cal["platform"]
    db.ex("INSERT INTO publishing_jobs(calendar_id, job_id, attempt, status, created_at) VALUES(?,?,?,?,?)",
          (cal["id"], job["id"], job["attempts"], "running", now()))
    ok, why = providers.platform_available(platform)
    if not ok:
        db.ex("UPDATE publishing_calendar SET status='blocked' WHERE id=?", (cal["id"],))
        raise Fatal(f"{platform} unavailable: {why}")
    if not v["marketing_ready"] or v["missing"]:
        db.ex("UPDATE publishing_calendar SET status='blocked' WHERE id=?", (cal["id"],))
        raise Fatal("asset is no longer marketing-ready or is missing")
    errs = validate_copy(platform, {"title": v["title"], "description": v["description"], "hashtags": loads(v["hashtags"], []),
                                    "keywords": loads(v["keywords"], [])})
    if errs:
        db.ex("UPDATE publishing_calendar SET status='blocked' WHERE id=?", (cal["id"],))
        raise Fatal("content failed validation: " + "; ".join(errs))
    if db.q1("SELECT 1 FROM published_posts WHERE platform=? AND (asset_sha256=? OR content_hash=?)", (platform, v["sha256"], v["content_hash"])):
        db.ex("UPDATE publishing_calendar SET status='duplicate' WHERE id=?", (cal["id"],))
        audit("system", "social.duplicate_blocked", "variant", v["id"], {"platform": platform}, outcome="denied")
        return {"skipped": "duplicate"}
    check("ai", "social_publishing")
    link = v["link"] or product_link(v["product_id"])
    desc = v["description"] + ("\n\n" + " ".join(loads(v["hashtags"], [])) if v["hashtags"] else "")
    path = Path(v["path"])
    if platform == "pinterest":
        client = providers.pinterest()
        board = db.settings()["social"]["pinterest"].get("board_id") or ("demo-board-1" if providers.is_demo() else "")
        if not board:
            raise Fatal("Pinterest board not selected (Settings > Social > Pinterest board)")
        res = client.create_pin(board, v["title"], desc, link, image_path=path if v["kind"] == "image" else None,
                                video_path=path if v["kind"] == "video" else None)
        post_id = str(res["id"])
        check_obj = client.get_pin(post_id)
        if not check_obj or str(check_obj.get("id")) != post_id:
            raise RetryLater("pin not verifiable yet", 300)
        url = client.pin_url(post_id)
    else:
        client = providers.youtube()
        cfg = db.settings()["social"]["youtube"]
        if link:
            desc += f"\n\n{link}"
        res = client.upload(path, v["title"], desc, loads(v["keywords"], []), cfg.get("privacy", "public"), cfg.get("category_id", "26"))
        post_id = str(res["id"])
        vid = client.get_video(post_id)
        if not vid:
            raise RetryLater("video not visible yet", 300)
        url = f"https://www.youtube.com/watch?v={post_id}"
        if vid.get("status", {}).get("privacyStatus") == "private" and cfg.get("privacy") != "private":
            notify("warning", "YouTube video is private", "Unaudited API apps can only upload private videos. Request a Google audit.", url)
    db.ex("INSERT INTO published_posts(platform, variant_id, asset_sha256, content_hash, post_id, url, published_at, verified, verified_at, raw) "
          "VALUES(?,?,?,?,?,?,?,1,?,?)", (platform, v["id"], v["sha256"], v["content_hash"], post_id, url, now(), now(), dumps({"source": providers.source_tag()})))
    db.ex("UPDATE publishing_calendar SET status='published' WHERE id=?", (cal["id"],))
    db.ex("UPDATE publishing_jobs SET status='published' WHERE calendar_id=? AND job_id=?", (cal["id"], job["id"]))
    audit("ai:Pixie", "social.published", platform, post_id, {"url": url, "variant": v["id"]})
    return {"_state": "PUBLISHED", "post_id": post_id, "url": url}


@handler("social_metrics", lane="io", agent="Pixie", max_attempts=3)
def job_metrics(payload, job):
    n = 0
    end = date.today()
    start = end - timedelta(days=30)
    for p in db.q("SELECT * FROM published_posts WHERE verified=1"):
        ok, _ = providers.platform_available(p["platform"])
        if not ok:
            continue
        if p["platform"] == "pinterest":
            a = providers.pinterest().analytics(p["post_id"], start.isoformat(), end.isoformat())
            m = (a.get("all") or {}).get("summary_metrics", {})
            db.ex("INSERT INTO social_metrics(post_id, captured_at, impressions, saves, clicks, outbound_clicks, raw) VALUES(?,?,?,?,?,?,?)",
                  (p["id"], now(), m.get("IMPRESSION"), m.get("SAVE"), m.get("PIN_CLICK"), m.get("OUTBOUND_CLICK"), dumps(m)))
        else:
            s = providers.youtube().stats(p["post_id"])
            db.ex("INSERT INTO social_metrics(post_id, captured_at, views, likes, comments, raw) VALUES(?,?,?,?,?,?)",
                  (p["id"], now(), int(s.get("viewCount", 0)), int(s.get("likeCount", 0)), int(s.get("commentCount", 0)), dumps(s)))
        n += 1
    return {"posts": n}


class CampaignReview(BaseModel):
    summary: str
    best_performers: list[str]
    weak_performers: list[str]
    next_strategy: list[str]


@handler("social_review", lane="ai", agent="Pixie", max_attempts=2)
def job_review(payload, job):
    rows = [dict(r) for r in db.q("""SELECT pp.platform, v.title, m.impressions, m.views, m.saves, m.outbound_clicks, m.likes FROM published_posts pp
        JOIN content_variants v ON v.id=pp.variant_id LEFT JOIN social_metrics m ON m.id=(SELECT MAX(id) FROM social_metrics WHERE post_id=pp.id)
        ORDER BY pp.id DESC LIMIT 60""")]
    demo = lambda: {"summary": f"DEMO review of {len(rows)} posts", "best_performers": [], "weak_performers": [], "next_strategy": ["DEMO"]}
    res, meta = run_task("social_review", "Social Media Manager", "Evaluate post performance and propose the next content strategy.",
                         {"posts": rows}, CampaignReview, demo=demo, job_id=job["id"])
    db.ex("INSERT INTO market_reports(kind, title, body, created_at) VALUES(?,?,?,?)",
          ("social_review", "Social campaign review", dumps({"model": meta["model"], "sections": [
              {"title": "Metrics (platform APIs)", "label": "verified", "data": rows},
              {"title": "AI evaluation", "label": "ai_interpretation", "data": res.model_dump()}]}), now()))
    return res.model_dump()
