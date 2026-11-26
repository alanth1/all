import hashlib
import os
from datetime import date, timedelta
from pathlib import Path

import pytest

from app import db, jobs
from app.engines import accounting, analytics, assets, listings


def _files_state(root: Path):
    out = {}
    for p in sorted(root.rglob("*")):
        if p.is_file():
            out[str(p)] = (hashlib.sha256(p.read_bytes()).hexdigest(), os.stat(p).st_mtime_ns)
    return out


def _scan(asset_root):
    db.update_settings({"assets": {"folders": [str(asset_root)]}}, "human")
    jobs.enqueue("asset_scan", {})
    jobs.drain()


# ---------- Asset reader ----------

def test_asset_scan_metadata_and_readonly(env, asset_root):
    before = _files_state(asset_root)
    _scan(asset_root)
    after = _files_state(asset_root)
    assert before == after, "asset files must never be modified"
    rows = {Path(r["rel_path"]).name: r for r in db.q("SELECT * FROM social_assets")}
    assert rows["cover.jpg"]["width"] == 2000 and rows["cover.jpg"]["height"] == 3000
    assert rows["cabin-plan.pdf"]["pages"] == 1 and "bedroom" in rows["cabin-plan.pdf"]["text_excerpt"]
    assert rows["tour.mp4"]["duration_s"] == 12.0 and rows["tour.mp4"]["width"] == 1080
    assert rows["pin1.png"]["marketing_ready"] == 1 and rows["cover.jpg"]["marketing_ready"] == 0
    assert db.q1("SELECT COUNT(*) n FROM products")["n"] == 1
    assert len(assets.duplicates()) == 1
    with pytest.raises(assets.ReadOnlyViolation):
        assets.assert_writable(asset_root / "Modern Cabin" / "x.txt")
    # change detection -> new version
    (asset_root / "Modern Cabin" / "notes.txt").write_text("changed", encoding="utf-8")
    jobs.enqueue("asset_scan", {}, idempotency_key="scan2")
    jobs.drain()
    assert db.q1("SELECT version FROM social_assets WHERE rel_path LIKE '%notes.txt'")["version"] == 2


# ---------- Listing workflow + approval ----------

def _generate(asset_root):
    _scan(asset_root)
    pid = db.q1("SELECT id FROM products")["id"]
    jobs.enqueue("listing_generate", {"product_id": pid})
    jobs.drain()
    return db.q1("SELECT id FROM listings WHERE product_id=?", (pid,))["id"]


def test_listing_generation_and_validation(env, asset_root):
    lid = _generate(asset_root)
    cur = listings.current(lid)
    assert cur["validation"]["ok"], [c for c in cur["validation"]["checks"] if not c["ok"]]
    assert cur["listing"]["state"] == "pending_approval"
    assert len(cur["content"]["tags"]) == 13
    assert cur["content"]["images"] and cur["content"]["files"]


def test_publish_blocked_without_approval(env, asset_root):
    lid = _generate(asset_root)
    vid = listings.current(lid)["version"]["id"]
    jid = jobs.enqueue("etsy_publish", {"listing_id": lid, "version_id": vid})
    jobs.drain()
    j = jobs.get(jid)
    assert j["state"] == "FAILED" and "blocked" in j["error"]
    assert listings.current(lid)["listing"]["etsy_listing_id"] is None


def test_ai_cannot_approve(env, asset_root):
    lid = _generate(asset_root)
    with pytest.raises(PermissionError):
        listings.decide(lid, "approve", actor="ai:Quill")


def test_approve_publish_verify(env, asset_root):
    db.update_settings({"listing_defaults": {"publish_target": "active"}}, "human")
    lid = _generate(asset_root)
    r = listings.decide(lid, "approve", "looks good", "human")
    jobs.drain()
    j = jobs.get(r["job_id"])
    assert j["state"] == "PUBLISHED", j["error"]
    l = listings.current(lid)["listing"]
    assert l["state"] == "active" and l["etsy_listing_id"] and l["url"]
    assert db.q1("SELECT COUNT(*) n FROM listing_files WHERE listing_id=?", (lid,))["n"] >= 1
    assert db.q1("SELECT 1 FROM audit_logs WHERE action='etsy.publish_verified' AND entity_id=?", (str(lid),))
    # duplicate approval click -> same idempotent publish job
    again = jobs.enqueue("etsy_publish", {"listing_id": lid, "version_id": listings.current(lid)["version"]["id"]},
                         idempotency_key=f"publish:{lid}:{listings.current(lid)['version']['id']}")
    assert again == r["job_id"]


