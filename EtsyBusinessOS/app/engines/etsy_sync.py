"""Etsy Shop Management sync (PRD module 03): shop, listings, receipts/orders, payments, ledger."""
from __future__ import annotations

import time

from .. import db
from ..audit import audit
from ..integrations import providers
from ..jobs import enqueue, handler
from ..util import dumps, money_obj_cents, now, today, ts_to_iso

STATE_MAP = {"active": "active", "draft": "draft", "expired": "expired", "inactive": "inactive", "sold_out": "sold_out",
             "edit": "inactive", "removed": "deactivated"}


@handler("etsy_sync", lane="io", agent="Etta", max_attempts=5)
def job_sync(payload, job):
    client = providers.etsy()
    sid = providers.etsy_shop_id()
    shop = client.get_shop(sid)
    tag = providers.source_tag()
    db.ex("INSERT INTO shops(etsy_shop_id, name, currency, url, raw, synced_at) VALUES(?,?,?,?,?,?) "
          "ON CONFLICT(etsy_shop_id) DO UPDATE SET name=excluded.name, currency=excluded.currency, url=excluded.url, raw=excluded.raw, synced_at=excluded.synced_at",
          (str(sid), shop.get("shop_name", ""), shop.get("currency_code"), shop.get("url"), dumps(shop), now()))
    shop_row = db.q1("SELECT id FROM shops WHERE etsy_shop_id=?", (str(sid),))
    db.ex("INSERT INTO shop_profiles(shop_id, title, announcement, raw, captured_at) VALUES(?,?,?,?,?)",
          (shop_row["id"], shop.get("title"), shop.get("announcement"), dumps({"source": tag}), now()))
    n_l = sync_listings(client, sid, shop_row["id"])
    n_r = sync_receipts(client, sid)
    n_e = sync_ledger(client, sid)
    enqueue("accounting_post_etsy", {}, idempotency_key=f"post-etsy:{job['id']}", parent_id=job["id"])
    audit("system", "etsy.sync", "shop", sid, {"listings": n_l, "receipts": n_r, "ledger": n_e, "source": tag})
    return {"listings": n_l, "receipts": n_r, "ledger_entries": n_e}


def sync_listings(client, sid, shop_db_id) -> int:
    n = 0
    tag = providers.source_tag()
    for state in ("active", "draft", "expired", "inactive"):
        try:
            items = client.shop_listings(sid, state)
        except Exception:  # noqa: BLE001 - some states may not be permitted by scope
            if state == "active":
                raise
            continue
        for x in items:
            lid = str(x["listing_id"])
            st = STATE_MAP.get(x.get("state", state), "inactive")
            row = db.q1("SELECT id, state FROM listings WHERE etsy_listing_id=?", (lid,))
            price = money_obj_cents(x.get("price"))
            if row:
                # Etsy is the source of truth for live state, but never override local workflow states
                keep = row["state"] in ("pending_approval", "approved", "publishing", "revision_requested")
                db.ex("UPDATE listings SET state=?, title=COALESCE(title, ?), url=?, views=?, num_favorers=?, raw=?, updated_at=? WHERE id=?",
                      (row["state"] if keep else st, x.get("title"), x.get("url"), x.get("views"), x.get("num_favorers"),
                       dumps({"source": tag, "tags": x.get("tags")}), now(), row["id"]))
            else:
                db.ex("INSERT INTO listings(shop_id, etsy_listing_id, state, title, price_cents, currency, url, views, num_favorers, raw, created_at, updated_at) "
                      "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (shop_db_id, lid, st, x.get("title"), price, (x.get("price") or {}).get("currency_code"),
                                                         x.get("url"), x.get("views"), x.get("num_favorers"),
                                                         dumps({"source": tag, "tags": x.get("tags")}), now(), now()))
            db.ex("INSERT OR IGNORE INTO listing_metrics(etsy_listing_id, captured_on, views, num_favorers, price_cents, source) VALUES(?,?,?,?,?,?)",
                  (lid, today(), x.get("views"), x.get("num_favorers"), price, tag))
            n += 1
    return n


