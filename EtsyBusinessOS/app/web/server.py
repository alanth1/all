"""Local web UI (FastAPI + Jinja2). Bound to 127.0.0.1 only. Every POST needs the CSRF token and a
local Host header, so other websites cannot drive the app."""
from __future__ import annotations

import re
import secrets
from contextlib import asynccontextmanager
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import parse_qs, quote

from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .. import agents, brain, config, db, diagnostics, jobs, orchestrator, vault, world
from ..ai import client as ai_client
from ..audit import audit
from ..engines import accounting, analytics, assets, listings, research, seo
from ..integrations import base as ibase
from ..integrations import etsy as etsy_api
from ..integrations import pinterest as pin_api
from ..integrations import providers
from ..integrations import youtube as yt_api
from ..util import dumps, fmt_money, loads, now, to_cents

HERE = Path(__file__).parent
CSRF = secrets.token_urlsafe(32)
templates = Jinja2Templates(directory=str(HERE / "templates"))
templates.env.globals.update(money=fmt_money, loads=loads, VERSION=config.VERSION, CSRF=CSRF)


@asynccontextmanager
async def lifespan(_app):
    orchestrator.start()
    yield
    orchestrator.stop()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/static", StaticFiles(directory=str(HERE / "static")), name="static")
ALLOWED_HOSTS = {f"127.0.0.1:{config.PORT}", f"localhost:{config.PORT}", "testserver"}


class Guard:
    """Pure ASGI middleware: checks Host (DNS-rebinding) and the CSRF token on POST, then replays the
    buffered body so endpoints can still read their form fields."""
    MAX_BODY = 200 * 1024 * 1024

    def __init__(self, app_):
        self.app = app_

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        if headers.get("host", "") not in ALLOWED_HOSTS:
            return await PlainTextResponse("forbidden host", status_code=403)(scope, receive, send)
        if scope["method"] != "POST":
            return await self.app(scope, receive, send)
        chunks, size, more = [], 0, True
        while more:
            msg = await receive()
            chunks.append(msg.get("body", b""))
            size += len(chunks[-1])
            more = msg.get("more_body", False)
            if size > self.MAX_BODY:
                return await PlainTextResponse("request too large", status_code=413)(scope, receive, send)
        body = b"".join(chunks)
        token = headers.get("x-csrf", "")
        ctype = headers.get("content-type", "")
        if not token and ctype.startswith("application/x-www-form-urlencoded"):
            token = (parse_qs(body.decode("utf-8", "replace")).get("csrf") or [""])[0]
        elif not token and ctype.startswith("multipart/form-data"):
            m = re.search(rb'name="csrf"\r\n\r\n([^\r\n]*)\r\n', body)
            token = m.group(1).decode() if m else ""
        if not secrets.compare_digest(token, CSRF):
            return await PlainTextResponse("invalid CSRF token - reload the page", status_code=403)(scope, receive, send)
        sent = False

        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()
        return await self.app(scope, replay, send)


app.add_middleware(Guard)


def page(request: Request, template: str, **ctx):
    unread = db.q1("SELECT COUNT(*) n FROM notifications WHERE read=0")["n"]
    st = jobs.stats()
    ctx.update(request=request, mode=db.settings()["mode"], unread=unread, msg=request.query_params.get("msg", ""),
               err=request.query_params.get("err", ""), ai_model=ai_client.active_model(),
               queue=st.get("QUEUED", 0) + st.get("RUNNING", 0) + st.get("RETRYING", 0), path=request.url.path)
    return templates.TemplateResponse(request, template, ctx)


def back(url: str, msg: str = "", err: str = "") -> RedirectResponse:
    sep = "&" if "?" in url else "?"
    q = f"msg={quote(msg)}" if msg else (f"err={quote(err)}" if err else "")
    return RedirectResponse(url + (sep + q if q else ""), status_code=303)


def period(request: Request) -> tuple[str, str]:
    end = request.query_params.get("end") or date.today().isoformat()
    start = request.query_params.get("start") or (date.fromisoformat(end) - timedelta(days=29)).isoformat()
    return start, end


# ---------------- dashboard & office ----------------

@app.get("/", response_class=HTMLResponse)
def world_view(request: Request):
    """The living office (game view). Every feature is reached through its room."""
    return templates.TemplateResponse(request, "world.html", {"assets": game_assets(), "agents": agents.statuses()})


