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
    from . import shops as _shops
    shop_rows = []
    for i in _shops.all_info():
        sl = i["slot"]
        rv = _one("SELECT COUNT(*) n, COALESCE(SUM(grandtotal_cents),0) g FROM receipts WHERE slot=? AND is_paid=1 AND substr(created_ts,1,10) BETWEEN ? AND ?", (sl, s, e))
        fees_s = _one("SELECT COALESCE(SUM(amount_cents),0) f FROM etsy_ledger_entries WHERE slot=? AND amount_cents<0 AND lower(ledger_type) NOT LIKE 'disburs%' "
                      "AND lower(ledger_type) NOT LIKE 'refund%' AND substr(created_ts,1,10) BETWEEN ? AND ?", (sl, s, e))
        ls = {r["state"]: r["n"] for r in _q("SELECT state, COUNT(*) n FROM listings WHERE slot=? GROUP BY state", (sl,))}
        shop_rows.append({**i, "revenue": R(rv.get("g")), "orders": rv.get("n", 0), "fees": R(-(fees_s.get("f") or 0)),
                          "profit_est": R((rv.get("g") or 0) + (fees_s.get("f") or 0)), "live": ls.get("active", 0),
                          "pending": ls.get("pending_approval", 0), "drafts": ls.get("etsy_draft", 0), "listings": sum(ls.values()),
                          "series": [{"d": x["d"][5:], "v": R(x["g"])} for x in _q(
                              "SELECT substr(created_ts,1,10) d, SUM(grandtotal_cents) g FROM receipts WHERE slot=? AND is_paid=1 AND substr(created_ts,1,10) BETWEEN ? AND ? GROUP BY d ORDER BY d", (sl, s, e))]})
    for p in pending:
        p["shop"] = _shops.info(_one("SELECT slot FROM listings WHERE id=?", (p["id"],)).get("slot") or 1)["name"]
    return {
        "shops": shop_rows,
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


# ====================================================================== settings through NPCs
# Every setting is owned by one NPC. The HQ shows them as holographic controls; the NPC asks and confirms by voice.

def _shop_fields() -> list[dict]:
    from . import shops
    from .integrations import etsy as etsy_api
    out = []
    for i in shops.all_info():
        s = i["slot"]
        has_keys = bool(etsy_api.app_keys(s).get("keystring"))
        st = {"connected": "TERSAMBUNG", "expired": "LOGIN KEDALUWARSA", "error": "ERROR", "not_connected": "BELUM TERSAMBUNG"}.get(i["status"], i["status"])
        grp = f"TOKO {s}"
        out += [
            {"id": f"shop{s}.name", "group": grp, "type": "text", "label": "Nama toko", "value": i["name"], "ask": f"Mau kasih nama apa untuk toko {s}?"},
            {"id": f"shop{s}.enabled", "group": grp, "type": "toggle", "label": "Aktifkan toko ini", "value": i["enabled"],
             "ask": f"Toko {s} mau diaktifkan?"},
            {"id": f"shop{s}.status", "group": grp, "type": "info", "label": "Etsy",
             "value": f"{st}" + (f" · {i['account']}" if i.get("account") else "") + (f" · {i['last_error'][:80]}" if i.get("last_error") and i["status"] != "connected" else "")},
            {"id": f"shop{s}.keys", "group": grp, "type": "keys", "label": "Etsy API key (keystring + shared secret)",
             "value": "tersimpan ✔" if has_keys else "", "ask": "Masukkan keystring dan shared secret dari developer Etsy. Kalau semua toko pakai satu app, cukup isi di toko 1."},
            {"id": f"shop{s}.connect", "group": grp, "type": "button", "label": "🔗 Sambungkan / login akun Etsy toko ini",
             "ask": f"Login dengan akun Etsy milik toko {s}. Pastikan akunnya beda dengan toko lain."},
            {"id": f"shop{s}.test", "group": grp, "type": "button", "label": "🧪 Tes koneksi"},
            {"id": f"shop{s}.disconnect", "group": grp, "type": "button", "label": "⛔ Putuskan", "confirm": f"Putuskan Etsy toko {s}?"},
        ]
    return out


def settings_state() -> dict:
    from . import shops
    s = db.settings()
    r, ld, a, so = s["seo_rules"], s["listing_defaults"], s["ai"], s["social"]
    shop_opts = [{"v": str(i["slot"]), "t": i["name"]} for i in shops.all_info()]
    prods = [{"v": str(p["id"]), "t": p["name"]} for p in _q("SELECT id, name FROM products ORDER BY name")]
    target_opts = [{"v": "draft", "t": "DRAFT di Etsy (aman untuk tes)"}, {"v": "active", "t": "LANGSUNG LIVE"}]
    F = {
        "KAI-07": _shop_fields(),
        "VOLT-3": [
            {"id": "publish_target", "group": "SETELAH APPROVE", "type": "choice", "label": "Listing dikirim ke Etsy sebagai", "options": target_opts,
             "value": ld.get("publish_target", "draft"), "ask": "Setelah owner approve, listing masuk DRAFT di Etsy atau langsung LIVE?"},
        ] + [{"id": f"shop{i['slot']}.target", "group": "PER TOKO", "type": "choice", "label": i["name"],
              "options": [{"v": "", "t": "Ikut pengaturan umum"}] + target_opts, "value": i["publish_target"] or "",
              "ask": f"Khusus {i['name']}, mau DRAFT atau LIVE?"} for i in shops.all_info()],
        "JUNO-X9": [
            {"id": "gen", "group": "BUAT LISTING BARU", "type": "form", "label": "Tulis listing baru",
             "fields": [{"k": "product_id", "type": "choice", "label": "Produk", "options": prods},
                        {"k": "slot", "type": "choice", "label": "Untuk toko", "options": shop_opts},
                        {"k": "keyword", "type": "text", "label": "Kata kunci (boleh kosong)"}],
             "ask": "Produk mana yang mau saya tulis listingnya, dan untuk toko yang mana?"},
            {"id": "seo.max_title_words", "group": "ATURAN SEO", "type": "number", "label": "Maks. kata di judul", "value": r["max_title_words"], "min": 5, "max": 30},
            {"id": "seo.tag_count", "group": "ATURAN SEO", "type": "number", "label": "Jumlah tag", "value": r.get("tag_count", 13), "min": 1, "max": 13},
            {"id": "seo.min_description_words", "group": "ATURAN SEO", "type": "number", "label": "Min. kata deskripsi", "value": r.get("min_description_words", 80), "min": 20, "max": 1000},
            {"id": "seo.required_suffix", "group": "ATURAN SEO", "type": "text", "label": "Akhiran wajib judul", "value": r.get("required_suffix", "")},
            {"id": "seo.banned_words", "group": "ATURAN SEO", "type": "text", "label": "Kata terlarang (pisah koma)", "value": ", ".join(r.get("banned_words", []))},
            {"id": "ld.quantity", "group": "DEFAULT LISTING", "type": "number", "label": "Stok (quantity)", "value": ld.get("quantity", 999), "min": 1, "max": 999},
            {"id": "ld.taxonomy_id", "group": "DEFAULT LISTING", "type": "number", "label": "Kategori Etsy (taxonomy id)", "value": ld.get("taxonomy_id", 0), "min": 0, "max": 99999},
            {"id": "ld.who_made", "group": "DEFAULT LISTING", "type": "choice", "label": "Siapa pembuatnya", "value": ld.get("who_made"),
             "options": [{"v": "i_did", "t": "Saya sendiri"}, {"v": "someone_else", "t": "Orang lain"}, {"v": "collective", "t": "Tim / kolektif"}]},
        ],
        "SABLE-6": [
            {"id": "assets.folders", "group": "FOLDER PRODUK", "type": "textarea", "label": "Folder file produk (satu per baris)", "value": "\n".join(s["assets"].get("folders", [])),
             "ask": "Di folder mana file denah dan gambar produk disimpan?"},
            {"id": "assets.scan_minutes", "group": "FOLDER PRODUK", "type": "number", "label": "Scan otomatis tiap (menit)", "value": s["assets"].get("scan_minutes", 30), "min": 5, "max": 1440},
            {"id": "assets.scan", "group": "FOLDER PRODUK", "type": "button", "label": "🔍 Scan sekarang"},
            {"id": "brain.path", "group": "OTAK BERSAMA", "type": "text", "label": "Folder catatan (opsional)", "value": s.get("brain", {}).get("path", "")},
        ],
        "HEX-04": [
            {"id": "pin.posts_per_day", "group": "PINTEREST", "type": "number", "label": "Pin per hari", "value": so["pinterest"].get("posts_per_day", 3), "min": 0, "max": 25},
            {"id": "pin.post_hours", "group": "PINTEREST", "type": "text", "label": "Jam posting (mis. 9,13,19)", "value": ",".join(map(str, so["pinterest"].get("post_hours", [])))},
            {"id": "pin.board_id", "group": "PINTEREST", "type": "text", "label": "Board ID", "value": so["pinterest"].get("board_id", "")},
            {"id": "pin.keys", "group": "PINTEREST", "type": "keys", "label": "Pinterest app (client id + secret)", "value": ""},
            {"id": "pin.connect", "group": "PINTEREST", "type": "button", "label": "🔗 Sambungkan Pinterest"},
            {"id": "yt.posts_per_week", "group": "YOUTUBE", "type": "number", "label": "Video per minggu", "value": so["youtube"].get("posts_per_week", 2), "min": 0, "max": 14},
            {"id": "yt.post_hours", "group": "YOUTUBE", "type": "text", "label": "Jam upload", "value": ",".join(map(str, so["youtube"].get("post_hours", [])))},
            {"id": "yt.privacy", "group": "YOUTUBE", "type": "choice", "label": "Privasi", "value": so["youtube"].get("privacy", "public"),
             "options": [{"v": "public", "t": "Publik"}, {"v": "unlisted", "t": "Tidak terdaftar"}, {"v": "private", "t": "Pribadi"}]},
            {"id": "yt.keys", "group": "YOUTUBE", "type": "keys", "label": "YouTube app (client id + secret)", "value": ""},
            {"id": "yt.connect", "group": "YOUTUBE", "type": "button", "label": "🔗 Sambungkan YouTube"},
        ],
        "ORIN-88": [
            {"id": "stats.import", "group": "SHOP STATS ETSY", "type": "upload", "label": "Impor file CSV Shop Stats",
             "options": [{"v": "daily", "t": "Kunjungan harian"}, {"v": "sources", "t": "Sumber trafik"}],
             "ask": "Unduh CSV dari Etsy Shop Stats, lalu serahkan ke saya untuk dihitung konversinya."},
        ],
        "RAZE-11": [
            {"id": "research", "group": "RISET", "type": "form", "label": "Riset kata kunci",
             "fields": [{"k": "keyword", "type": "text", "label": "Kata kunci"}], "ask": "Kata kunci apa yang mau saya riset di Etsy?"},
        ],
        "KADE-12": [
            {"id": "display.idr_per_usd", "group": "MATA UANG", "type": "number", "label": "Kurs: 1 USD = Rp", "value": s.get("display", {}).get("idr_per_usd", 16500),
             "min": 1000, "max": 100000, "ask": "Berapa kurs dolar ke rupiah yang dipakai di laporan?"},
        ],
        "NYX-21": [
            {"id": "etsy.sync", "group": "SINKRON ETSY", "type": "button", "label": "🔄 Sinkronkan semua toko sekarang"},
        ],
        "ZERO-1": [
            {"id": "mode", "group": "MODE", "type": "choice", "label": "Mode aplikasi", "value": s["mode"],
             "options": [{"v": "demo", "t": "DEMO (data contoh, aman)"}, {"v": "live", "t": "LIVE (pakai Etsy asli)"}],
             "ask": "Mau tetap di mode DEMO, atau sudah siap LIVE dengan Etsy asli?", "confirm_value": {"live": "Pindah ke LIVE? Listing yang di-approve akan dikirim ke Etsy asli."}},
            {"id": "ai.ollama_url", "group": "AI · GEMMA", "type": "text", "label": "Alamat Ollama", "value": a.get("ollama_url")},
            {"id": "ai.primary_model", "group": "AI · GEMMA", "type": "text", "label": "Model utama", "value": a.get("primary_model")},
            {"id": "ai.fallback_model", "group": "AI · GEMMA", "type": "text", "label": "Model cadangan", "value": a.get("fallback_model")},
            {"id": "ai.benchmark", "group": "AI · GEMMA", "type": "button", "label": "⚡ Uji kecepatan AI"},
            {"id": "system.backup", "group": "DATA", "type": "button", "label": "💾 Backup database sekarang"},
        ],
    }
    return {"npcs": F}


def _hours(v: str) -> list[int]:
    return sorted({int(h) for h in str(v).split(",") if h.strip().isdigit() and 0 <= int(h) <= 23}) or [12]


def apply_setting(fid: str, value, extra: dict | None = None) -> dict:
    """Validated setter for one holographic control. Returns {"msg", ...}. Raises ValueError with a readable message."""
    import re
    from pathlib import Path
    from . import config, jobs, shops, vault
    from .audit import audit
    from .integrations import base as ibase
    extra = extra or {}
    U = lambda patch: db.update_settings(patch, "human")
    m = re.fullmatch(r"shop([123])\.(\w+)", fid)
    if m:
        s, key = int(m.group(1)), m.group(2)
        if key == "name":
            name = " ".join(str(value).split())[:40]
            if not name:
                raise ValueError("nama tidak boleh kosong")
            U({"shops": {str(s): {"name": name}}})
            return {"msg": f"Toko {s} sekarang bernama {name}."}
        if key == "enabled":
            U({"shops": {str(s): {"enabled": bool(value)}}})
            return {"msg": f"Toko {s} {'diaktifkan' if value else 'dinonaktifkan'}."}
        if key == "target":
            if value not in ("", "draft", "active"):
                raise ValueError("pilihan tidak valid")
            U({"shops": {str(s): {"publish_target": value or None}}})
            return {"msg": f"{shops.info(s)['name']}: " + ({"": "ikut pengaturan umum", "draft": "masuk DRAFT", "active": "langsung LIVE"}[value]) + "."}
        if key == "keys":
            k, sec = str(extra.get("key", "")).strip(), str(extra.get("secret", "")).strip()
            if not k:
                raise ValueError("keystring kosong")
            vault.put(shops.app_key_name(s), {"keystring": k, "shared_secret": sec})
            audit("human", "credentials.save", "platform", shops.platform(s))
            return {"msg": f"API key toko {s} tersimpan terenkripsi."}
        if key == "connect":
            from .integrations import etsy as etsy_api
            return {"msg": "Membuka halaman login Etsy…", "open": etsy_api.authorize_url(s)}
        if key == "test":
            from .integrations import etsy as etsy_api
            if db.settings()["mode"] == "demo":
                return {"msg": f"Mode DEMO: toko {s} memakai toko contoh, tidak ada koneksi asli."}
            r = etsy_api.test_connection(s)
            if not r["ok"]:
                raise ValueError(f"koneksi toko {s} gagal: {r['detail'][:160]}")
            return {"msg": f"Koneksi toko {s} OK."}
        if key == "disconnect":
            vault.delete(shops.token_key(s))
            ibase.set_connection(shops.platform(s), "not_connected")
            audit("human", "disconnect", "platform", shops.platform(s))
            return {"msg": f"Etsy toko {s} diputuskan."}
        raise ValueError("pengaturan tidak dikenal")
    if fid == "publish_target":
        if value not in ("draft", "active"):
            raise ValueError("pilihan tidak valid")
        U({"listing_defaults": {"publish_target": value}})
        return {"msg": "Setelah approve, listing masuk " + ("DRAFT di Etsy, belum tayang." if value == "draft" else "LIVE langsung di Etsy.")}
    num = lambda lo, hi: max(lo, min(hi, int(float(value))))
    if fid.startswith("seo."):
        k = fid[4:]
        if k in ("max_title_words", "tag_count", "min_description_words"):
            v = num(*{"max_title_words": (5, 30), "tag_count": (1, 13), "min_description_words": (20, 1000)}[k])
        elif k == "required_suffix":
            v = str(value).strip()[:40]
        elif k == "banned_words":
            v = [w.strip() for w in str(value).split(",") if w.strip()]
        else:
            raise ValueError("pengaturan tidak dikenal")
        U({"seo_rules": {k: v}})
        return {"msg": "Aturan SEO diperbarui (versi baru)."}
    if fid.startswith("ld."):
        k = fid[3:]
        if k == "quantity":
            v = num(1, 999)
        elif k == "taxonomy_id":
            v = num(0, 99999)
        elif k == "who_made" and value in ("i_did", "someone_else", "collective"):
            v = value
        else:
            raise ValueError("pengaturan tidak dikenal")
        U({"listing_defaults": {k: v}})
        return {"msg": "Default listing disimpan."}
    if fid == "gen":
        from .engines import listings  # noqa: F401 - registers handler
        pid = int(extra.get("product_id") or 0)
        if not db.q1("SELECT 1 FROM products WHERE id=?", (pid,)):
            raise ValueError("pilih produk dulu")
        slot = shops.norm(extra.get("slot") or 1)
        jid = jobs.enqueue("listing_generate", {"product_id": pid, "keyword": str(extra.get("keyword", "")).strip(), "slot": slot}, actor="human")
        audit("human", "listing.generate_request", "product", pid, {"job": jid, "slot": slot})
        return {"msg": f"Siap, saya tulis listingnya untuk {shops.info(slot)['name']}. Nanti muncul di QA BAY."}
    if fid == "assets.folders":
        paths = [p.strip().strip('"') for p in re.split(r"[\n;]", str(value)) if p.strip()]
        bad = [p for p in paths if not Path(p).is_dir()]
        if bad:
            raise ValueError(f"folder tidak ditemukan: {bad[0]}")
        data_dir = config.DATA.resolve()
        for p in paths:
            rp = Path(p).resolve()
            if rp == data_dir or data_dir in rp.parents or rp in data_dir.parents:
                raise ValueError("folder produk harus terpisah dari folder data aplikasi")
        U({"assets": {"folders": paths}})
        return {"msg": f"{len(paths)} folder produk disimpan (hanya dibaca, tidak diubah)."}
    if fid == "assets.scan_minutes":
        U({"assets": {"scan_minutes": num(5, 1440)}})
        return {"msg": "Jadwal scan disimpan."}
    if fid == "assets.scan":
        from .engines import assets
        if not assets.roots():
            raise ValueError("isi folder produk dulu")
        return {"msg": f"Scan dimulai (job #{jobs.enqueue('asset_scan', {}, priority=1, actor='human')})."}
    if fid == "brain.path":
        p = str(value).strip().strip('"')
        if p and not Path(p).is_dir():
            raise ValueError("folder tidak ditemukan")
        U({"brain": {"path": p}})
        from . import brain
        brain.ensure_seed()
        return {"msg": "Folder catatan disimpan."}
    if fid.startswith(("pin.", "yt.")):
        plat, k = ("pinterest", fid[4:]) if fid.startswith("pin.") else ("youtube", fid[3:])
        if k == "keys":
            key, sec = str(extra.get("key", "")).strip(), str(extra.get("secret", "")).strip()
            if not key:
                raise ValueError("client id kosong")
            vault.put(f"{plat}_app", {"client_id": key, "client_secret": sec})
            audit("human", "credentials.save", "platform", plat)
            return {"msg": f"Kunci {plat} tersimpan terenkripsi."}
        if k == "connect":
            from .integrations import pinterest as pin_api, youtube as yt_api
            return {"msg": f"Membuka login {plat}…", "open": (pin_api if plat == "pinterest" else yt_api).authorize_url()}
        if k == "posts_per_day":
            v = num(0, 25)
        elif k == "posts_per_week":
            v = num(0, 14)
        elif k == "post_hours":
            v = _hours(value)
        elif k == "board_id":
            v = str(value).strip()
        elif k == "privacy" and value in ("public", "unlisted", "private"):
            v = value
        else:
            raise ValueError("pengaturan tidak dikenal")
        U({"social": {plat: {k: v}}})
        return {"msg": f"Jadwal {plat} disimpan."}
    if fid == "research":
        kw = str(extra.get("keyword", "")).strip()
        if not kw:
            raise ValueError("isi kata kunci")
        from .engines import research  # noqa: F401
        return {"msg": f"Meriset '{kw}' di Etsy (job #{jobs.enqueue('research_keyword', {'keyword': kw, 'pages': 2}, priority=2, actor='human')})."}
    if fid == "display.idr_per_usd":
        U({"display": {"idr_per_usd": num(1000, 100000)}})
        return {"msg": f"Kurs dipakai: 1 USD = Rp {num(1000, 100000):,}".replace(",", ".") + "."}
    if fid == "etsy.sync":
        from .engines import etsy_sync  # noqa: F401
        ids = [jobs.enqueue("etsy_sync", {"slot": s}, priority=1, actor="human") for s in (shops.active_slots() or [1])]
        return {"msg": f"Sinkron {len(ids)} toko dimulai."}
    if fid == "mode":
        if value not in ("demo", "live"):
            raise ValueError("mode tidak valid")
        U({"mode": value})
        return {"msg": "Mode " + ("DEMO: semua data contoh." if value == "demo" else "LIVE: terhubung ke Etsy asli.")}
    if fid.startswith("ai."):
        k = fid[3:]
        if k == "benchmark":
            return {"msg": f"Uji kecepatan AI dimulai (job #{jobs.enqueue('ai_benchmark', {}, priority=1, actor='human')})."}
        if k not in ("ollama_url", "primary_model", "fallback_model"):
            raise ValueError("pengaturan tidak dikenal")
        v = str(value).strip().rstrip("/")
        if not v:
            raise ValueError("tidak boleh kosong")
        U({"ai": {k: v}})
        return {"msg": "Pengaturan AI disimpan."}
    if fid == "system.backup":
        p = db.backup()
        ok = db.verify_backup(p)
        audit("human", "db.backup", "file", p.name, {"verified": ok})
        return {"msg": f"Backup tersimpan: {p.name}" + (" (terverifikasi)." if ok else " (GAGAL verifikasi!).")}
    raise ValueError("pengaturan tidak dikenal")


# ====================================================================== approval through holograms

def listing_detail(lid: int) -> dict:
    from . import shops
    from .engines import listings
    cur = listings.current(lid)
    l, c = cur["listing"], cur["content"]
    rate, _ = idr_rate()
    ids = list(c.get("images") or [])
    imgs = [{"id": a["id"], "name": a["rel_path"]} for a in _q(f"SELECT id, rel_path FROM social_assets WHERE kind='image' AND id IN ({','.join('?' * len(ids)) or 'NULL'})", ids)]
    files = list(c.get("files") or [])
    fnames = [a["rel_path"] for a in _q(f"SELECT rel_path FROM social_assets WHERE id IN ({','.join('?' * len(files)) or 'NULL'})", files)]
    checks = [{"ok": x["ok"], "msg": x["msg"], "sev": x.get("severity")} for x in (cur["validation"].get("checks") or [])]
    hist = _q("SELECT decision, note, decided_by, created_at FROM listing_approvals WHERE listing_id=? ORDER BY id DESC LIMIT 5", (lid,))
    va = listings.valid_approval(lid)
    price = float(c.get("price_usd") or 0)
    return {"id": lid, "state": l["state"], "slot": l["slot"] or 1, "shop": shops.info(l["slot"] or 1)["name"], "etsy_id": l["etsy_listing_id"],
            "url": l["url"], "error": l["last_error"], "title": c.get("title", ""), "description": c.get("description", ""), "tags": c.get("tags", []),
            "focus": c.get("focus_keyword", ""), "price_usd": price, "price_idr": int(round(price * rate)), "price_reason": c.get("price_reasoning", ""),
            "images": imgs, "files": fnames, "video": bool(c.get("video")), "valid": bool(cur["validation"].get("ok")), "checks": checks,
            "history": hist, "approved": bool(va), "target": shops.publish_target(l["slot"] or 1),
            "can_change_shop": not l["etsy_listing_id"] and l["state"] not in ("publishing", "approved"),
            "shops": [{"v": i["slot"], "t": i["name"]} for i in shops.all_info()]}


def listing_queue() -> list[dict]:
    from . import shops
    rows = _q("SELECT id, title, state, slot, updated_at FROM listings WHERE state IN ('pending_approval','draft','revision_requested','approved','publishing','etsy_draft','failed') "
              "AND current_version_id IS NOT NULL ORDER BY CASE state WHEN 'pending_approval' THEN 0 WHEN 'etsy_draft' THEN 1 ELSE 2 END, updated_at DESC LIMIT 30")
    for r in rows:
        r["shop"] = shops.info(r["slot"] or 1)["name"]
    return rows
