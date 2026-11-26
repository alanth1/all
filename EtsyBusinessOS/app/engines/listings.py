"""Listing workflow (PRD 5.6/5.7):
Product -> understanding -> research -> SEO generation -> asset matching -> validation -> draft
-> HUMAN APPROVAL -> publish -> verification. Every change creates a new version; approvals are bound
to (version, content hash) so any edit after approval invalidates it automatically."""
from __future__ import annotations

from pathlib import Path

from .. import db
from ..ai.runner import run_task
from ..audit import audit, notify
from ..integrations import providers
from ..jobs import Fatal, enqueue, handler
from ..permissions import check
from ..util import dumps, loads, now, sha256_text
from . import seo

CONTENT_KEYS = ("focus_keyword", "title", "description", "secondary_keywords", "tags", "category_suggestion", "attributes",
                "price_usd", "price_reasoning", "positioning", "images", "files", "video", "taxonomy_id")


def content_hash(content: dict) -> str:
    return sha256_text(dumps({k: content.get(k) for k in CONTENT_KEYS}))


def product_facts(product_id: int) -> dict:
    p = db.q1("SELECT * FROM products WHERE id=?", (product_id,))
    assets = db.q("SELECT id, kind, rel_path, text_excerpt, pages, width, height, duration_s, compat, size_bytes, meta "
                  "FROM social_assets WHERE product_id=? AND missing=0", (product_id,))
    text = " ".join((a["text_excerpt"] or "")[:1500] for a in assets if a["kind"] in ("pdf", "text"))
    stored = loads(p["facts"], {}) if p else {}
    return {"product": dict(p) if p else {}, "assets": [dict(a) for a in assets], "text": text[:3000],
            "numbers": stored.get("numbers", {}), "notes": stored.get("notes", "")}


def research_context(query: str) -> dict:
    k = db.q1("SELECT kh.* FROM keyword_history kh JOIN keywords k ON k.id=kh.keyword_id WHERE k.keyword=? "
              "ORDER BY kh.id DESC LIMIT 1", (query.lower(),))
    if not k:
        return {}
    return {"keyword": query, "listing_count": k["listing_count"], "median_price_usd": (k["median_price_cents"] or 0) / 100,
            "avg_price_usd": (k["avg_price_cents"] or 0) / 100, "label": k["label"], "source": k["source"]}


def match_assets(facts: dict) -> dict:
    images, files, video = [], [], None
    for a in facts["assets"]:
        c = loads(a["compat"], {})
        if a["kind"] == "image" and c.get("etsy_listing_image"):
            images.append(a["id"])
        elif a["kind"] == "pdf" and c.get("etsy_digital_file"):
            files.append(a["id"])
        elif a["kind"] == "video" and c.get("etsy_listing_video") and video is None:
            video = a["id"]
    return {"images": images[:10], "files": files[:5], "video": video}


def asset_summary(content: dict) -> dict:
    errs = []
    for aid in content.get("files", []):
        a = db.q1("SELECT rel_path, meta, missing FROM social_assets WHERE id=?", (aid,))
        if not a or a["missing"]:
            errs.append(f"file asset {aid} missing")
        elif loads(a["meta"], {}).get("error"):
            errs.append(f"{a['rel_path']} unreadable: {loads(a['meta'], {})['error']}")
    video_bad = ""
    if content.get("video"):
        v = db.q1("SELECT compat FROM social_assets WHERE id=?", (content["video"],))
        if not v or not loads(v["compat"], {}).get("etsy_listing_video"):
            video_bad = "selected video is not Etsy compatible (5-15 s, <=100 MB)"
    return {"images": len(content.get("images", [])), "files": len(content.get("files", [])), "file_errors": errs,
            "video_bad": video_bad}


def validate(content: dict, product_id: int | None) -> dict:
    facts = product_facts(product_id) if product_id else {}
    rc = research_context(content.get("focus_keyword", ""))
    if rc.get("median_price_usd"):
        facts["price_range"] = (round(rc["median_price_usd"] * 0.4, 2), round(rc["median_price_usd"] * 2.5, 2))
    return seo.validate_listing(content, facts, asset_summary(content))


def save_version(listing_id: int, content: dict, source: str) -> int:
    row = db.q1("SELECT product_id FROM listings WHERE id=?", (listing_id,))
    validation = validate(content, row["product_id"] if row else None)
    with db.tx():
        v = (db.q1("SELECT MAX(version) v FROM listing_versions WHERE listing_id=?", (listing_id,))["v"] or 0) + 1
        vid = db.ex("INSERT INTO listing_versions(listing_id, version, content, content_hash, validation, source, created_at) "
                    "VALUES(?,?,?,?,?,?,?)", (listing_id, v, dumps(content), content_hash(content), dumps(validation), source, now()))
        # Any new version invalidates earlier approvals (PRD 5.7)
        db.ex("UPDATE listing_approvals SET valid=0 WHERE listing_id=? AND valid=1", (listing_id,))
        db.ex("UPDATE listings SET current_version_id=?, title=?, price_cents=?, state=?, updated_at=? WHERE id=?",
              (vid, content.get("title"), int(round(float(content.get("price_usd") or 0) * 100)),
               "pending_approval" if validation["ok"] else "draft", now(), listing_id))
    return vid