def game_assets() -> dict:
    root = HERE / "static" / "game" / "pl"
    out = {"npc": {}, "tiles": {}}
    if not root.exists():
        return out
    import re as _re
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        rot = {f.stem[4:]: f"/static/game/pl/{quote(d.name)}/{f.name}" for f in d.glob("rot_*.png")}
        anims: dict = {}
        for f in d.glob("*.png"):
            m = _re.fullmatch(r"(walk|typing|idle|coffee|sleep)_([a-z-]+)_(\d+)", f.stem)
            if m:
                anims.setdefault(m.group(1), {}).setdefault(m.group(2), []).append((int(m.group(3)), f"/static/game/pl/{quote(d.name)}/{f.name}"))
        anims = {k: {dk: [u for _, u in sorted(v)] for dk, v in dv.items()} for k, dv in anims.items()}
        key = "pets" if d.name == "CAT" else "npc"
        out.setdefault(key, {})[d.name] = {"rot": rot, "walk": anims.pop("walk", {}), "anims": anims}
    out["cars"] = [f"/static/game/pl/{f.name}" for f in sorted(root.glob("car_*.png"))]
    for f in root.glob("tile_*.png"):
        out["tiles"][f.stem[5:]] = f"/static/game/pl/{f.name}"
    return out


@app.get("/api/world")
def api_world(since: int = 0):
    return JSONResponse(world.snapshot(since))


@app.get("/api/world/banter")
def api_banter():
    return JSONResponse(list(world.banter()))


@app.post("/settings/world")
def settings_world(city: str = Form(""), lat: str = Form(""), lon: str = Form(""), ai_banter: str = Form("")):
    def num(v):
        try:
            return str(float(v)) if v.strip() else ""
        except ValueError:
            return ""
    db.update_settings({"world": {"city": city.strip(), "lat": num(lat), "lon": num(lon), "ai_banter": bool(ai_banter)}}, "human")
    return back("/settings#world", "World settings saved")


@app.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request):
    start, end = period(request)
    k = analytics.kpis(start, end)
    conns = {p: ibase.connection(p) for p in ("etsy", "pinterest", "youtube")}
    avail = {p: providers.platform_available(p) for p in ("pinterest", "youtube", "instagram", "facebook")}
    actions = []
    n = db.q1("SELECT COUNT(*) n FROM listings WHERE state='pending_approval'")["n"]
    if n:
        actions.append((f"{n} listing(s) waiting for approval", "/approvals"))
    n = db.q1("SELECT COUNT(*) n FROM jobs WHERE state='FAILED'")["n"]
    if n:
        actions.append((f"{n} failed job(s)", "/automation?state=FAILED"))
    n = db.q1("SELECT COUNT(*) n FROM expenses WHERE status='pending'")["n"]
    if n:
        actions.append((f"{n} expense(s) to review", "/accounting#expenses"))
    if not k["shop"]["visits"]["value"]:
        actions.append(("Import Shop Stats (visits) to get conversion rate", "/analytics#import"))
    if db.settings()["mode"] == "live" and conns["etsy"]["status"] != "connected":
        actions.append(("Connect your Etsy shop", "/settings#connections"))
    notes = db.q("SELECT * FROM notifications ORDER BY id DESC LIMIT 8")
    return page(request, "dashboard.html", k=k, conns=conns, avail=avail, actions=actions, notes=notes,
                agents=agents.statuses(), ollama=ai_client.ollama_status(), series=analytics.daily_revenue(start, end))


@app.get("/office")
def office():
    return RedirectResponse("/", status_code=307)


@app.get("/api/agents")
def api_agents():
    return JSONResponse({"agents": agents.statuses(), "jobs": jobs.stats(), "time": now()})


@app.get("/notifications", response_class=HTMLResponse)
def notifications(request: Request):
    rows = db.q("SELECT * FROM notifications ORDER BY id DESC LIMIT 200")
    db.ex("UPDATE notifications SET read=1 WHERE read=0")
    return page(request, "notifications.html", rows=rows)


# ---------------- approvals & listings ----------------

@app.get("/approvals", response_class=HTMLResponse)
def approvals(request: Request):
    rows = db.q("SELECT l.*, v.validation FROM listings l LEFT JOIN listing_versions v ON v.id=l.current_version_id "
                "WHERE l.state IN ('pending_approval','draft','revision_requested','approved','publishing','failed') AND l.current_version_id IS NOT NULL "
                "ORDER BY CASE l.state WHEN 'pending_approval' THEN 0 ELSE 1 END, l.updated_at DESC")
    return page(request, "approvals.html", rows=rows)


