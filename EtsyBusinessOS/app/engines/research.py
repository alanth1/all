"""Market Research Engine (PRD module 01). Data comes ONLY from registered, permitted sources
(official Etsy API: findAllListingsActive / getListing). No scraping. Every finding is labelled:
verified | estimated | ai_interpretation | hypothesis."""
from __future__ import annotations

import math
import re
import statistics
from collections import Counter

from pydantic import BaseModel, Field

from .. import db
from ..ai.runner import run_task
from ..audit import audit, notify
from ..integrations import providers
from ..jobs import Fatal, enqueue, handler
from ..util import dumps, loads, money_obj_cents, now, today

SOURCES = [
    {"name": "Etsy API: findAllListingsActive", "url": "https://openapi.etsy.com/v3/application/listings/active",
     "access_method": "official_api", "permission_status": "allowed",
     "tos_reference": "https://www.etsy.com/legal/api", "robots_policy": "n/a (API)", "rate_limit": "per app quota (default 5/s, 5000/day)",
     "notes": "Public active listings: title, tags, price, favorers. No search volume."},
    {"name": "Etsy API: getListing", "url": "https://openapi.etsy.com/v3/application/listings/{id}",
     "access_method": "official_api", "permission_status": "allowed", "tos_reference": "https://www.etsy.com/legal/api",
     "robots_policy": "n/a (API)", "rate_limit": "per app quota", "notes": "Competitor listing by URL/ID."},
    {"name": "Etsy Shop Stats (owner dashboard)", "url": "https://www.etsy.com/your/shops/me/stats",
     "access_method": "manual_import", "permission_status": "manual_only", "tos_reference": "https://www.etsy.com/legal/terms-of-use",
     "robots_policy": "login area - no automation", "rate_limit": "-", "notes": "Visits, traffic sources, search terms: CSV / paste import."},
    {"name": "Etsy website pages (HTML)", "url": "https://www.etsy.com", "access_method": "web",
     "permission_status": "denied", "tos_reference": "https://www.etsy.com/legal/terms-of-use",
     "robots_policy": "automated collection not permitted", "rate_limit": "-",
     "notes": "Not used. Public visibility is not permission for automated collection."},
]


def seed_sources():
    for s in SOURCES:
        if not db.q1("SELECT 1 FROM research_sources WHERE name=?", (s["name"],)):
            db.ex("INSERT INTO research_sources(name, url, access_method, permission_status, tos_reference, robots_policy, rate_limit, notes) "
                  "VALUES(?,?,?,?,?,?,?,?)", (s["name"], s["url"], s["access_method"], s["permission_status"], s["tos_reference"],
                                             s["robots_policy"], s["rate_limit"], s["notes"]))


def require_permission(source_name: str) -> int:
    row = db.q1("SELECT * FROM research_sources WHERE name=?", (source_name,))
    if not row:
        raise Fatal(f"source not registered: {source_name}")
    allowed = row["permission_status"] == "allowed"
    db.ex("INSERT INTO research_permissions(source_id, checked_at, result, detail) VALUES(?,?,?,?)",
          (row["id"], now(), "allowed" if allowed else "blocked", row["permission_status"]))
    if not allowed:
        audit("system", "research.permission_blocked", "source", row["id"], {"source": source_name}, outcome="denied")
        raise Fatal(f"automated access to '{source_name}' is {row['permission_status']} - use manual-assisted research")
    db.ex("UPDATE research_sources SET last_access=?, data_freshness=? WHERE id=?", (now(), today(), row["id"]))
    return row["id"]