def current(listing_id: int) -> dict:
    l = db.q1("SELECT * FROM listings WHERE id=?", (listing_id,))
    if not l:
        raise KeyError(listing_id)
    v = db.q1("SELECT * FROM listing_versions WHERE id=?", (l["current_version_id"],)) if l["current_version_id"] else None
    appr = db.q1("SELECT * FROM listing_approvals WHERE listing_id=? ORDER BY id DESC LIMIT 1", (listing_id,))
    return {"listing": dict(l), "version": dict(v) if v else None, "content": loads(v["content"], {}) if v else {},
            "validation": loads(v["validation"], {}) if v else {}, "approval": dict(appr) if appr else None}


def edit(listing_id: int, patch: dict, actor: str = "human") -> int:
    cur = current(listing_id)
    if cur["listing"]["state"] in ("publishing",):
        raise ValueError("listing is being published; wait until it finishes")
    content = {**cur["content"], **patch}
    vid = save_version(listing_id, content, actor)
    audit(actor, "listing.edit", "listing", listing_id, {"version_id": vid, "fields": sorted(patch.keys())})
    return vid


def decide(listing_id: int, decision: str, note: str = "", actor: str = "human") -> dict:
    """Human decision. Only actor='human' can approve - AI requests are refused by the permission layer."""
    if decision not in ("approve", "reject", "request_revision"):
        raise ValueError("invalid decision")
    if actor != "human" or check("human", "etsy_publishing") != "allow":
        raise PermissionError("only the owner can decide on listings")
    cur = current(listing_id)
    v = cur["version"]
    if not v:
        raise ValueError("listing has no content")
    if decision == "approve" and not cur["validation"].get("ok"):
        raise ValueError("listing does not pass validation - fix the errors first")
    with db.tx():
        db.ex("UPDATE listing_approvals SET valid=0 WHERE listing_id=? AND valid=1", (listing_id,))
        aid = db.ex("INSERT INTO listing_approvals(listing_id, version_id, content_hash, decision, note, decided_by, valid, created_at) "
                    "VALUES(?,?,?,?,?,?,1,?)", (listing_id, v["id"], v["content_hash"], decision, note, actor, now()))
        state = {"approve": "approved", "reject": "rejected", "request_revision": "revision_requested"}[decision]
        db.ex("UPDATE listings SET state=?, updated_at=? WHERE id=?", (state, now(), listing_id))
    audit(actor, f"listing.{decision}", "listing", listing_id, {"version": v["version"], "hash": v["content_hash"][:12], "note": note})
    job_id = None
    if decision == "approve":
        job_id = enqueue("etsy_publish", {"listing_id": listing_id, "version_id": v["id"]},
                         idempotency_key=f"publish:{listing_id}:{v['id']}", priority=2, actor=actor)
    elif decision == "request_revision":
        p = cur["listing"]["product_id"]
        enqueue("listing_generate", {"product_id": p, "listing_id": listing_id, "revision_note": note},
                idempotency_key=f"revise:{listing_id}:{aid}", actor=actor)
    return {"approval_id": aid, "job_id": job_id}


def valid_approval(listing_id: int) -> dict | None:
    cur = current(listing_id)
    a = db.q1("SELECT * FROM listing_approvals WHERE listing_id=? AND valid=1 AND decision='approve' ORDER BY id DESC LIMIT 1",
              (listing_id,))
    if not a or not cur["version"]:
        return None
    if a["version_id"] != cur["version"]["id"] or a["content_hash"] != cur["version"]["content_hash"]:
        return None
    if content_hash(cur["content"]) != a["content_hash"]:
        return None
    return dict(a)


# ---------------- jobs ----------------