@app.get("/approvals/{lid}", response_class=HTMLResponse)
def approval_detail(request: Request, lid: int):
    try:
        cur = listings.current(lid)
    except KeyError:
        raise HTTPException(404)
    versions = db.q("SELECT id, version, source, created_at, content_hash FROM listing_versions WHERE listing_id=? ORDER BY version DESC", (lid,))
    hist = db.q("SELECT * FROM listing_approvals WHERE listing_id=? ORDER BY id DESC", (lid,))
    ids = cur["content"].get("images", []) + cur["content"].get("files", []) + ([cur["content"]["video"]] if cur["content"].get("video") else [])
    amap = {a["id"]: a for a in db.q(f"SELECT id, rel_path, kind, width, height FROM social_assets WHERE id IN ({','.join('?' * len(ids)) or 'NULL'})", ids)}
    pj = db.q1("SELECT * FROM jobs WHERE type='etsy_publish' AND payload LIKE ? ORDER BY id DESC LIMIT 1", (f'%"listing_id": {lid},%',))
    return page(request, "approval_detail.html", cur=cur, versions=versions, hist=hist, amap=amap, pj=pj,
                valid_approval=listings.valid_approval(lid))


@app.post("/approvals/{lid}/edit")
def approval_edit(lid: int, title: str = Form(...), focus_keyword: str = Form(...), description: str = Form(...),
                  tags: str = Form(...), price_usd: str = Form(...), taxonomy_id: str = Form("")):
    try:
        patch = {"title": " ".join(title.split()), "focus_keyword": focus_keyword.strip(), "description": description.strip(),
                 "tags": [t.strip() for t in tags.replace("\n", ",").split(",") if t.strip()],
                 "price_usd": float(price_usd), "taxonomy_id": int(taxonomy_id) if taxonomy_id.strip() else None}
        listings.edit(lid, patch, "human")
        return back(f"/approvals/{lid}", "Saved as a new version. Previous approval (if any) is no longer valid.")
    except Exception as e:  # noqa: BLE001
        return back(f"/approvals/{lid}", err=str(e))


@app.post("/approvals/{lid}/decide")
def approval_decide(lid: int, decision: str = Form(...), note: str = Form("")):
    try:
        listings.decide(lid, decision, note, "human")
        msg = {"approve": "Approved - publishing job queued", "reject": "Rejected", "request_revision": "Revision requested - AI will rewrite"}[decision]
        return back(f"/approvals/{lid}", msg)
    except Exception as e:  # noqa: BLE001
        return back(f"/approvals/{lid}", err=str(e))


@app.get("/listings", response_class=HTMLResponse)
def listings_page(request: Request):
    rows = db.q("SELECT * FROM listings ORDER BY updated_at DESC LIMIT 500")
    prods = db.q("SELECT p.*, (SELECT COUNT(*) FROM social_assets a WHERE a.product_id=p.id AND a.missing=0) n FROM products p ORDER BY name")
    return page(request, "listings.html", rows=rows, prods=prods)


@app.post("/listings/generate")
def listings_generate(product_id: int = Form(...), keyword: str = Form("")):
    jid = jobs.enqueue("listing_generate", {"product_id": product_id, "keyword": keyword.strip()}, actor="human")
    audit("human", "listing.generate_request", "product", product_id, {"job": jid})
    return back("/listings", f"JUNO-X9 is writing the listing (job #{jid}). It will appear in Approvals.")


@app.post("/etsy/sync")
def etsy_sync_now():
    jid = jobs.enqueue("etsy_sync", {}, priority=1, actor="human")
    return back("/listings", f"Etsy sync queued (job #{jid})")


# ---------------- products & assets ----------------

@app.get("/assets", response_class=HTMLResponse)
def assets_page(request: Request):
    pid = request.query_params.get("product")
    sql = "SELECT a.*, p.name product FROM social_assets a LEFT JOIN products p ON p.id=a.product_id WHERE a.missing=0"
    args: list = []
    if pid:
        sql += " AND a.product_id=?"
        args.append(pid)
    rows = db.q(sql + " ORDER BY a.rel_path LIMIT 1000", args)
    prods = db.q("SELECT * FROM products ORDER BY name")
    return page(request, "assets.html", rows=rows, prods=prods, folders=db.settings()["assets"]["folders"], dups=assets.duplicates(), pid=pid)


@app.post("/assets/scan")
def assets_scan():
    if not assets.roots():
        return back("/assets", err="Add an asset folder first (Settings > Asset folders)")
    jid = jobs.enqueue("asset_scan", {}, priority=1, actor="human")
    return back("/assets", f"SABLE-6 is scanning (job #{jid})")


@app.post("/assets/{aid}/ready")
def asset_ready(aid: int, ready: int = Form(...)):
    db.ex("UPDATE social_assets SET marketing_ready=? WHERE id=?", (1 if ready else 0, aid))
    audit("human", "asset.marketing_ready", "asset", aid, {"ready": bool(ready)})
    return back("/assets", "Updated")