def sync_receipts(client, sid) -> int:
    last = db.q1("SELECT MAX(created_ts) t FROM receipts")["t"]
    min_created = None
    if last:
        from datetime import datetime
        min_created = int(datetime.fromisoformat(last).timestamp()) - 7 * 86400  # overlap to catch refunds/updates
    tag = providers.source_tag()
    n = 0
    for r in client.receipts(sid, min_created):
        refunded = sum(money_obj_cents(x.get("amount")) for x in r.get("refunds") or [])
        vals = (ts_to_iso(r["created_timestamp"]), r.get("status"), money_obj_cents(r.get("grandtotal")), money_obj_cents(r.get("subtotal")),
                money_obj_cents(r.get("total_shipping_cost")), money_obj_cents(r.get("total_tax_cost")), money_obj_cents(r.get("discount_amt")),
                (r.get("grandtotal") or {}).get("currency_code", "USD"), 1 if r.get("is_paid") else 0, refunded, r.get("country_iso"),
                dumps({"source": tag}), tag, now())
        row = db.q1("SELECT id FROM receipts WHERE etsy_receipt_id=?", (str(r["receipt_id"]),))
        if row:
            db.ex("UPDATE receipts SET created_ts=?, status=?, grandtotal_cents=?, subtotal_cents=?, shipping_cents=?, tax_cents=?, discount_cents=?, "
                  "currency=?, is_paid=?, refunded_cents=?, buyer_country=?, raw=?, source=?, synced_at=? WHERE id=?", vals + (row["id"],))
            rid = row["id"]
        else:
            rid = db.ex("INSERT INTO receipts(created_ts, status, grandtotal_cents, subtotal_cents, shipping_cents, tax_cents, discount_cents, currency, "
                        "is_paid, refunded_cents, buyer_country, raw, source, synced_at, etsy_receipt_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        vals + (str(r["receipt_id"]),))
        for t in r.get("transactions") or []:
            db.ex("INSERT OR IGNORE INTO receipt_items(receipt_id, etsy_transaction_id, etsy_listing_id, title, quantity, price_cents, currency) VALUES(?,?,?,?,?,?,?)",
                  (rid, str(t["transaction_id"]), str(t.get("listing_id")), t.get("title"), t.get("quantity", 1),
                   money_obj_cents(t.get("price")), (t.get("price") or {}).get("currency_code", "USD")))
        for p in client.receipt_payments(sid, r["receipt_id"]) if not providers.is_demo() else []:
            db.ex("INSERT OR IGNORE INTO payments(etsy_payment_id, etsy_receipt_id, amount_gross_cents, amount_fees_cents, amount_net_cents, currency, created_ts, raw, synced_at) "
                  "VALUES(?,?,?,?,?,?,?,?,?)", (str(p.get("payment_id")), str(r["receipt_id"]), money_obj_cents(p.get("amount_gross")),
                                               money_obj_cents(p.get("amount_fees")), money_obj_cents(p.get("amount_net")),
                                               (p.get("amount_gross") or {}).get("currency_code"), ts_to_iso(p.get("create_timestamp") or r["created_timestamp"]),
                                               dumps({"source": tag}), now()))
        n += 1
    return n


def sync_ledger(client, sid) -> int:
    last = db.q1("SELECT MAX(created_ts) t FROM etsy_ledger_entries")["t"]
    end = int(time.time())
    if last:
        from datetime import datetime
        start = int(datetime.fromisoformat(last).timestamp()) - 86400
    else:
        start = end - 90 * 86400
    tag = providers.source_tag()
    n = 0
    # API requires windows; use 30-day windows
    t = start
    while t < end:
        t2 = min(end, t + 30 * 86400)
        for e in client.ledger(sid, t, t2):
            db.ex("INSERT OR IGNORE INTO etsy_ledger_entries(etsy_entry_id, created_ts, ledger_type, description, amount_cents, balance_cents, currency, reference_id, raw, source, synced_at) "
                  "VALUES(?,?,?,?,?,?,?,?,?,?,?)", (str(e["entry_id"]), ts_to_iso(e.get("create_date") or e.get("created_timestamp")),
                                                   e.get("ledger_type"), e.get("description"), int(e.get("amount", 0)), e.get("balance"),
                                                   e.get("currency", "USD"), str(e.get("reference_id") or ""), dumps({"source": tag}), tag, now()))
            n += 1
        t = t2
    return n