def _norm(s: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 \-']", " ", s.lower()).split())


def analyze_sample(query: str, total_count: int, listings: list[dict]) -> dict:
    """Deterministic statistics (Python, not AI)."""
    prices = [money_obj_cents(x.get("price")) for x in listings if x.get("price")]
    favs = [int(x.get("num_favorers") or 0) for x in listings]
    tag_counter = Counter()
    for x in listings:
        for t in {_norm(t) for t in x.get("tags") or [] if t}:
            tag_counter[t] += 1
    n = max(len(listings), 1)
    q = _norm(query)
    top = [{"tag": t, "listings": c, "share": round(c / n, 3)} for t, c in tag_counter.most_common(60)]
    secondary = [t for t in top if t["tag"] != q and t["share"] >= 0.10 and len(t["tag"].split()) <= 2][:15]
    long_tail = [t for t in top if len(t["tag"].split()) >= 3][:20]
    related = [t for t in top if t not in secondary and t not in long_tail and t["tag"] != q][:20]
    avg_fav = statistics.mean(favs) if favs else 0
    opp = round(avg_fav / math.log10(total_count + 10), 2) if total_count is not None else None
    return {
        "query": query,
        "verified": {"etsy_active_listing_count": total_count, "sample_size": len(listings),
                     "price_cents": {"min": min(prices) if prices else None, "max": max(prices) if prices else None,
                                     "avg": int(statistics.mean(prices)) if prices else None,
                                     "median": int(statistics.median(prices)) if prices else None},
                     "avg_favorers": round(avg_fav, 1), "top_tags": top[:30]},
        "estimated": {"opportunity_score": opp,
                      "opportunity_formula": "avg favorers in sample / log10(active listing count + 10) - indicator only, not search volume",
                      "keyword_groups": {"primary": [q], "secondary": [t["tag"] for t in secondary],
                                         "long_tail": [t["tag"] for t in long_tail], "related": [t["tag"] for t in related]}},
    }


class ResearchInterpretation(BaseModel):
    summary: str
    search_intent: str = Field(description="what buyers using this keyword likely want")
    demand_indicators: list[str]
    price_positioning: str
    differentiation_ideas: list[str]
    opportunities: list[str]
    risks: list[str]
    hypotheses: list[str] = Field(default_factory=list, description="ideas that need testing; not facts")


def _demo_interp(stats: dict) -> dict:
    v = stats["verified"]
    return {"summary": f"DEMO: {v['etsy_active_listing_count']} active listings found for '{stats['query']}'.",
            "search_intent": "DEMO: buyers want ready-to-build plans as instant download",
            "demand_indicators": [f"average favorers {v['avg_favorers']} in sample of {v['sample_size']}"],
            "price_positioning": "DEMO: position near the median price",
            "differentiation_ideas": ["DEMO: include material list", "DEMO: metric + imperial units"],
            "opportunities": ["DEMO: long-tail tags " + ", ".join(stats["estimated"]["keyword_groups"]["long_tail"][:3])],
            "risks": ["DEMO: crowded niche"], "hypotheses": ["DEMO: video listing may lift conversion"]}


@handler("research_keyword", lane="io", agent="RAZE-11", max_attempts=4)
def job_keyword(payload, job):
    query = payload["keyword"].strip()
    src = require_permission("Etsy API: findAllListingsActive")
    client = providers.etsy()
    pages = int(payload.get("pages", 2))
    listings, total = [], 0
    for p in range(pages):
        page = client.find_active(query, limit=100, offset=p * 100)
        total = page.get("count", 0)
        listings.extend(page.get("results", []))
        if len(page.get("results", [])) < 100:
            break
    rj = db.ex("INSERT INTO research_jobs(kind, query, job_id, status, created_at) VALUES('keyword',?,?,'collected',?)", (query, job["id"], now()))
    tag = providers.source_tag()
    for x in listings:
        db.ex("INSERT INTO competitor_references(etsy_listing_id, url, title, price_cents, currency, tags, num_favorers, views, shop_id, method, source, research_job_id, captured_at) "
              "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
              (str(x.get("listing_id")), x.get("url"), x.get("title"), money_obj_cents(x.get("price")),
               (x.get("price") or {}).get("currency_code"), dumps(x.get("tags") or []), x.get("num_favorers"), x.get("views"),
               str(x.get("shop_id")), "etsy_api_findAllListingsActive", tag, rj, now()))
    stats = analyze_sample(query, total, listings)
    db.ex("INSERT INTO research_results(research_job_id, source_id, label, kind, data, captured_at) VALUES(?,?,?,?,?,?)",
          (rj, src, "verified", "keyword_stats", dumps(stats["verified"]), now()))
    db.ex("INSERT INTO research_results(research_job_id, source_id, label, kind, data, captured_at) VALUES(?,?,?,?,?,?)",
          (rj, src, "estimated", "keyword_groups", dumps(stats["estimated"]), now()))
    kid = _keyword_id(query, "primary")
    for group, words in stats["estimated"]["keyword_groups"].items():
        for w in words:
            _keyword_id(w, group)
    pc = stats["verified"]["price_cents"]
    db.ex("INSERT INTO keyword_history(keyword_id, research_job_id, listing_count, sample_size, tag_frequency, avg_price_cents, median_price_cents, avg_favorers, label, source, captured_at) "
          "VALUES(?,?,?,?,?,?,?,?,?,?,?)", (kid, rj, total, len(listings), None, pc["avg"], pc["median"],
                                            stats["verified"]["avg_favorers"], "verified", tag, now()))
    enqueue("research_interpret", {"research_job_id": rj}, idempotency_key=f"interpret:{rj}", parent_id=job["id"])
    return {"research_job_id": rj, "count": total, "sample": len(listings)}


def _keyword_id(kw: str, kind: str) -> int:
    kw = _norm(kw)
    row = db.q1("SELECT id FROM keywords WHERE keyword=?", (kw,))
    if row:
        return row["id"]
    return db.ex("INSERT INTO keywords(keyword, kind, created_at) VALUES(?,?,?)", (kw, kind, now()))


@handler("research_interpret", lane="ai", agent="RAZE-11", max_attempts=3)
def job_interpret(payload, job):
    rj = payload["research_job_id"]
    rjob = db.q1("SELECT * FROM research_jobs WHERE id=?", (rj,))
    rows = {r["kind"]: loads(r["data"]) for r in db.q("SELECT kind, data FROM research_results WHERE research_job_id=?", (rj,))}
    stats = {"query": rjob["query"], "verified": rows.get("keyword_stats", {}), "estimated": rows.get("keyword_groups", {})}
    interp, meta = run_task("research_interpret", "Market Researcher",
                            "Interpret this Etsy keyword research for a shop selling digital house plans. Use only the given numbers.",
                            stats, ResearchInterpretation, demo=lambda: _demo_interp(stats), job_id=job["id"])
    data = interp.model_dump()
    db.ex("INSERT INTO research_results(research_job_id, label, kind, data, captured_at) VALUES(?,?,?,?,?)",
          (rj, "ai_interpretation", "interpretation", dumps({k: v for k, v in data.items() if k != "hypotheses"}), now()))
    db.ex("INSERT INTO research_results(research_job_id, label, kind, data, captured_at) VALUES(?,?,?,?,?)",
          (rj, "hypothesis", "hypotheses", dumps(data.get("hypotheses", [])), now()))
    body = {"query": rjob["query"], "model": meta["model"], "sections": [
        {"title": "Verified data (Etsy API)", "label": "verified", "data": stats["verified"]},
        {"title": "Estimated indicators", "label": "estimated", "data": stats["estimated"]},
        {"title": "AI interpretation", "label": "ai_interpretation", "data": {k: v for k, v in data.items() if k != "hypotheses"}},
        {"title": "Hypotheses to test", "label": "hypothesis", "data": data.get("hypotheses", [])}]}
    rid = db.ex("INSERT INTO market_reports(kind, title, query, body, research_job_id, created_at) VALUES(?,?,?,?,?,?)",
                ("keyword", f"Keyword research: {rjob['query']}", rjob["query"], dumps(body), rj, now()))
    db.ex("UPDATE research_jobs SET status='reported' WHERE id=?", (rj,))
    notify("info", "Research report ready", rjob["query"], f"/research/report/{rid}")
    return {"report_id": rid}


LISTING_ID_RE = re.compile(r"(?:/listing/|^)(\d{6,12})")


class CompetitorAnalysis(BaseModel):
    summary: str
    strengths: list[str]
    weaknesses: list[str]
    tag_strategy: str
    pricing_position: str
    what_we_can_do_better: list[str]
    hypotheses: list[str] = Field(default_factory=list)


@handler("research_competitor", lane="io", agent="RAZE-11", max_attempts=4)
def job_competitor(payload, job):
    url = payload["url"].strip()
    m = LISTING_ID_RE.search(url)
    if not m:
        raise Fatal("could not find an Etsy listing ID in the URL - use manual-assisted research")
    src = require_permission("Etsy API: getListing")
    lid = m.group(1)
    x = providers.etsy().get_listing(lid)
    rj = db.ex("INSERT INTO research_jobs(kind, query, job_id, status, created_at) VALUES('competitor',?,?,'collected',?)", (url, job["id"], now()))
    db.ex("INSERT INTO competitor_references(etsy_listing_id, url, title, price_cents, currency, tags, num_favorers, views, shop_id, method, source, research_job_id, captured_at) "
          "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          (lid, x.get("url") or url, x.get("title"), money_obj_cents(x.get("price")), (x.get("price") or {}).get("currency_code"),
           dumps(x.get("tags") or []), x.get("num_favorers"), x.get("views"), str(x.get("shop_id")), "etsy_api_getListing",
           providers.source_tag(), rj, now()))
    verified = {"listing_id": lid, "title": x.get("title"), "tags": x.get("tags"), "price_cents": money_obj_cents(x.get("price")),
                "num_favorers": x.get("num_favorers"), "views": x.get("views"), "description_excerpt": (x.get("description") or "")[:1500]}
    db.ex("INSERT INTO research_results(research_job_id, source_id, label, kind, data, captured_at) VALUES(?,?,?,?,?,?)",
          (rj, src, "verified", "competitor_listing", dumps(verified), now()))
    enqueue("research_competitor_interpret", {"research_job_id": rj}, idempotency_key=f"cinterp:{rj}", parent_id=job["id"])
    return {"research_job_id": rj}