@app.post("/products/{pid}/facts")
def product_facts(pid: int, numbers: str = Form(""), notes: str = Form("")):
    nums = {}
    for part in numbers.split(","):
        if "=" in part:
            k, v = part.split("=", 1)
            nums[k.strip().lower()] = v.strip()
    db.ex("UPDATE products SET facts=? WHERE id=?", (dumps({"numbers": nums, "notes": notes}), pid))
    audit("human", "product.facts", "product", pid)
    return back(f"/assets?product={pid}", "Product facts saved (used by the accuracy validator)")


# ---------------- research ----------------

@app.get("/research", response_class=HTMLResponse)
def research_page(request: Request):
    reports = db.q("SELECT id, kind, title, created_at FROM market_reports ORDER BY id DESC LIMIT 100")
    sources = db.q("SELECT * FROM research_sources ORDER BY id")
    tracked = db.q("SELECT keyword FROM keywords WHERE kind='tracked' ORDER BY keyword")
    return page(request, "research.html", reports=reports, sources=sources, tracked=tracked)


@app.post("/research/keyword")
def research_keyword(keyword: str = Form(...), track: str = Form("")):
    kw = keyword.strip()
    if not kw:
        return back("/research", err="Enter a keyword")
    if track:
        research.track_keyword(kw)
    jid = jobs.enqueue("research_keyword", {"keyword": kw, "pages": 2}, priority=2, actor="human")
    return back("/research", f"RAZE-11 is researching '{kw}' via the Etsy API (job #{jid})")


@app.post("/research/competitor")
def research_competitor(url: str = Form(...)):
    jid = jobs.enqueue("research_competitor", {"url": url.strip()}, priority=2, actor="human")
    return back("/research", f"Competitor research queued (job #{jid})")


@app.post("/research/manual")
def research_manual(url: str = Form(""), title: str = Form(...), price: str = Form(""), tags: str = Form(""), notes: str = Form("")):
    research.add_manual_competitor(url, title, price, tags, notes)
    return back("/research", "Manual competitor saved; AI analysis queued")


@app.get("/research/report/{rid}", response_class=HTMLResponse)
def research_report(request: Request, rid: int):
    r = db.q1("SELECT * FROM market_reports WHERE id=?", (rid,))
    if not r:
        raise HTTPException(404)
    return page(request, "report.html", r=r, body=loads(r["body"], {}))


# ---------------- social ----------------

@app.get("/social", response_class=HTMLResponse)
def social_page(request: Request):
    cal = db.q("SELECT c.*, v.title, v.platform FROM publishing_calendar c JOIN content_variants v ON v.id=c.variant_id "
               "ORDER BY c.scheduled_at DESC LIMIT 200")
    posts = db.q("SELECT p.*, v.title, (SELECT impressions FROM social_metrics m WHERE m.post_id=p.id ORDER BY id DESC LIMIT 1) imp, "
                 "(SELECT views FROM social_metrics m WHERE m.post_id=p.id ORDER BY id DESC LIMIT 1) views, "
                 "(SELECT outbound_clicks FROM social_metrics m WHERE m.post_id=p.id ORDER BY id DESC LIMIT 1) oc "
                 "FROM published_posts p JOIN content_variants v ON v.id=p.variant_id ORDER BY p.id DESC LIMIT 200")
    variants = db.q("SELECT v.*, a.rel_path FROM content_variants v JOIN content_items c ON c.id=v.content_item_id JOIN social_assets a ON a.id=c.asset_id ORDER BY v.id DESC LIMIT 100")
    failed = db.q("SELECT * FROM jobs WHERE type='social_publish_one' AND state IN ('FAILED','RETRYING') ORDER BY id DESC LIMIT 50")
    avail = {p: providers.platform_available(p) for p in ("pinterest", "youtube", "instagram", "facebook")}
    return page(request, "social.html", cal=cal, posts=posts, variants=variants, failed=failed, avail=avail)


@app.post("/social/plan")
def social_plan():
    jid = jobs.enqueue("social_plan", {}, priority=2, actor="human")
    return back("/social", f"HEX-04 is planning content (job #{jid})")


@app.post("/social/variant/{vid}/disable")
def social_disable(vid: int):
    db.ex("UPDATE content_variants SET status='disabled' WHERE id=?", (vid,))
    db.ex("UPDATE publishing_calendar SET status='cancelled' WHERE variant_id=? AND status='scheduled'", (vid,))
    audit("human", "social.variant_disable", "variant", vid)
    return back("/social", "Variant disabled")


# ---------------- analytics ----------------

