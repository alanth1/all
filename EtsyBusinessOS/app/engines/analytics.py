"""Business Analytics Engine (PRD module 05). All KPIs computed in Python/SQL; AI only explains."""
from __future__ import annotations

import csv
import io
import statistics
from datetime import date, timedelta

from pydantic import BaseModel

from .. import db
from ..ai.runner import run_task
from ..audit import audit
from ..jobs import handler
from ..util import dumps, now, to_cents
from . import accounting


def _prev(start: str, end: str) -> tuple[str, str]:
    s, e = date.fromisoformat(start), date.fromisoformat(end)
    span = (e - s).days + 1
    return (s - timedelta(days=span)).isoformat(), (s - timedelta(days=1)).isoformat()


def _sales(start: str, end: str) -> dict:
    r = db.q1("SELECT COUNT(*) n, COALESCE(SUM(grandtotal_cents),0) rev, COALESCE(SUM(refunded_cents),0) ref, "
              "COALESCE(SUM(CASE WHEN refunded_cents>0 THEN 1 ELSE 0 END),0) nref FROM receipts "
              "WHERE is_paid=1 AND substr(created_ts,1,10) BETWEEN ? AND ?", (start, end))
    return {"orders": r["n"], "revenue": r["rev"], "refunded": r["ref"], "refunded_orders": r["nref"]}