def test_edit_after_approval_invalidates(env, asset_root):
    lid = _generate(asset_root)
    r = listings.decide(lid, "approve", "", "human")
    listings.edit(lid, {"price_usd": 31.0}, "human")  # change before the publish job runs
    assert listings.valid_approval(lid) is None
    jobs.drain()
    j = jobs.get(r["job_id"])
    assert j["state"] == "FAILED" and "no longer current" in j["error"]
    assert listings.current(lid)["listing"]["etsy_listing_id"] is None


def test_revision_request_regenerates(env, asset_root):
    lid = _generate(asset_root)
    listings.decide(lid, "request_revision", "mention the loft", "human")
    jobs.drain()
    assert listings.current(lid)["version"]["version"] == 2


# ---------- Research ----------

def test_keyword_research_report_labels(env):
    jobs.enqueue("research_keyword", {"keyword": "cabin house plan", "pages": 1})
    jobs.drain()
    rep = db.q1("SELECT * FROM market_reports WHERE kind='keyword'")
    assert rep
    from app.util import loads
    labels = [s["label"] for s in loads(rep["body"])["sections"]]
    assert labels == ["verified", "estimated", "ai_interpretation", "hypothesis"]
    assert db.q1("SELECT COUNT(*) n FROM competitor_references")["n"] == 100
    kh = db.q1("SELECT * FROM keyword_history")
    assert kh["listing_count"] > 0 and kh["median_price_cents"] > 0 and kh["source"] == "demo"


def test_research_permission_denied_source(env):
    from app.engines import research
    from app.jobs import Fatal
    with pytest.raises(Fatal):
        research.require_permission("Etsy website pages (HTML)")


def test_competitor_url(env):
    jobs.enqueue("research_competitor", {"url": "https://www.etsy.com/listing/1234567890/cabin-plan"})
    jobs.drain()
    assert db.q1("SELECT etsy_listing_id FROM competitor_references")["etsy_listing_id"] == "1234567890"
    assert db.q1("SELECT 1 FROM market_reports WHERE kind='competitor'")
    jid = jobs.enqueue("research_competitor", {"url": "https://example.com/no-id"})
    jobs.drain()
    assert jobs.get(jid)["state"] == "FAILED"


# ---------- Etsy sync + accounting ----------

def _sync():
    jobs.enqueue("etsy_sync", {})
    jobs.drain()


def test_sync_and_books_balance(env):
    _sync()
    assert db.q1("SELECT COUNT(*) n FROM receipts")["n"] > 10
    assert db.q1("SELECT COUNT(*) n FROM etsy_ledger_entries WHERE posted_journal_id IS NULL")["n"] == 0
    tb = accounting.trial_balance()
    assert tb["balanced"] and tb["total_debit"] > 0
    bs = accounting.balance_sheet(date.today().isoformat())
    assert bs["balanced"]
    # Etsy receivable equals Etsy's own running balance (full history in demo)
    accounting.reconcile()
    eb = db.q1("SELECT * FROM reconciliation_records WHERE kind='etsy_balance'")
    assert eb["difference_cents"] == 0
    # idempotent: syncing again creates no duplicates
    n = db.q1("SELECT COUNT(*) n FROM journal_entries")["n"]
    jobs.enqueue("etsy_sync", {}, idempotency_key="again")
    jobs.drain()
    assert db.q1("SELECT COUNT(*) n FROM journal_entries")["n"] == n