@app.get("/analytics", response_class=HTMLResponse)
def analytics_page(request: Request):
    start, end = period(request)
    reports = db.q("SELECT * FROM analytics_reports ORDER BY id DESC LIMIT 5")
    terms = db.q("SELECT term, SUM(visits) v FROM search_terms GROUP BY term ORDER BY v DESC LIMIT 25")
    return page(request, "analytics.html", k=analytics.kpis(start, end), series=analytics.daily_revenue(start, end), start=start,
                end=end, reports=reports, terms=terms)


@app.post("/analytics/import")
async def analytics_import(request: Request):
    form = await request.form()
    kind = form.get("kind", "daily")
    text = form.get("text") or ""
    f = form.get("file")
    if f is not None and hasattr(f, "read"):
        data = await f.read()
        if data:
            text = data.decode("utf-8-sig", "replace")
    try:
        r = analytics.import_shop_stats(text, kind)
        return back("/analytics", f"Imported {r['rows']} row(s)")
    except Exception as e:  # noqa: BLE001
        return back("/analytics", err=str(e))


@app.post("/analytics/report")
def analytics_report():
    jid = jobs.enqueue("analytics_report", {}, priority=3, actor="human")
    return back("/analytics", f"ORIN-88 is writing the report (job #{jid})")


# ---------------- accounting ----------------

@app.get("/accounting", response_class=HTMLResponse)
def accounting_page(request: Request):
    start, end = period(request)
    ctx = dict(start=start, end=end, pl=accounting.profit_and_loss(start, end), bs=accounting.balance_sheet(end),
               cf=accounting.cash_flow(start, end), fees=accounting.fee_report(start, end),
               prod=accounting.product_profitability(start, end), tax=accounting.tax_summary(start, end),
               tb=accounting.trial_balance(end), coa=db.q("SELECT * FROM accounts ORDER BY code"),
               journal=db.q("SELECT e.*, (SELECT SUM(debit_cents) FROM journal_lines WHERE entry_id=e.id) amt, "
                            "(SELECT id FROM journal_entries r WHERE r.reverses_id=e.id) reversed_by FROM journal_entries e ORDER BY e.id DESC LIMIT 100"),
               expenses=db.q("SELECT * FROM expenses ORDER BY id DESC LIMIT 100"),
               recon=db.q("SELECT * FROM reconciliation_records ORDER BY id DESC LIMIT 100"),
               rates=db.q("SELECT * FROM exchange_rates ORDER BY rate_date DESC LIMIT 30"),
               base=accounting.base_ccy())
    return page(request, "accounting.html", **ctx)


@app.post("/accounting/expense")
def accounting_expense(expense_date: str = Form(...), vendor: str = Form(""), description: str = Form(...), amount: str = Form(...),
                       currency: str = Form("USD"), account_code: str = Form("")):
    try:
        accounting.add_expense(expense_date, vendor, description, amount, currency, "human", account_code or None)
        return back("/accounting#expenses", "Expense added" + ("" if account_code else " - KADE-12 will suggest an account"))
    except Exception as e:  # noqa: BLE001
        return back("/accounting#expenses", err=str(e))


@app.post("/accounting/expense/{xid}/post")
def accounting_expense_post(xid: int, account_code: str = Form(...)):
    try:
        accounting.post_expense(xid, account_code, "human")
        return back("/accounting#expenses", "Expense posted")
    except Exception as e:  # noqa: BLE001
        return back("/accounting#expenses", err=str(e))


@app.post("/accounting/expense/{xid}/reject")
def accounting_expense_reject(xid: int):
    db.ex("UPDATE expenses SET status='rejected' WHERE id=? AND status='pending'", (xid,))
    audit("human", "expense.reject", "expense", xid)
    return back("/accounting#expenses", "Expense rejected")


@app.post("/accounting/reverse/{eid}")
def accounting_reverse(eid: int, reason: str = Form(...)):
    try:
        rid = accounting.reverse(eid, reason, "human")
        return back("/accounting#journal", f"Reversal entry #{rid} posted")
    except Exception as e:  # noqa: BLE001
        return back("/accounting#journal", err=str(e))


@app.post("/accounting/bank-import")
async def accounting_bank(request: Request):
    form = await request.form()
    f = form.get("file")
    text = (await f.read()).decode("utf-8-sig", "replace") if f is not None and hasattr(f, "read") else form.get("text", "")
    try:
        r = accounting.import_bank_csv(text, form.get("currency", "USD"))
        accounting.reconcile()
        return back("/accounting#recon", f"Imported {r['added']} bank line(s), {r['duplicates']} duplicate(s) skipped; reconciliation updated")
    except Exception as e:  # noqa: BLE001
        return back("/accounting#recon", err=str(e))


@app.post("/accounting/reconcile")
def accounting_reconcile():
    accounting.reconcile()
    return back("/accounting#recon", "Reconciliation updated")