def add_manual_competitor(url: str, title: str, price: str, tags: str, notes: str) -> int:
    """Manual-assisted research when automated access is not allowed."""
    from ..util import to_cents
    rj = db.ex("INSERT INTO research_jobs(kind, query, status, created_at) VALUES('competitor_manual',?,'collected',?)", (url, now()))
    db.ex("INSERT INTO competitor_references(etsy_listing_id, url, title, price_cents, tags, method, source, research_job_id, captured_at) "
          "VALUES(?,?,?,?,?,?,?,?,?)", ((LISTING_ID_RE.search(url) or [None, ""])[1] if LISTING_ID_RE.search(url) else "", url, title,
                                       to_cents(price) if price else None, dumps([t.strip() for t in tags.split(",") if t.strip()]),
                                       "manual", "manual", rj, now()))
    db.ex("INSERT INTO research_results(research_job_id, label, kind, data, captured_at) VALUES(?,?,?,?,?)",
          (rj, "verified", "competitor_listing", dumps({"title": title, "price": price, "tags": tags, "notes": notes, "entered_by": "owner"}), now()))
    audit("human", "research.manual_competitor", "research_job", rj)
    enqueue("research_competitor_interpret", {"research_job_id": rj}, idempotency_key=f"cinterp:{rj}", actor="human")
    return rj