@handler("listing_generate", lane="ai", agent="JUNO-X9", max_attempts=3)
def job_generate(payload, job):
    product_id = payload["product_id"]
    facts = product_facts(product_id)
    if not facts["product"]:
        raise Fatal(f"product {product_id} not found")
    name = facts["product"]["name"]
    research = research_context(payload.get("keyword") or name)
    assets = match_assets(facts)
    note = payload.get("revision_note", "")
    data = {"product_name": name, "product_text_from_pdf": facts["text"], "known_numbers": facts["numbers"],
            "owner_notes": facts["notes"], "research": research, "revision_request": note,
            "available_assets": [{"id": a["id"], "kind": a["kind"], "file": a["rel_path"]} for a in facts["assets"]][:40],
            "rules": seo.rules()}
    instructions = ("Create a complete Etsy listing for this digital product. Follow every rule in 'rules'. "
                    "Use ONLY facts from the data. Title: start with focus keyword, end with the required suffix. "
                    "Exactly the required number of tags. If research is empty, give price_suggestion_usd=null.")

    def extra(obj: seo.ListingDraft):
        c = _to_content(obj, assets)
        res = seo.validate_listing(c, facts, None)
        return [f"{x['id']}: {x['msg']}" for x in res["checks"] if not x["ok"] and x["severity"] == "error" and x["id"] != "price"]

    draft, meta = run_task("listing_generate", "SEO Writer", instructions, data, seo.ListingDraft,
                           demo=lambda: seo.demo_draft(name, facts["text"], research), job_id=job["id"], extra_check=extra)
    content = _to_content(draft, assets)
    if content.get("price_usd") is None:
        content["price_usd"] = 0
    listing_id = payload.get("listing_id")
    if not listing_id:
        from ..shops import norm
        listing_id = db.ex("INSERT INTO listings(product_id, slot, state, created_at, updated_at) VALUES(?,?,?,?,?)",
                           (product_id, norm(payload.get("slot", 1)), "draft", now(), now()))
    vid = save_version(listing_id, content, f"ai:{meta['model']}")
    audit("ai:JUNO-X9", "listing.generate", "listing", listing_id, {"version_id": vid, "model": meta["model"], "demo": meta["demo"]})
    cur = current(listing_id)
    if cur["validation"]["ok"]:
        notify("info", "Listing ready for approval", cur["content"].get("title", ""), f"/approvals/{listing_id}")
    else:
        notify("warning", "Listing needs fixes before approval", cur["content"].get("title", ""), f"/approvals/{listing_id}")
    return {"listing_id": listing_id, "version_id": vid, "valid": cur["validation"]["ok"]}


def _to_content(d: seo.ListingDraft, assets: dict) -> dict:
    tags = []
    for t in d.tags:
        t = " ".join(t.strip().split())
        if t and t.lower() not in [x.lower() for x in tags]:
            tags.append(t)
    return {"focus_keyword": d.focus_keyword.strip(), "title": " ".join(d.title.split()), "description": d.description.strip(),
            "secondary_keywords": d.secondary_keywords, "tags": tags, "category_suggestion": d.category_suggestion,
            "attributes": d.attributes, "price_usd": d.price_suggestion_usd, "price_reasoning": d.price_reasoning,
            "positioning": d.positioning,
            "images": [i for i in d.image_choices if i in assets["images"]] or assets["images"],
            "files": [i for i in d.file_choices if i in assets["files"]] or assets["files"],
            "video": d.video_choice if d.video_choice == assets["video"] else assets["video"],
            "taxonomy_id": db.settings()["listing_defaults"].get("taxonomy_id") or None}


