"""LIVE-mode adapters tested against local fake servers (no real network)."""
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

import pytest

from app import db, jobs, vault


class Fake:
    def __init__(self, handler_fn):
        outer = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _do(self):
                n = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(n) if n else b""
                outer.requests.append((self.command, self.path, dict(self.headers), body))
                code, obj, headers = handler_fn(self.command, self.path, dict(self.headers), body)
                data = json.dumps(obj).encode()
                self.send_response(code)
                for k, v in (headers or {}).items():
                    self.send_header(k, v)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            do_GET = do_POST = do_PATCH = do_PUT = _do

        self.requests = []
        self.srv = HTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.srv.server_port}"
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def close(self):
        self.srv.shutdown()


@pytest.fixture()
def live(env):
    db.update_settings({"mode": "live"}, "human")
    return env


def test_ai_runner_retries_invalid_json(live):
    from pydantic import BaseModel
    from app.ai.runner import run_task
    answers = iter(["not json at all", json.dumps({"a": "x"}), json.dumps({"a": "hello", "n": 3})])

    def h(cmd, path, headers, body):
        if path == "/api/chat":
            req = json.loads(body)
            assert req["options"]["num_ctx"] == 8192 and req["stream"] is False and isinstance(req["format"], dict)
            return 200, {"message": {"content": next(answers)}, "eval_count": 100, "eval_duration": 5_000_000_000}, None
        return 200, {}, None
    f = Fake(h)
    db.update_settings({"ai": {"ollama_url": f.url, "json_retries": 2}}, "human")

    class M(BaseModel):
        a: str
        n: int

    obj, meta = run_task("t", "Tester", "do it", {"x": 1}, M)
    assert obj.n == 3 and meta["attempts"] == 3 and not meta["demo"]
    r = db.q1("SELECT * FROM ai_runs ORDER BY id DESC LIMIT 1")
    assert r["ok"] == 1 and r["tokens_per_sec"] == 20.0
    f.close()