@app.post("/accounting/rate")
def accounting_rate(rate_date: str = Form(...), quote_ccy: str = Form(...), rate: str = Form(...), source: str = Form("manual")):
    from decimal import Decimal, InvalidOperation
    try:
        Decimal(rate)
    except InvalidOperation:
        return back("/accounting#fx", err="invalid rate")
    db.ex("INSERT OR REPLACE INTO exchange_rates(rate_date, base, quote, rate, source) VALUES(?,?,?,?,?)",
          (rate_date, accounting.base_ccy(), quote_ccy.upper(), rate, source))
    audit("human", "fx.add", "exchange_rate", f"{quote_ccy}/{rate_date}", {"rate": rate})
    jobs.enqueue("accounting_post_etsy", {}, actor="human")
    return back("/accounting#fx", "Rate saved (1 unit of the currency = rate in base currency)")


@app.post("/accounting/account")
def accounting_account(code: str = Form(...), name: str = Form(...), type: str = Form(...)):
    try:
        db.ex("INSERT INTO accounts(code, name, type) VALUES(?,?,?)", (code.strip(), name.strip(), type))
        audit("human", "coa.add", "account", code)
        return back("/accounting#coa", "Account added")
    except Exception as e:  # noqa: BLE001
        return back("/accounting#coa", err=str(e))


@app.get("/accounting/export.beancount")
def accounting_export():
    return Response(accounting.to_beancount(), media_type="text/plain",
                    headers={"Content-Disposition": "attachment; filename=etsy-business-os.beancount"})


# ---------------- automation & audit ----------------

@app.get("/automation", response_class=HTMLResponse)
def automation(request: Request):
    state = request.query_params.get("state")
    sql = "SELECT * FROM jobs" + (" WHERE state=?" if state else "") + " ORDER BY id DESC LIMIT 300"
    rows = db.q(sql, (state,) if state else ())
    return page(request, "automation.html", rows=rows, stats=jobs.stats(), state=state)


@app.get("/automation/job/{jid}", response_class=HTMLResponse)
def job_detail(request: Request, jid: int):
    j = jobs.get(jid)
    if not j:
        raise HTTPException(404)
    ev = db.q("SELECT * FROM job_events WHERE job_id=? ORDER BY id", (jid,))
    return page(request, "job.html", j=j, ev=ev)


@app.post("/automation/job/{jid}/{action}")
def job_action(jid: int, action: str):
    if action == "retry":
        jobs.retry_now(jid, "human")
    elif action == "cancel":
        jobs.cancel(jid, "human")
    return back(f"/automation/job/{jid}", f"{action} done")


@app.get("/audit", response_class=HTMLResponse)
def audit_page(request: Request):
    qtxt = request.query_params.get("q", "")
    rows = db.q("SELECT * FROM audit_logs WHERE (?='' OR action LIKE ? OR actor LIKE ? OR entity LIKE ?) ORDER BY id DESC LIMIT 500",
                (qtxt, f"%{qtxt}%", f"%{qtxt}%", f"%{qtxt}%"))
    return page(request, "audit.html", rows=rows, qtxt=qtxt)


# ---------------- brain ----------------

@app.get("/brain", response_class=HTMLResponse)
def brain_page(request: Request):
    notes = brain.list_notes()
    name = request.query_params.get("note") or (notes[0]["name"] if notes else "")
    body = brain.read(name) if name else ""
    return page(request, "brain.html", notes=notes, name=name, body=body, folder=str(brain.path()))


@app.post("/brain/save")
def brain_save(name: str = Form(...), body: str = Form("")):
    try:
        if not name.endswith(".md"):
            name += ".md"
        brain.write(name, body, "human")
        return back(f"/brain?note={quote(name)}", "Saved")
    except Exception as e:  # noqa: BLE001
        return back("/brain", err=str(e))


# ---------------- settings & connections ----------------

@app.get("/settings", response_class=HTMLResponse)
def settings_page(request: Request):
    s = db.settings()
    bench = db.q("SELECT * FROM benchmarks ORDER BY id DESC LIMIT 4")
    conns = {p: ibase.connection(p) for p in ("etsy", "pinterest", "youtube")}
    keys = {"etsy": bool(etsy_api.app_keys().get("keystring")), "pinterest": bool(pin_api.keys().get("client_id")),
            "youtube": bool(yt_api.keys().get("client_id"))}
    boards = []
    if conns["pinterest"]["status"] == "connected" and s["mode"] == "live":
        try:
            boards = pin_api.PinterestClient().boards()
        except Exception:  # noqa: BLE001
            boards = []
    return page(request, "settings.html", s=s, bench=bench, ollama=ai_client.ollama_status(), conns=conns, keys=keys, boards=boards,
                redirects={"etsy": etsy_api.REDIRECT, "pinterest": pin_api.REDIRECT, "youtube": yt_api.REDIRECT},
                versions=db.q("SELECT version, changed_by, created_at FROM system_settings ORDER BY version DESC LIMIT 10"))