def test_unbalanced_and_immutable(env):
    with pytest.raises(accounting.UnbalancedEntry):
        accounting.create_entry("2026-01-01", "bad", "test", "1", [{"code": "1010", "debit": 100}, {"code": "4000", "credit": 99}], "human")
    eid = accounting.create_entry("2026-01-01", "owner capital", "test", "2", [{"code": "1010", "debit": 5000}, {"code": "3000", "credit": 5000}], "human")
    with pytest.raises(Exception):
        db.ex("UPDATE journal_entries SET memo='x' WHERE id=?", (eid,))
    with pytest.raises(Exception):
        db.ex("UPDATE journal_lines SET debit_cents=1 WHERE entry_id=?", (eid,))
    with pytest.raises(PermissionError):
        accounting.reverse(eid, "oops", "ai:Judith")
    rid = accounting.reverse(eid, "oops", "human")
    assert accounting.balance_of("1010") == 0 and rid != eid


def test_currency_preserves_original(env):
    db.ex("INSERT INTO exchange_rates(rate_date, base, quote, rate, source) VALUES('2026-01-01','USD','EUR','1.10','test')")
    xid = accounting.add_expense("2026-01-05", "Canva", "design software", "10.00", "EUR", account_code="5200")
    accounting.post_expense(xid, "5200", "human")
    line = db.q1("SELECT * FROM journal_lines WHERE debit_cents>0 ORDER BY id DESC LIMIT 1")
    assert line["debit_cents"] == 1100 and line["orig_amount_cents"] == 1000 and line["orig_currency"] == "EUR"
    xid2 = accounting.add_expense("2026-01-05", "X", "thing", "5", "GBP", account_code="5300")
    with pytest.raises(ValueError):
        accounting.post_expense(xid2, "5300", "human")  # no GBP rate -> refused, not guessed


def test_bank_reconciliation_detects_difference(env):
    _sync()
    payouts = db.q("SELECT * FROM payouts ORDER BY payout_date")
    assert payouts
    p1, p2 = payouts[0], payouts[-1]
    csv = "date,description,amount\n" + f"{p1['payout_date']},ETSY DEPOSIT,{p1['amount_cents'] / 100:.2f}\n" + \
          f"{p2['payout_date']},ETSY DEPOSIT,{(p2['amount_cents'] - 50) / 100:.2f}\n"
    accounting.import_bank_csv(csv, "USD")
    again = accounting.import_bank_csv(csv, "USD")
    assert again["duplicates"] == 2
    accounting.reconcile()
    st = {r["ref_a"]: r for r in db.q("SELECT * FROM reconciliation_records WHERE kind='payout_bank'")}
    assert st[p1["payout_ref"]]["status"] == "matched"
    if p1["payout_ref"] != p2["payout_ref"]:
        assert st[p2["payout_ref"]]["status"] == "difference" and st[p2["payout_ref"]]["difference_cents"] == -50


def test_expense_ai_classification(env):
    xid = accounting.add_expense(date.today().isoformat(), "Pinterest", "pinterest ads promo", "20", "USD")
    jobs.drain()
    x = db.q1("SELECT * FROM expenses WHERE id=?", (xid,))
    assert x["ai_suggestion"] and x["status"] == "pending"  # demo confidence 0.7 -> needs owner review


# ---------- Analytics ----------

def test_kpis_match_source(env):
    _sync()
    end = date.today().isoformat()
    start = (date.today() - timedelta(days=29)).isoformat()
    k = analytics.kpis(start, end)
    expect = db.q1("SELECT COUNT(*) n, SUM(grandtotal_cents) s FROM receipts WHERE is_paid=1 AND substr(created_ts,1,10) BETWEEN ? AND ?", (start, end))
    assert k["sales"]["total_orders"]["value"] == expect["n"]
    assert k["sales"]["total_revenue"]["value"] == expect["s"]
    assert k["shop"]["conversion_rate"]["value"] is None
    rows = "date,visits\n" + "\n".join(f"{(date.today() - timedelta(days=i)).isoformat()},100" for i in range(30))
    analytics.import_shop_stats(rows, "daily")
    k = analytics.kpis(start, end)
    assert k["shop"]["visits"]["value"] == 3000
    assert k["shop"]["conversion_rate"]["value"] == round(expect["n"] / 3000 * 100, 2)
    analytics.import_shop_stats("Source\tVisits\nEtsy search\t200\nPinterest\t40", "traffic_sources")
    analytics.import_shop_stats("search term,visits\ncabin plan,30", "search_terms")
    jobs.enqueue("analytics_report", {})
    jobs.drain()
    assert db.q1("SELECT 1 FROM analytics_reports")


