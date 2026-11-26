"""Data for the full-hologram dashboards in the HQ. Every number is real DB data; money is shown in Rupiah."""
from __future__ import annotations

from datetime import date, timedelta

from . import db
from .engines import accounting, analytics
from .util import loads


def _q(sql, *a):
    try:
        return [dict(r) for r in db.q(sql, *a)]
    except Exception:
        return []


def _one(sql, *a):
    r = _q(sql, *a)
    return r[0] if r else {}


def idr_rate() -> tuple[float, str]:
    """IDR per 1 unit of the ledger base currency. Uses a stored exchange rate when available, else the setting."""
    base = accounting.base_ccy()
    if base == "IDR":
        return 1.0, "IDR"
    r = _one("SELECT rate, rate_date FROM exchange_rates WHERE base=? AND quote='IDR' ORDER BY rate_date DESC LIMIT 1", (base,))
    if r.get("rate"):
        return float(r["rate"]), f"kurs {r['rate_date']}"
    r = _one("SELECT rate, rate_date FROM exchange_rates WHERE base='IDR' AND quote=? ORDER BY rate_date DESC LIMIT 1", (base,))
    if r.get("rate") and float(r["rate"]):
        return 1 / float(r["rate"]), f"kurs {r['rate_date']}"
    return float(db.settings().get("display", {}).get("idr_per_usd", 16500)), "kurs perkiraan (atur lewat ZERO-1)"


def rp(cents, rate) -> int:
    """cents in base currency -> whole Rupiah."""
    return int(round((cents or 0) / 100 * rate))


def dashboard(days: int = 30) -> dict:
    end = date.today()
    start = end - timedelta(days=days - 1)
    s, e = start.isoformat(), end.isoformat()
    rate, rate_src = idr_rate()
    R = lambda c: rp(c, rate)
    k = analytics.kpis(s, e)
    pl = accounting.profit_and_loss(s, e)
    tb = accounting.trial_balance()
    bs = accounting.balance_sheet(e)
    cf = accounting.cash_flow(s, e)
    tax = accounting.tax_summary(s, e)
    series = [{"d": x["day"][5:], "v": R(x["revenue"]), "n": x["orders"]} for x in analytics.daily_revenue(s, e)]
    fin = k["financial"]
    sales = k["sales"]
    shop = k["shop"]
    mk = k["marketing"]
    pending = _q("SELECT l.id, l.title, l.price_cents, l.updated_at, (SELECT validation FROM listing_versions v WHERE v.id=l.current_version_id) val "
                 "FROM listings l WHERE l.state='pending_approval' ORDER BY l.updated_at DESC LIMIT 8")
    for p in pending:
        p["price"] = R(p.pop("price_cents"))
        val = loads(p.pop("val") or "{}", {})
        p["qa_ok"] = bool(val.get("ok", True)) if isinstance(val, dict) else True
    by_state = {r["state"]: r["n"] for r in _q("SELECT state, COUNT(*) n FROM listings GROUP BY state")}
    top = [{"t": x["title"], "u": x["units"], "v": R(x["revenue"])} for x in sales["product_revenue"]["value"][:6]]
    orders = _q("SELECT substr(r.created_ts,1,10) d, r.grandtotal_cents g, r.buyer_country c, "
                "(SELECT title FROM receipt_items i WHERE i.receipt_id=r.id LIMIT 1) t FROM receipts r ORDER BY created_ts DESC LIMIT 6")
    for o in orders:
        o["g"] = R(o["g"])
    jobs = {r["state"]: r["n"] for r in _q("SELECT state, COUNT(*) n FROM jobs GROUP BY state")}
    audit = _q("SELECT created_at t, actor a, action x, outcome o FROM audit_logs ORDER BY id DESC LIMIT 8")
    notes = _q("SELECT level, title, created_at t FROM notifications ORDER BY id DESC LIMIT 5")
    st = db.settings()
    return {
        "period": {"start": s, "end": e, "days": days},
        "currency": {"code": "IDR", "rate": rate, "source": rate_src},
        "mode": st.get("mode"),
        "overview": {
            "revenue": R(fin["gross_revenue"]["value"]), "profit": R(fin["net_profit"]["value"]),
            "orders": sales["total_orders"]["value"], "growth": sales["revenue_growth"]["value"],
            "pending": len(pending), "failed_jobs": jobs.get("FAILED", 0), "queue": jobs.get("QUEUED", 0) + jobs.get("RUNNING", 0),
            "active_listings": by_state.get("active", 0),
        },
        "finance": {
            "revenue": R(pl["gross_revenue"]), "net_revenue": R(pl["net_revenue"]), "fees": R(fin["etsy_fees"]["value"]),
            "opex": R(fin["operating_expenses"]["value"]), "profit": R(pl["net_profit"]), "cash_change": R(cf["net_change"]),
            "cash_close": R(cf.get("closing", 0)), "assets": R(bs.get("total_assets", 0)),
            "balanced": bool(tb.get("balanced", True)), "tax_on_receipts": R(tax["buyer_tax_on_receipts"]),
            "expenses": [{"n": x["name"], "v": R(x["amount"])} for x in pl["expenses"]],
            "series": series,
        },
        "sales": {"orders": orders, "top": top, "aov": R(sales["average_order_value"]["value"] or 0),
                  "refund_rate": sales["refund_rate"]["value"]},
        "approval": {"items": pending, "count": len(pending)},
        "listings": {"by_state": by_state, "total": sum(by_state.values()),
                     "latest": _q("SELECT title t, state s FROM listings ORDER BY updated_at DESC LIMIT 6")},
        "assets": {**_one("SELECT COUNT(*) n, COALESCE(SUM(size_bytes),0) b FROM social_assets WHERE missing=0"),
                   "kinds": _q("SELECT kind k, COUNT(*) n FROM social_assets WHERE missing=0 GROUP BY kind ORDER BY n DESC LIMIT 6"),
                   "products": _one("SELECT COUNT(*) n FROM products").get("n", 0)},
        "research": {"keywords": [r["keyword"] for r in _q("SELECT keyword FROM keywords ORDER BY id DESC LIMIT 8")],
                     "reports": [r["title"] for r in _q("SELECT title FROM market_reports ORDER BY id DESC LIMIT 4")],
                     "competitors": _one("SELECT COUNT(DISTINCT etsy_listing_id) n FROM competitor_references").get("n", 0)},
        "data": {"views": shop["listing_views"]["value"], "favorites": shop["favorites"]["value"], "visits": shop["visits"]["value"],
                 "conversion": shop["conversion_rate"]["value"], "sources": shop["traffic_sources"]["value"][:5],
                 "anomalies": len(k.get("anomalies") or [])},
        "social": {"posts": mk["published_posts"]["value"], "impressions": mk["impressions"]["value"], "views": mk["views"]["value"],
                   "engagement": mk["engagement"]["value"], "clicks": mk["outbound_clicks"]["value"],
                   "accounts": _q("SELECT platform p, status s FROM social_accounts"),
                   "scheduled": _one("SELECT COUNT(*) n FROM publishing_calendar WHERE status='scheduled'").get("n", 0)},
        "system": {"jobs": jobs, "audit": audit, "notes": notes, "audit_total": _one("SELECT COUNT(*) n FROM audit_logs").get("n", 0),
                   "ai": st.get("ai", {}).get("model") if isinstance(st.get("ai"), dict) else None},
    }