@app.post("/settings/mode")
def settings_mode(mode: str = Form(...)):
    if mode not in ("demo", "live"):
        return back("/settings", err="invalid mode")
    db.update_settings({"mode": mode}, "human")
    return back("/settings", f"Mode set to {mode.upper()}")


@app.post("/settings/ai")
def settings_ai(primary_model: str = Form(...), fallback_model: str = Form(...), active_model: str = Form(""),
                ollama_url: str = Form(...), num_ctx: int = Form(8192), idle_unload_seconds: int = Form(120),
                min_tokens_per_sec: float = Form(8.0)):
    db.update_settings({"ai": {"primary_model": primary_model.strip(), "fallback_model": fallback_model.strip(),
                               "active_model": active_model.strip(), "ollama_url": ollama_url.strip().rstrip("/"),
                               "num_ctx": max(2048, min(num_ctx, 32768)), "idle_unload_seconds": max(0, idle_unload_seconds),
                               "min_tokens_per_sec": min_tokens_per_sec}}, "human")
    return back("/settings#ai", "AI settings saved")


@app.post("/settings/ai/benchmark")
def settings_benchmark():
    jid = jobs.enqueue("ai_benchmark", {}, priority=1, actor="human")
    return back("/settings#ai", f"Benchmark started (job #{jid}). It can take a few minutes.")


@app.post("/settings/ai/pull")
def settings_pull(model: str = Form(...)):
    jid = jobs.enqueue("ai_pull", {"model": model.strip()}, priority=1, actor="human")
    return back("/settings#ai", f"Downloading {model} via Ollama (job #{jid}). Large models take a while.")


@app.post("/settings/seo")
def settings_seo(max_title_words: int = Form(...), required_suffix: str = Form(""), banned_words: str = Form(""),
                 tag_count: int = Form(13), min_description_words: int = Form(80), repeat_ignore: str = Form(""),
                 focus_keyword_first: str = Form(""), no_repeated_words: str = Form("")):
    db.update_settings({"seo_rules": {"max_title_words": max_title_words, "required_suffix": required_suffix.strip(),
                                      "banned_words": [w.strip() for w in banned_words.split(",") if w.strip()],
                                      "tag_count": tag_count, "min_description_words": min_description_words,
                                      "repeat_ignore": [w.strip() for w in repeat_ignore.split(",") if w.strip()],
                                      "focus_keyword_first": bool(focus_keyword_first), "no_repeated_words": bool(no_repeated_words)}}, "human")
    return back("/settings#seo", "SEO rules saved as a new rule version")


@app.post("/settings/listing-defaults")
def settings_listing(who_made: str = Form(...), when_made: str = Form(...), taxonomy_id: int = Form(0), quantity: int = Form(999)):
    db.update_settings({"listing_defaults": {"who_made": who_made, "when_made": when_made, "taxonomy_id": taxonomy_id,
                                             "quantity": quantity}}, "human")
    return back("/settings#listing", "Listing defaults saved")


@app.post("/settings/assets")
def settings_assets(folders: str = Form(""), scan_minutes: int = Form(30), marketing_ready_dirname: str = Form("marketing")):
    paths = [p.strip().strip('"') for p in folders.splitlines() if p.strip()]
    bad = [p for p in paths if not Path(p).is_dir()]
    if bad:
        return back("/settings#assets", err=f"folder not found: {bad[0]}")
    data_dir = config.DATA.resolve()
    for p in paths:
        rp = Path(p).resolve()
        if rp == data_dir or data_dir in rp.parents or rp in data_dir.parents:
            return back("/settings#assets", err="asset folders must be separate from the app data folder")
    db.update_settings({"assets": {"folders": paths, "scan_minutes": max(5, scan_minutes),
                                   "marketing_ready_dirname": marketing_ready_dirname.strip() or "marketing"}}, "human")
    return back("/settings#assets", "Asset folders saved (read-only)")


@app.post("/settings/brain")
def settings_brain(path: str = Form("")):
    p = path.strip().strip('"')
    if p and not Path(p).is_dir():
        return back("/settings#brain", err="folder not found")
    db.update_settings({"brain": {"path": p}}, "human")
    brain.ensure_seed()
    return back("/settings#brain", "Brain folder saved")