def test_ai_serial_lock(live):
    from app.ai import client
    active = {"n": 0, "max": 0}

    def h(cmd, path, headers, body):
        active["n"] += 1
        active["max"] = max(active["max"], active["n"])
        time.sleep(0.15)
        active["n"] -= 1
        return 200, {"message": {"content": "{}"}}, None
    f = Fake(h)
    db.update_settings({"ai": {"ollama_url": f.url}}, "human")
    ts = [threading.Thread(target=client.chat, args=("s", "u", None)) for _ in range(4)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert active["max"] == 1, "AI requests must be strictly serial"
    f.close()


def test_benchmark_falls_back(live):
    from app.ai import benchmark

    good = json.dumps({"title": "Cabin Plan Two Bedroom (PDF Download)", "tags": [f"t{i}" for i in range(13)], "category": "Plans"})

    def h(cmd, path, headers, body):
        if path == "/api/tags":
            return 200, {"models": [{"name": "big:12b"}, {"name": "small:4b"}]}, None
        if path == "/api/ps":
            return 200, {"models": [{"name": "small:4b", "size": 4e9, "size_vram": 4e9}]}, None
        if path == "/api/chat":
            m = json.loads(body)["model"]
            dur = 50_000_000_000 if m == "big:12b" else 2_000_000_000  # big = 2 tok/s, small = 50 tok/s
            return 200, {"message": {"content": good}, "eval_count": 100, "eval_duration": dur, "load_duration": 1}, None
        return 200, {}, None
    f = Fake(h)
    db.update_settings({"ai": {"ollama_url": f.url, "primary_model": "big:12b", "fallback_model": "small:4b", "min_tokens_per_sec": 8}}, "human")
    res = benchmark.run_and_select()
    assert not res["primary"]["passed"] and res["fallback"]["passed"] and res["chosen"] == "small:4b"
    assert db.settings()["ai"]["active_model"] == "small:4b"
    f.close()


def test_etsy_client_auth_refresh_and_ratelimit(live, monkeypatch):
    from app.integrations import etsy
    from app.jobs import RetryLater
    state = {"calls": 0}

    def h(cmd, path, headers, body):
        u = urlparse(path)
        if u.path == "/token":
            form = parse_qs(body.decode())
            assert form["grant_type"] == ["refresh_token"]
            return 200, {"access_token": "123.new", "refresh_token": "r2", "expires_in": 3600}, None
        assert headers.get("x-api-key") == "KEY:SECRET"
        if u.path == "/v3/application/users/me":
            if headers.get("Authorization") == "Bearer 123.old":
                return 401, {"error": "invalid_token"}, None
            return 200, {"user_id": 123, "shop_id": 456}, None
        if u.path == "/v3/application/listings/active":
            state["calls"] += 1
            assert "Authorization" not in headers  # public endpoint uses API key only
            if state["calls"] == 1:
                return 429, {"error": "rate"}, {"Retry-After": "7"}
            return 200, {"count": 1, "results": [{"listing_id": 1}]}, None
        return 404, {}, None
    f = Fake(h)
    monkeypatch.setattr(etsy, "API", f.url + "/v3/application")
    monkeypatch.setattr(etsy, "TOKEN_URL", f.url + "/token")
    vault.put("etsy_app", {"keystring": "KEY", "shared_secret": "SECRET"})
    vault.put("etsy_token", {"access_token": "123.old", "refresh_token": "r1", "expires_at": time.time() + 999})
    c = etsy.EtsyClient()
    assert c.me()["shop_id"] == 456
    assert vault.get("etsy_token")["access_token"] == "123.new"
    with pytest.raises(RetryLater) as e:
        c.find_active("cabin")
    assert e.value.seconds == 7
    assert c.find_active("cabin")["count"] == 1
    f.close()


def test_live_without_connection_fails_clearly(live):
    jid = jobs.enqueue("research_keyword", {"keyword": "cabin"})
    jobs.drain()
    j = jobs.get(jid)
    assert j["state"] == "FAILED" and "Etsy API key is not set" in j["error"]


def test_web_guards(env):
    from fastapi.testclient import TestClient
    from app.web.server import CSRF, app
    with TestClient(app) as c:
        assert c.get("/", headers={"host": "evil.example"}).status_code == 403
        assert c.post("/settings/mode", data={"mode": "live"}).status_code == 403
        r = c.post("/settings/mode", data={"mode": "live", "csrf": CSRF}, follow_redirects=False)
        assert r.status_code == 303 and db.settings()["mode"] == "live"


def test_ui_end_to_end(env, asset_root):
    """Drive the real UI routes like a user would (demo mode)."""
    from fastapi.testclient import TestClient
    from app.web.server import CSRF, app
    with TestClient(app) as c:
        post = lambda url, **data: c.post(url, data={**data, "csrf": CSRF}, follow_redirects=False)
        r = post("/settings/assets", folders=str(asset_root), scan_minutes="30", marketing_ready_dirname="marketing")
        assert "err=" not in r.headers["location"], r.headers["location"]
        post("/assets/scan")
        jobs.drain()
        assert "cabin-plan.pdf" in c.get("/assets").text
        pid = db.q1("SELECT id FROM products")["id"]
        post("/listings/generate", product_id=str(pid), keyword="")
        jobs.drain()
        lid = db.q1("SELECT id FROM listings WHERE product_id=?", (pid,))["id"]
        page = c.get(f"/approvals/{lid}").text
        assert "Approve &amp; kirim ke Etsy" in page or "Approve & kirim ke Etsy" in page
        r = post(f"/approvals/{lid}/decide", decision="approve", note="ok")
        assert "msg=" in r.headers["location"], r.headers["location"]
        jobs.drain()
        assert db.q1("SELECT state FROM listings WHERE id=?", (lid,))["state"] == "etsy_draft"
        r = c.post("/analytics/import", data={"kind": "daily", "csrf": CSRF}, files={"file": ("s.csv", b"date,visits\n2026-11-01,50\n", "text/csv")},
                   follow_redirects=False)
        assert "Imported" in r.headers["location"]
        r = post("/accounting/expense", expense_date="2026-11-20", vendor="Canva", description="software subscription", amount="12.99",
                 currency="USD", account_code="5200")
        assert "msg=" in r.headers["location"]
        r = post("/brain/save", name="05 Pricing.md", body="# Pricing\n- never below $15")
        assert "Pricing" in c.get("/brain?note=05 Pricing.md").text
        for p in ["/", "/dashboard", "/office", "/research", "/social", "/analytics", "/accounting", "/automation", "/audit", "/settings", "/diagnostics"]:
            assert c.get(p).status_code == 200, p
        assert c.get("/accounting/export.beancount").text.startswith("option")