def kpis(start: str, end: str) -> dict:
    s = _sales(start, end)
    ps, pe = _prev(start, end)
    p = _sales(ps, pe)
    growth = round((s["revenue"] - p["revenue"]) / p["revenue"] * 100, 1) if p["revenue"] else None
    views = db.q1("""SELECT COALESCE(SUM(mx - mn),0) v, COALESCE(SUM(fx - fn),0) f FROM (
        SELECT etsy_listing_id, MAX(views) mx, MIN(views) mn, MAX(num_favorers) fx, MIN(num_favorers) fn
        FROM listing_metrics WHERE captured_on BETWEEN ? AND ? GROUP BY etsy_listing_id)""", (start, end))
    traffic = db.q1("SELECT COALESCE(SUM(visits),0) visits, COUNT(*) days FROM traffic_metrics WHERE channel='all' AND day BETWEEN ? AND ?",
                    (start, end))
    sources = [dict(r) for r in db.q("SELECT channel, SUM(visits) visits FROM traffic_metrics WHERE channel!='all' AND day BETWEEN ? AND ? "
                                     "GROUP BY channel ORDER BY visits DESC", (start, end))]
    conv = round(s["orders"] / traffic["visits"] * 100, 2) if traffic["visits"] else None
    products = [dict(r) for r in db.q(
        "SELECT ri.etsy_listing_id, MAX(ri.title) title, SUM(ri.quantity) units, SUM(ri.price_cents*ri.quantity) revenue FROM receipt_items ri "
        "JOIN receipts r ON r.id=ri.receipt_id WHERE r.is_paid=1 AND substr(r.created_ts,1,10) BETWEEN ? AND ? "
        "GROUP BY ri.etsy_listing_id ORDER BY revenue DESC LIMIT 10", (start, end))]
    posts = db.q1("SELECT COUNT(*) n FROM published_posts WHERE substr(published_at,1,10) BETWEEN ? AND ?", (start, end))["n"]
    sm = db.q1("""SELECT COALESCE(SUM(impressions),0) imp, COALESCE(SUM(COALESCE(views,0)),0) views, COALESCE(SUM(COALESCE(saves,0)+COALESCE(likes,0)+COALESCE(comments,0)),0) eng,
        COALESCE(SUM(COALESCE(outbound_clicks,0)),0) oc FROM social_metrics m WHERE m.id IN (SELECT MAX(id) FROM social_metrics GROUP BY post_id)""")
    pl = accounting.profit_and_loss(start, end)
    fees = next((x["amount"] for x in pl["expenses"] if x["code"] == "5000"), 0)
    opex = pl["total_expenses"] - fees
    cf = accounting.cash_flow(start, end)
    return {
        "period": {"start": start, "end": end, "previous": {"start": ps, "end": pe}},
        "sales": {"total_revenue": {"value": s["revenue"], "unit": "cents", "source": "Etsy API receipts"},
                  "total_orders": {"value": s["orders"], "source": "Etsy API receipts"},
                  "average_order_value": {"value": (s["revenue"] // s["orders"]) if s["orders"] else None, "unit": "cents", "source": "computed"},
                  "refund_rate": {"value": round(s["refunded_orders"] / s["orders"] * 100, 2) if s["orders"] else None, "unit": "%", "source": "computed"},
                  "revenue_growth": {"value": growth, "unit": "% vs previous period", "source": "computed"},
                  "product_revenue": {"value": products, "source": "Etsy API receipt items"}},
        "shop": {"listing_views": {"value": views["v"], "source": "Etsy API listing snapshots (delta)"},
                 "favorites": {"value": views["f"], "source": "Etsy API listing snapshots (delta)"},
                 "visits": {"value": traffic["visits"] if traffic["days"] else None, "source": "Shop Stats import", "days_imported": traffic["days"]},
                 "conversion_rate": {"value": conv, "unit": "%", "source": "computed: orders / imported visits"},
                 "traffic_sources": {"value": sources, "source": "Shop Stats import"}},
        "marketing": {"published_posts": {"value": posts, "source": "internal"},
                      "impressions": {"value": sm["imp"], "source": "Pinterest/YouTube API"},
                      "views": {"value": sm["views"], "source": "YouTube API"},
                      "engagement": {"value": sm["eng"], "source": "platform APIs"},
                      "outbound_clicks": {"value": sm["oc"], "source": "Pinterest API"}},
        "financial": {"gross_revenue": {"value": pl["gross_revenue"], "unit": "cents", "source": "ledger"},
                      "etsy_fees": {"value": fees, "unit": "cents", "source": "ledger"},
                      "operating_expenses": {"value": opex, "unit": "cents", "source": "ledger"},
                      "net_profit": {"value": pl["net_profit"], "unit": "cents", "source": "ledger"},
                      "cash_flow": {"value": cf["net_change"], "unit": "cents", "source": "ledger"}},
        "anomalies": anomalies(start, end),
    }


def daily_revenue(start: str, end: str) -> list[dict]:
    rows = {r["d"]: r for r in db.q("SELECT substr(created_ts,1,10) d, SUM(grandtotal_cents) rev, COUNT(*) n FROM receipts WHERE is_paid=1 "
                                     "AND substr(created_ts,1,10) BETWEEN ? AND ? GROUP BY d", (start, end))}
    out = []
    d = date.fromisoformat(start)
    while d <= date.fromisoformat(end):
        k = d.isoformat()
        out.append({"day": k, "revenue": rows[k]["rev"] if k in rows else 0, "orders": rows[k]["n"] if k in rows else 0})
        d += timedelta(days=1)
    return out


def anomalies(start: str, end: str, z: float = 2.5) -> list[dict]:
    series = daily_revenue(start, end)
    vals = [x["revenue"] for x in series]
    if len(vals) < 14 or statistics.pstdev(vals) == 0:
        return []
    mu, sd = statistics.mean(vals), statistics.pstdev(vals)
    return [{"day": x["day"], "revenue": x["revenue"], "z": round((x["revenue"] - mu) / sd, 2)}
            for x in series if abs(x["revenue"] - mu) / sd >= z]


# ---------- Shop Stats import (manual, because the API has no stats endpoint) ----------

def _find(cols: dict, *names):
    for n in names:
        if n in cols:
            return cols[n]
    return None


def import_shop_stats(text: str, kind: str) -> dict:
    """kind: daily | traffic_sources | search_terms. Accepts CSV or tab-separated pasted tables."""
    text = text.lstrip("﻿").strip()
    dialect = "excel-tab" if "\t" in text.splitlines()[0] else "excel"
    rd = csv.DictReader(io.StringIO(text), dialect=dialect)
    cols = {c.lower().strip(): c for c in (rd.fieldnames or [])}
    batch = now()
    n = 0
    if kind == "daily":
        dcol = _find(cols, "date", "day", "tanggal")
        vcol = _find(cols, "visits", "visit", "kunjungan")
        if not dcol or not vcol:
            raise ValueError(f"need columns date + visits; found {rd.fieldnames}")
        views = _find(cols, "views", "listing views")
        orders = _find(cols, "orders", "pesanan")
        rev = _find(cols, "revenue", "pendapatan")
        for row in rd:
            day = accounting._parse_date(row[dcol])
            db.ex("INSERT INTO traffic_metrics(day, channel, visits, views, orders, revenue_cents, source, import_batch, created_at) "
                  "VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(day, channel, source) DO UPDATE SET visits=excluded.visits, views=excluded.views, "
                  "orders=excluded.orders, revenue_cents=excluded.revenue_cents, import_batch=excluded.import_batch",
                  (day, "all", int(float(row[vcol] or 0)), int(float(row[views] or 0)) if views else None,
                   int(float(row[orders] or 0)) if orders else None, to_cents(row[rev]) if rev else None, "shop_stats_import", batch, now()))
            n += 1
    elif kind == "traffic_sources":
        ccol = _find(cols, "source", "channel", "traffic source", "sumber")
        vcol = _find(cols, "visits", "visit")
        dcol = _find(cols, "date", "day", "period end", "end")
        if not ccol or not vcol:
            raise ValueError(f"need columns source + visits; found {rd.fieldnames}")
        for row in rd:
            day = accounting._parse_date(row[dcol]) if dcol and row.get(dcol) else date.today().isoformat()
            db.ex("INSERT INTO traffic_metrics(day, channel, visits, source, import_batch, created_at) VALUES(?,?,?,?,?,?) "
                  "ON CONFLICT(day, channel, source) DO UPDATE SET visits=excluded.visits, import_batch=excluded.import_batch",
                  (day, row[ccol].strip().lower(), int(float(row[vcol] or 0)), "shop_stats_import", batch, now()))
            n += 1
    elif kind == "search_terms":
        tcol = _find(cols, "search term", "term", "keyword", "search terms")
        vcol = _find(cols, "visits", "visit")
        if not tcol:
            raise ValueError(f"need a search term column; found {rd.fieldnames}")
        for row in rd:
            db.ex("INSERT INTO search_terms(term, visits, source, import_batch, created_at) VALUES(?,?,?,?,?)",
                  (row[tcol].strip(), int(float(row[vcol] or 0)) if vcol else None, "shop_stats_import", batch, now()))
            n += 1
    else:
        raise ValueError("unknown import kind")
    audit("human", "analytics.import", kind, batch, {"rows": n})
    return {"rows": n, "batch": batch}


class KPIInterpretation(BaseModel):
    headline: str
    what_changed: list[str]
    likely_reasons: list[str]
    product_insights: list[str]
    recommendations: list[str]
    data_gaps: list[str]


@handler("analytics_report", lane="ai", agent="ORIN-88", max_attempts=2)
def job_report(payload, job):
    end = payload.get("end") or date.today().isoformat()
    start = payload.get("start") or (date.fromisoformat(end) - timedelta(days=29)).isoformat()
    k = kpis(start, end)
    demo = lambda: {"headline": "DEMO: revenue summary for the last 30 days", "what_changed": ["DEMO"], "likely_reasons": ["DEMO"],
                    "product_insights": ["DEMO"], "recommendations": ["DEMO: import Shop Stats weekly for conversion rate"],
                    "data_gaps": [] if k["shop"]["visits"]["value"] else ["visits not imported"]}
    interp, meta = run_task("analytics_report", "Business Analyst",
                            "Explain these KPIs (money in cents). Compare with previous period. Do not compute new numbers.",
                            k, KPIInterpretation, demo=demo, job_id=job["id"])
    rid = db.ex("INSERT INTO analytics_reports(period_start, period_end, kpis, interpretation, created_at) VALUES(?,?,?,?,?)",
                (start, end, dumps(k), dumps(interp.model_dump() | {"model": meta["model"]}), now()))
    return {"report_id": rid}
