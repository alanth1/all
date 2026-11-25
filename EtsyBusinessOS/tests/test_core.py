import pytest

from app import db, jobs, permissions, vault
from app.engines import seo


GOOD = {"focus_keyword": "Modern Cabin House Plan", "title": "Modern Cabin House Plan Two Bedroom Small Home Blueprint (PDF Download)",
        "description": " ".join(["Detailed plan for a modern cabin with clear drawings and notes."] * 12),
        "tags": ["modern cabin", "house plan", "cabin plan", "floor plan", "small home", "blueprint", "tiny house",
                 "diy home", "pdf plan", "home design", "building plan", "cottage plan", "cabin blueprint"],
        "price_usd": 24.99}


def test_seo_rules_pass(env):
    res = seo.validate_listing(GOOD)
    assert res["ok"], [c for c in res["checks"] if not c["ok"]]


@pytest.mark.parametrize("patch,check_id", [
    ({"title": "Modern Cabin House Plan Prefab Kit Blueprint (PDF Download)"}, "banned_words"),
    ({"title": "Modern Cabin House Plan Plan Blueprint (PDF Download)"}, "no_repeats"),
    ({"title": "Modern Cabin House Plan Two Bedroom Blueprint"}, "title_suffix"),
    ({"title": "Blueprint Modern Cabin House Plan (PDF Download)"}, "focus_first"),
    ({"title": "Modern Cabin House Plan " + " ".join(f"w{i}" for i in range(12)) + " (PDF Download)"}, "title_words"),
    ({"tags": GOOD["tags"][:12]}, "tag_count"),
    ({"tags": GOOD["tags"][:12] + ["this tag is far too long for etsy"]}, "tag_length"),
    ({"description": "too short"}, "description_length"),
])
def test_seo_rules_fail(env, patch, check_id):
    res = seo.validate_listing({**GOOD, **patch})
    assert not res["ok"]
    assert any(c["id"] == check_id and not c["ok"] for c in res["checks"])


def test_seo_product_accuracy(env):
    c = {**GOOD, "description": GOOD["description"] + " This plan has 3 bedroom layout."}
    res = seo.validate_listing(c, facts={"numbers": {"bedroom": "2"}})
    assert any(x["id"] == "product_accuracy" and not x["ok"] for x in res["checks"])


def test_rules_are_configurable_and_versioned(env):
    v1 = db.settings()["seo_rules"]["version"]
    db.update_settings({"seo_rules": {"max_title_words": 20, "banned_words": ["prefab", "cheap"]}}, "human")
    s = db.settings()["seo_rules"]
    assert s["max_title_words"] == 20 and s["version"] == v1 + 1
    assert db.q1("SELECT COUNT(*) n FROM system_settings")["n"] == 2


calls = {"n": 0}


@jobs.handler("t_flaky", max_attempts=3)
def _flaky(payload, job):
    calls["n"] += 1
    raise RuntimeError("boom")


@jobs.handler("t_ok")
def _ok(payload, job):
    return {"ok": True}


def test_job_idempotency(env):
    a = jobs.enqueue("t_ok", {}, idempotency_key="same")
    b = jobs.enqueue("t_ok", {}, idempotency_key="same")
    assert a == b
    assert db.q1("SELECT COUNT(*) n FROM jobs WHERE type='t_ok'")["n"] == 1


def test_job_retry_then_fail(env):
    jid = jobs.enqueue("t_flaky", {})
    for _ in range(3):
        db.ex("UPDATE jobs SET run_after='2000-01-01T00:00:00+00:00' WHERE id=?", (jid,))
        jobs.run_one("io")
    j = jobs.get(jid)
    assert j["state"] == "FAILED" and j["attempts"] == 3
    states = [e["state"] for e in db.q("SELECT state FROM job_events WHERE job_id=? ORDER BY id", (jid,))]
    assert "RETRYING" in states


def test_restart_recovery(env):
    jid = jobs.enqueue("t_ok", {})
    db.ex("UPDATE jobs SET state='RUNNING' WHERE id=?", (jid,))  # simulate crash mid-job
    assert jobs.recover() == 1
    assert jobs.get(jid)["state"] == "RETRYING"
    jobs.drain()
    assert jobs.get(jid)["state"] == "DONE"


def test_permissions(env):
    assert permissions.check("ai", "market_research") == "allow"
    assert permissions.check("ai", "etsy_publishing") == "needs_human"
    assert permissions.check("ai", "financial_correction") == "needs_human"
    with pytest.raises(permissions.PermissionDenied):
        permissions.check("ai", "money_transfer")
    with pytest.raises(permissions.PermissionDenied):
        permissions.check("human", "filesystem_write_assets")


def test_tool_registry_validation(env):
    from pydantic import BaseModel

    class A(BaseModel):
        x: int

    permissions.tool("t_publish", "etsy_publishing", A, "test")(lambda a: "published")
    permissions.tool("t_research", "market_research", A, "test")(lambda a: a.x * 2)
    assert permissions.execute_ai_request({"tool": "nope"}, "X")["ok"] is False
    assert permissions.execute_ai_request({"tool": "t_research", "args": {"x": "bad"}}, "X")["ok"] is False
    assert permissions.execute_ai_request({"tool": "t_research", "args": {"x": 2}}, "X") == {"ok": True, "result": 4}
    r = permissions.execute_ai_request({"tool": "t_publish", "args": {"x": 1}}, "X")
    assert r["ok"] is False and r["needs_human"]


def test_audit_append_only(env):
    from app.audit import audit
    audit("human", "x")
    with pytest.raises(Exception):
        db.ex("UPDATE audit_logs SET action='y'")
    with pytest.raises(Exception):
        db.ex("DELETE FROM audit_logs")


def test_vault_encrypts(env):
    vault.put("etsy_app", {"keystring": "abc123secret"})
    raw = db.q1("SELECT secret FROM credentials WHERE name='etsy_app'")["secret"]
    assert b"abc123secret" not in raw
    assert vault.get("etsy_app")["keystring"] == "abc123secret"


def test_backup_and_verify(env):
    p = db.backup()
    assert p.exists() and db.verify_backup(p)
