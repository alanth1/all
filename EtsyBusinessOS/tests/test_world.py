from fastapi.testclient import TestClient

from app import db, jobs, world


def test_world_snapshot_events_and_issues(env):
    s = world.snapshot(0)
    names = [a["name"] for a in s["agents"]]
    assert names == ["KAI-07", "RAZE-11", "JUNO-X9", "VOLT-3", "NYX-21", "HEX-04", "SABLE-6", "ORIN-88", "KADE-12", "ZERO-1"]
    assert {a["room_id"] for a in s["agents"]} >= {"command", "lab", "studio", "qa", "shop", "growth", "archive", "data", "finance", "server"}
    assert "cpu" in s["system"] and "kind" in s["weather"]
    last = s["last_event"]
    jobs.enqueue("research_keyword", {"keyword": "cabin plan", "pages": 1})
    jobs.drain()
    s2 = world.snapshot(last)
    texts = [(e["agent"], e["kind"], e["text"]) for e in s2["events"]]
    assert any(a == "RAZE-11" and k == "done" and "cabin plan" in t for a, k, t in texts), texts
    assert any(e["type"] == "research_interpret" and e["handoff"] == "JUNO-X9" for e in s2["events"] if e["kind"] == "done")
    # an approval waiting shows up as a Shop Floor issue
    db.ex("INSERT INTO listings(state, title, created_at, updated_at) VALUES('pending_approval','x','2026-01-01','2026-01-01')")
    iss = world.snapshot(0)["issues"]
    assert any(i["room"] == "shop" and i["level"] == "approval" for i in iss)
    # a failed job raises an issue in the owner's room
    @jobs.handler("t_boom_world", max_attempts=1)
    def boom(p, j):
        raise jobs.Fatal("broken")
    jobs.enqueue("t_boom_world", {})
    jobs.drain()
    assert any(i["level"] == "error" for i in world.snapshot(0)["issues"])


def test_banter_pairs(env):
    a, b = world.banter()
    assert a and b
    world.add_banter([("x", "y")])
    assert world.banter() == ("x", "y")
    jobs.enqueue("npc_banter", {})
    jobs.drain()
    assert world.banter()  # demo writes into the cache


def test_world_page_and_assets(env):
    from app.web.server import app, game_assets
    assets = game_assets()
    with TestClient(app) as c:
        r = c.get("/")
        assert r.status_code == 200 and "hq3d.js" in r.text and "window.AGENTS_META" in r.text
        assert "phaser.min.js" in c.get("/hq2d").text
        assert c.get("/dashboard").status_code == 200
        j = c.get("/api/world?since=0").json()
        assert len(j["agents"]) == 10
        assert len(c.get("/api/world/banter").json()) == 2
        assert c.get("/static/game3d/hq3d.js").status_code == 200
        if assets["npc"]:
            name, a = next(iter(assets["npc"].items()))
            assert len(a["rot"]) == 8
            assert c.get(a["rot"]["south"]).status_code == 200