@app.post("/settings/social")
def settings_social(pin_per_day: int = Form(3), pin_hours: str = Form("9,13,19"), board_id: str = Form(""),
                    yt_per_week: int = Form(2), yt_hours: str = Form("17"), yt_privacy: str = Form("public")):
    def hours(s):
        return sorted({int(h) for h in s.split(",") if h.strip().isdigit() and 0 <= int(h) <= 23}) or [12]
    db.update_settings({"social": {"pinterest": {"posts_per_day": max(0, min(pin_per_day, 25)), "post_hours": hours(pin_hours),
                                                 "board_id": board_id.strip()},
                                   "youtube": {"posts_per_week": max(0, min(yt_per_week, 14)), "post_hours": hours(yt_hours),
                                               "privacy": yt_privacy if yt_privacy in ("public", "unlisted", "private") else "public"}}}, "human")
    return back("/settings#social", "Social settings saved")


@app.post("/settings/keys/{platform}")
def settings_keys(platform: str, key: str = Form(""), secret: str = Form(""), sandbox: str = Form("")):
    if platform == "etsy":
        vault.put("etsy_app", {"keystring": key.strip(), "shared_secret": secret.strip()})
    elif platform == "pinterest":
        vault.put("pinterest_app", {"client_id": key.strip(), "client_secret": secret.strip(), "sandbox": bool(sandbox)})
    elif platform == "youtube":
        vault.put("youtube_app", {"client_id": key.strip(), "client_secret": secret.strip()})
    else:
        raise HTTPException(404)
    audit("human", "credentials.save", "platform", platform)
    return back("/settings#connections", f"{platform} keys saved (encrypted)")


@app.get("/connect/{platform}")
def connect(platform: str):
    try:
        url = {"etsy": etsy_api.authorize_url, "pinterest": pin_api.authorize_url, "youtube": yt_api.authorize_url}[platform]()
    except KeyError:
        raise HTTPException(404)
    except Exception as e:  # noqa: BLE001
        return back("/settings#connections", err=str(e))
    return RedirectResponse(url)


@app.get("/oauth/{platform}/callback")
def oauth_callback(platform: str, code: str = "", state: str = "", error: str = ""):
    if error or not code:
        ibase.set_connection(platform, "error", error=error or "no code")
        return back("/settings#connections", err=f"{platform} authorization cancelled or failed: {error}")
    try:
        {"etsy": etsy_api.handle_callback, "pinterest": pin_api.handle_callback, "youtube": yt_api.handle_callback}[platform](code, state)
        return back("/settings#connections", f"{platform.title()} connected")
    except Exception as e:  # noqa: BLE001
        return back("/settings#connections", err=str(e))


@app.post("/disconnect/{platform}")
def disconnect(platform: str):
    vault.delete(f"{platform}_token")
    ibase.set_connection(platform, "not_connected")
    audit("human", "disconnect", "platform", platform)
    return back("/settings#connections", f"{platform} disconnected")


@app.post("/test/{platform}")
def test_connection(platform: str):
    try:
        if platform == "etsy":
            r = etsy_api.test_connection()
        elif platform == "pinterest":
            r = {"ok": True, "detail": str(pin_api.PinterestClient().me().get("username"))}
        elif platform == "youtube":
            r = {"ok": True, "detail": str(yt_api.YouTubeClient().me().get("title"))}
        elif platform == "ollama":
            st = ai_client.ollama_status()
            r = {"ok": st["ok"], "detail": ", ".join(st["models"]) or st.get("error", "no models")}
        else:
            raise HTTPException(404)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        r = {"ok": False, "detail": str(e)}
    return back("/settings#connections", msg=f"{platform}: OK - {r['detail']}") if r["ok"] else back("/settings#connections", err=f"{platform}: {r['detail']}")


@app.get("/setup", response_class=HTMLResponse)
def setup_guide(request: Request):
    return page(request, "setup.html", redirects={"etsy": etsy_api.REDIRECT, "pinterest": pin_api.REDIRECT, "youtube": yt_api.REDIRECT})


@app.get("/diagnostics", response_class=HTMLResponse)
def diag(request: Request):
    return page(request, "diagnostics.html", text=diagnostics.report(), report_path=str(config.LOGS / "report.txt"))


@app.post("/backup")
def backup_now():
    p = db.backup()
    ok = db.verify_backup(p)
    audit("human", "db.backup", "file", p.name, {"verified": ok})
    return back("/settings#system", f"Backup saved: {p.name} (verified={ok})")


@app.post("/demo/reset")
def demo_reset():
    if db.settings()["mode"] != "demo":
        return back("/settings", err="only in demo mode")
    jid = jobs.enqueue("etsy_sync", {}, priority=1, actor="human")
    return back("/", f"Demo data sync queued (job #{jid})")