@handler("research_competitor_interpret", lane="ai", agent="RAZE-11", max_attempts=3)
def job_competitor_interpret(payload, job):
    rj = payload["research_job_id"]
    rjob = db.q1("SELECT * FROM research_jobs WHERE id=?", (rj,))
    v = loads(db.q1("SELECT data FROM research_results WHERE research_job_id=? AND kind='competitor_listing'", (rj,))["data"], {})
    demo = lambda: {"summary": f"DEMO analysis of '{v.get('title')}'", "strengths": ["DEMO: clear title"], "weaknesses": ["DEMO: few tags"],
                    "tag_strategy": "DEMO", "pricing_position": "DEMO", "what_we_can_do_better": ["DEMO: add video"], "hypotheses": []}
    a, meta = run_task("competitor_analysis", "Market Researcher", "Analyse this competitor listing. Do not invent statistics.",
                       v, CompetitorAnalysis, demo=demo, job_id=job["id"])
    data = a.model_dump()
    body = {"query": rjob["query"], "model": meta["model"], "sections": [
        {"title": "Verified data", "label": "verified", "data": v},
        {"title": "AI interpretation", "label": "ai_interpretation", "data": {k: x for k, x in data.items() if k != "hypotheses"}},
        {"title": "Hypotheses", "label": "hypothesis", "data": data["hypotheses"]}]}
    rid = db.ex("INSERT INTO market_reports(kind, title, query, body, research_job_id, created_at) VALUES(?,?,?,?,?,?)",
                ("competitor", f"Competitor: {v.get('title') or rjob['query']}"[:200], rjob["query"], dumps(body), rj, now()))
    return {"report_id": rid}


@handler("research_daily", lane="io", agent="RAZE-11", max_attempts=2)
def job_daily(payload, job):
    tracked = [r["keyword"] for r in db.q("SELECT keyword FROM keywords WHERE kind='tracked'")]
    for kw in tracked:
        enqueue("research_keyword", {"keyword": kw, "pages": 1}, idempotency_key=f"daily:{today()}:{kw}")
    return {"queued": len(tracked)}


def track_keyword(kw: str, on: bool = True):
    kid = _keyword_id(kw, "tracked")
    db.ex("UPDATE keywords SET kind=? WHERE id=?", ("tracked" if on else "primary", kid))