@handler("etsy_publish", lane="io", agent="NYX-21", max_attempts=5)
def job_publish(payload, job):
    listing_id = payload["listing_id"]
    appr = valid_approval(listing_id)
    if not appr or appr["version_id"] != payload["version_id"]:
        db.ex("UPDATE listings SET state='pending_approval', updated_at=? WHERE id=? AND state IN ('approved','publishing')", (now(), listing_id))
        audit("system", "listing.publish_blocked", "listing", listing_id, {"reason": "no valid approval for this version"}, outcome="denied")
        raise Fatal("publishing blocked: the approved version is no longer current (listing changed after approval)")
    cur = current(listing_id)
    c = cur["content"]
    l = cur["listing"]
    from ..shops import publish_target
    slot = l["slot"] or 1
    client = providers.etsy(slot)
    shop = providers.etsy_shop_id(slot)
    d = db.settings()["listing_defaults"]
    if l["etsy_listing_id"]:
        # safety: the Etsy listing must belong to this shop, otherwise never touch it
        owner = str((client.get_listing(l["etsy_listing_id"]) or {}).get("shop_id") or "")
        if owner and owner != str(shop):
            audit("system", "etsy.shop_mismatch", "listing", listing_id, {"slot": slot, "expected": shop, "found": owner}, outcome="denied")
            raise Fatal(f"listing ini milik toko Etsy lain ({owner}), bukan Toko {slot} - publish dibatalkan")
    db.ex("UPDATE listings SET state='publishing', updated_at=? WHERE id=?", (now(), listing_id))
    etsy_id = l["etsy_listing_id"]
    if not etsy_id:
        if not c.get("taxonomy_id") and not providers.is_demo():
            raise Fatal("taxonomy_id missing: set a default category (Settings > Listing defaults) or edit the listing")
        fields = {"quantity": d["quantity"], "title": c["title"], "description": c["description"], "price": f"{float(c['price_usd']):.2f}",
                  "who_made": d["who_made"], "when_made": d["when_made"], "taxonomy_id": c.get("taxonomy_id") or 0,
                  "type": d["type"], "is_supply": str(bool(d["is_supply"])).lower(), "tags": ",".join(c["tags"])}
        res = client.create_draft(shop, fields)
        etsy_id = str(res["listing_id"])
        db.ex("UPDATE listings SET etsy_listing_id=?, updated_at=? WHERE id=?", (etsy_id, now(), listing_id))
        audit("system", "etsy.create_draft", "listing", listing_id, {"etsy_listing_id": etsy_id})
    # uploads (idempotent: skip what is already uploaded)
    for rank, aid in enumerate(c.get("images", []), start=1):
        if db.q1("SELECT 1 FROM listing_images WHERE listing_id=? AND asset_id=? AND etsy_image_id IS NOT NULL", (listing_id, aid)):
            continue
        a = db.q1("SELECT path FROM social_assets WHERE id=?", (aid,))
        r = client.upload_image(shop, etsy_id, Path(a["path"]), rank)
        db.ex("INSERT INTO listing_images(listing_id, asset_id, rank, etsy_image_id, uploaded_at) VALUES(?,?,?,?,?)",
              (listing_id, aid, rank, str(r.get("listing_image_id")), now()))
    for rank, aid in enumerate(c.get("files", []), start=1):
        if db.q1("SELECT 1 FROM listing_files WHERE listing_id=? AND asset_id=? AND etsy_file_id IS NOT NULL", (listing_id, aid)):
            continue
        a = db.q1("SELECT path FROM social_assets WHERE id=?", (aid,))
        r = client.upload_file(shop, etsy_id, Path(a["path"]), rank)
        db.ex("INSERT INTO listing_files(listing_id, asset_id, etsy_file_id, uploaded_at) VALUES(?,?,?,?)",
              (listing_id, aid, str(r.get("listing_file_id")), now()))
    if c.get("video") and not db.q1("SELECT 1 FROM listing_videos WHERE listing_id=? AND etsy_video_id IS NOT NULL", (listing_id,)):
        a = db.q1("SELECT path FROM social_assets WHERE id=?", (c["video"],))
        r = client.upload_video(shop, etsy_id, Path(a["path"]))
        db.ex("INSERT INTO listing_videos(listing_id, asset_id, etsy_video_id, uploaded_at) VALUES(?,?,?,?)",
              (listing_id, c["video"], str(r.get("video_id")), now()))
    # existing listing edited after approval -> push latest approved content
    if l["etsy_listing_id"]:
        client.update_listing(shop, etsy_id, {"title": c["title"], "description": c["description"], "tags": ",".join(c["tags"]),
                                              "price": f"{float(c['price_usd']):.2f}"})
    target = payload.get("target") or publish_target(slot)
    if target == "draft":
        url = f"https://www.etsy.com/your/shops/me/listing-editor/edit/{etsy_id}"
        db.ex("UPDATE listings SET state='etsy_draft', url=?, updated_at=?, last_error=NULL WHERE id=?", (url, now(), listing_id))
        audit("system", "etsy.draft_ready", "listing", listing_id, {"etsy_listing_id": etsy_id, "approval_id": appr["id"]})
        notify("success", "Draft created on Etsy (not live)", c["title"], url)
        return {"_state": "DONE", "etsy_listing_id": etsy_id, "url": url, "target": "draft", "slot": slot}
    client.update_listing(shop, etsy_id, {"state": "active"})
    # verification
    live = [x for x in client.shop_listings(shop, "active") if str(x["listing_id"]) == etsy_id]
    if not live:
        from ..jobs import RetryLater
        raise RetryLater("listing not visible as active yet - will verify again", 120)
    url = live[0].get("url")
    db.ex("UPDATE listings SET state='active', url=?, updated_at=?, last_error=NULL WHERE id=?", (url, now(), listing_id))
    audit("system", "etsy.publish_verified", "listing", listing_id, {"etsy_listing_id": etsy_id, "url": url,
                                                                      "approval_id": appr["id"]})
    notify("success", "Listing published on Etsy", c["title"], url or "")
    return {"_state": "PUBLISHED", "etsy_listing_id": etsy_id, "url": url}


@handler("approval_reminder", lane="io", agent="KAI-07", max_attempts=1)
def job_reminder(payload, job):
    rows = db.q("SELECT id, title, updated_at FROM listings WHERE state='pending_approval' AND updated_at < strftime('%Y-%m-%dT%H:%M:%S','now','-2 day')")
    for r in rows:
        notify("warning", "Listing waiting for your approval", f"{r['title']} (since {r['updated_at'][:10]})", f"/approvals/{r['id']}")
    return {"reminded": len(rows)}
