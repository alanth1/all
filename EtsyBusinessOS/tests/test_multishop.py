"""3 Etsy shops (3 accounts) in one app: operations separated per shop, finance combined."""
import pytest
from fastapi.testclient import TestClient

from app import db, holo, jobs, shops
from app.engines import listings
from app.integrations import base as ibase


def _sync_all():
    for s in shops.SLOTS:
        jobs.enqueue("etsy_sync", {"slot": s})
    jobs.drain()


def test_three_shops_sync_separately_and_finance_is_combined(env):
    _sync_all()
    by = {r["slot"]: r["n"] for r in db.q("SELECT slot, COUNT(*) n FROM receipts GROUP BY slot")}
    assert set(by) == {1, 2, 3} and all(v > 0 for v in by.values())
    # every receipt / listing belongs to exactly one shop - no id collisions across shops
    assert db.q1("SELECT COUNT(*) n FROM receipts")["n"] == sum(by.values())
    assert {r["slot"] for r in db.q("SELECT DISTINCT slot FROM listings")} == {1, 2, 3}
    d = holo.dashboard(90)
    assert len(d["shops"]) == 3
    combined = sum(s["revenue"] for s in d["shops"])
    assert combined > 0 and all(s["revenue"] > 0 for s in d["shops"])
    # ledger is one book for the owner: entries from all shops are posted into the same journal
    assert d["finance"]["revenue"] > max(s["revenue"] for s in d["shops"])


def test_listing_goes_to_its_own_shop_only(env, asset_root):
    from tests.test_flows import _scan
    _scan(asset_root)
    pid = db.q1("SELECT id FROM products")["id"]
    db.update_settings({"listing_defaults": {"publish_target": "draft"}}, "human")
    jobs.enqueue("listing_generate", {"product_id": pid, "slot": 2})
    jobs.drain()
    lid = db.q1("SELECT id FROM listings WHERE product_id=?", (pid,))["id"]
    assert db.q1("SELECT slot FROM listings WHERE id=?", (lid,))["slot"] == 2
    listings.decide(lid, "approve", "", "human")
    jobs.drain()
    l = listings.current(lid)["listing"]
    from app.integrations import demo
    assert l["state"] == "etsy_draft"
    assert demo.DemoEtsy.created[int(l["etsy_listing_id"])]["_slot"] == 2
    # shop 1 sync must never touch shop 2's listing
    jobs.enqueue("etsy_sync", {"slot": 1})
    jobs.drain()
    assert db.q1("SELECT slot FROM listings WHERE id=?", (lid,))["slot"] == 2


def test_publish_refuses_listing_owned_by_another_shop(env, asset_root):
    from tests.test_flows import _scan
    _scan(asset_root)
    pid = db.q1("SELECT id FROM products")["id"]
    jobs.enqueue("listing_generate", {"product_id": pid, "slot": 1})
    jobs.drain()
    lid = db.q1("SELECT id FROM listings WHERE product_id=?", (pid,))["id"]
    listings.decide(lid, "approve", "", "human")
    jobs.drain()
    # someone moves it to shop 3 behind the app's back -> going live must be refused
    db.ex("UPDATE listings SET slot=3 WHERE id=?", (lid,))
    appr = listings.valid_approval(lid)
    jid = jobs.enqueue("etsy_publish", {"listing_id": lid, "version_id": appr["version_id"], "target": "active"})
    jobs.drain()
    assert jobs.get(jid)["state"] == "FAILED"
    assert db.q1("SELECT 1 FROM audit_logs WHERE action='etsy.shop_mismatch'")


def test_shop_slots_have_separate_tokens_and_connections(env):
    assert shops.platform(1) == "etsy" and shops.platform(2) == "etsy2"
    assert shops.token_key(1) != shops.token_key(2) != shops.token_key(3)
    ibase.set_connection("etsy2", "connected", account_name="CabinShop", account_id="222")
    assert shops.all_info()[1]["account"] == "CabinShop" and shops.all_info()[0]["status"] == "not_connected"
    with pytest.raises(ValueError):
        shops.norm(4)


def test_holo_settings_and_approval_api(env, asset_root):
    from app.web.server import CSRF, app
    from tests.test_flows import _scan
    _scan(asset_root)
    with TestClient(app) as c:
        H = {"x-csrf": CSRF}
        st = c.get("/api/holo/settings").json()
        assert {"KAI-07", "VOLT-3", "JUNO-X9", "ZERO-1", "KADE-12"} <= set(st["npcs"])
        assert c.post("/api/holo/settings", json={"id": "publish_target", "value": "active"}).status_code == 403  # no CSRF
        r = c.post("/api/holo/settings", json={"id": "shop2.name", "value": "Cabin Corner"}, headers=H)
        assert r.status_code == 200 and shops.info(2)["name"] == "Cabin Corner"
        assert c.post("/api/holo/settings", json={"id": "shop3.target", "value": "active"}, headers=H).status_code == 200
        assert shops.publish_target(3) == "active" and shops.publish_target(1) == "draft"
        assert c.post("/api/holo/settings", json={"id": "display.idr_per_usd", "value": 15000}, headers=H).status_code == 200
        assert holo.idr_rate()[0] == 15000
        assert c.post("/api/holo/settings", json={"id": "nope", "value": 1}, headers=H).status_code == 400
        pid = db.q1("SELECT id FROM products")["id"]
        assert c.post("/api/holo/settings", json={"id": "gen", "extra": {"product_id": pid, "slot": 3}}, headers=H).status_code == 200
        jobs.drain()
        lid = db.q1("SELECT id FROM listings WHERE product_id=?", (pid,))["id"]
        d = c.get(f"/api/holo/listing/{lid}").json()
        assert d["slot"] == 3 and d["target"] == "active" and d["can_change_shop"]
        assert c.post(f"/api/holo/listing/{lid}/slot", json={"slot": 1}, headers=H).json()["listing"]["slot"] == 1
        r = c.post(f"/api/holo/listing/{lid}/decide", json={"decision": "approve"}, headers=H)
        assert r.status_code == 200, r.text
        jobs.drain()
        d = c.get(f"/api/holo/listing/{lid}").json()
        assert d["state"] == "etsy_draft" and not d["can_change_shop"]
        assert c.post(f"/api/holo/listing/{lid}/slot", json={"slot": 2}, headers=H).status_code == 400
        assert c.post(f"/api/holo/listing/{lid}/golive", json={}, headers=H).status_code == 200
        jobs.drain()
        assert c.get(f"/api/holo/listing/{lid}").json()["state"] == "active"
        assert any(i["id"] == lid for i in c.get("/api/holo/listings").json()["items"]) is False  # live listings leave the queue


def test_brand_names_and_logos(env):
    names = [shops.info(s)["name"] for s in shops.SLOTS]
    assert names == ["Buildvero", "StudioForgeCo", "AvArchID"]
    from pathlib import Path
    static = Path(__file__).resolve().parent.parent / "app" / "web" / "static"
    for s in shops.SLOTS:
        i = shops.info(s)
        assert (static / i["logo"].removeprefix("/static/")).is_file() and (static / i["logo_holo"].removeprefix("/static/")).is_file()