# ---------- Social ----------

def test_social_pipeline_and_duplicates(env, asset_root):
    from app.engines import social
    _scan(asset_root)
    jobs.enqueue("social_plan", {})
    jobs.drain()
    assert db.q1("SELECT COUNT(*) n FROM content_variants WHERE status='ready'")["n"] >= 2
    social.schedule()
    db.ex("UPDATE publishing_calendar SET scheduled_at='2000-01-01T00:00:00+00:00'")
    jobs.enqueue("social_publish", {}, idempotency_key="pub1")
    jobs.drain()
    posts = db.q("SELECT * FROM published_posts")
    assert posts and all(p["verified"] for p in posts)
    shas = [(p["platform"], p["asset_sha256"]) for p in posts]
    assert len(shas) == len(set(shas)), "the same asset must not be published twice on a platform"
    # duplicate image content (pin1-copy.png) must not be published again on pinterest
    n_pin = db.q1("SELECT COUNT(*) n FROM published_posts WHERE platform='pinterest'")["n"]
    social.schedule()
    db.ex("UPDATE publishing_calendar SET scheduled_at='2000-01-01T00:00:00+00:00' WHERE status='scheduled'")
    jobs.enqueue("social_publish", {}, idempotency_key="pub2")
    jobs.drain()
    assert db.q1("SELECT COUNT(*) n FROM published_posts WHERE platform='pinterest'")["n"] == n_pin
    jobs.enqueue("social_metrics", {})
    jobs.drain()
    assert db.q1("SELECT COUNT(*) n FROM social_metrics")["n"] == len(posts)


def test_meta_unavailable(env):
    from app.integrations import providers
    ok, why = providers.platform_available("instagram")
    assert not ok and "Review" in why


def test_demo_drafts_pass_validation_for_house_names():
    """Regression: product names that already contain 'House' must not produce a repeated word."""
    from app.engines.seo import demo_draft, _words
    for name in ["Tiny House Loft", "Modern Farmhouse 3 Bed", "Cyber Cabin 1 Bed", "Home Studio"]:
        words = [w.lower() for w in _words(demo_draft(name, "", {})["title"])]
        long = [w for w in words if len(w) > 2]
        assert len(long) == len(set(long)), (name, words)


def test_demo_seed_assets(env, monkeypatch, tmp_path):
    from app import demo, db
    monkeypatch.setattr(demo, "demo_root", lambda: tmp_path / "demo_assets")
    assert demo.ensure_demo_assets() is True
    assert len(list((tmp_path / "demo_assets").rglob("*.pdf"))) == 3
    assert str(tmp_path / "demo_assets") in db.settings()["assets"]["folders"]


def test_publish_target_draft_then_go_live(env, asset_root):
    """Default target is an Etsy DRAFT (nothing goes live); 'go live' later activates the same listing."""
    assert db.settings()["listing_defaults"]["publish_target"] == "draft"
    lid = _generate(asset_root)
    r = listings.decide(lid, "approve", "", "human")
    jobs.drain()
    assert jobs.get(r["job_id"])["state"] == "DONE"
    l = listings.current(lid)["listing"]
    assert l["state"] == "etsy_draft" and l["etsy_listing_id"]
    assert db.q1("SELECT 1 FROM audit_logs WHERE action='etsy.draft_ready' AND entity_id=?", (str(lid),))
    appr = listings.valid_approval(lid)
    jobs.enqueue("etsy_publish", {"listing_id": lid, "version_id": appr["version_id"], "target": "active"}, actor="human")
    jobs.drain()
    assert listings.current(lid)["listing"]["state"] == "active"
