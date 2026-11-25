"""Deterministic demo data shaped like real API responses. Used ONLY in demo mode; every record
created from it is stored with source='demo' so it is never mixed up with live data."""
from __future__ import annotations

import random
import time
from pathlib import Path

DEMO_SHOP_ID = "99999999"
_BASE = int(time.time() // 86400) * 86400 - 60 * 86400  # fixed per run so repeated syncs see identical history
_WORDS = ["cabin", "a-frame", "tiny house", "barndominium", "cottage", "modern farmhouse", "loft", "garage", "shed",
          "bunkie", "duplex", "craftsman"]
_EXTRA = ["plan", "floor plan", "blueprint", "2 bedroom", "3 bedroom", "small home", "diy", "pdf", "digital download",
          "house design", "architectural", "build your own", "off grid", "lake house", "guest house"]


def _rng(seed) -> random.Random:
    return random.Random(str(seed))


def _money(cents, cur="USD"):
    return {"amount": int(cents), "divisor": 100, "currency_code": cur}


class DemoEtsy:
    created: dict = {}

    def me(self):
        return {"user_id": 111, "shop_id": int(DEMO_SHOP_ID)}

    def get_shop(self, shop_id):
        return {"shop_id": int(DEMO_SHOP_ID), "shop_name": "DemoPlansStudio", "currency_code": "USD",
                "url": "https://www.etsy.com/shop/DemoPlansStudio", "title": "Modern house plans", "announcement": "Demo shop"}

    def shop_listings(self, shop_id, state="active"):
        out = []
        for i in range(8):
            r = _rng(f"l{i}")
            w = _WORDS[i % len(_WORDS)]
            out.append({"listing_id": 5000 + i, "title": f"{w.title()} House Plan {i + 1} Bedroom (PDF Download)",
                        "state": "active", "price": _money(r.randint(1500, 4900)), "url": f"https://www.etsy.com/listing/{5000 + i}",
                        "views": r.randint(50, 900), "num_favorers": r.randint(2, 80),
                        "tags": [w, "house plan", "pdf"], "creation_timestamp": int(time.time()) - 86400 * (40 + i)})
        out.extend(v for v in DemoEtsy.created.values())
        return out

    def find_active(self, keywords: str, limit: int = 100, offset: int = 0, sort_on: str = "score"):
        r = _rng(keywords.lower())
        count = r.randint(800, 12000)
        results = []
        for i in range(min(limit, 100)):
            words = r.sample(_WORDS, 2) + r.sample(_EXTRA, 3)
            tags = list(dict.fromkeys([keywords.lower()] + r.sample(_EXTRA + _WORDS, 10)))[:13]
            results.append({"listing_id": 700000 + r.randint(0, 99999), "shop_id": r.randint(10000, 99999),
                            "title": f"{keywords.title()} " + " ".join(words).title(), "tags": tags,
                            "price": _money(r.choice([999, 1499, 1999, 2499, 2999, 3999, 4999, 7999])),
                            "num_favorers": r.randint(0, 600), "views": r.randint(10, 20000),
                            "url": "https://www.etsy.com/listing/demo", "creation_timestamp": int(time.time()) - r.randint(1, 900) * 86400})
        return {"count": count, "results": results}

    def get_listing(self, listing_id):
        r = _rng(listing_id)
        return {"listing_id": int(listing_id), "title": "Competitor Cabin Plan 2 Bedroom Loft PDF", "shop_id": 12345,
                "tags": ["cabin plan", "loft", "small house", "pdf plan"], "price": _money(2999), "num_favorers": r.randint(5, 300),
                "views": r.randint(100, 9000), "url": f"https://www.etsy.com/listing/{listing_id}", "description": "Demo description"}

    def taxonomy(self):
        return {"results": [{"id": 1, "name": "Craft Supplies & Tools", "children": [{"id": 6201, "name": "Patterns & How To"}]}]}

    def create_draft(self, shop_id, fields):
        lid = 9000 + len(DemoEtsy.created)
        DemoEtsy.created[lid] = {"listing_id": lid, "title": fields.get("title"), "state": "draft",
                                 "price": _money(int(round(float(fields.get("price", 0)) * 100))),
                                 "url": f"https://www.etsy.com/listing/{lid}", "views": 0, "num_favorers": 0}
        return DemoEtsy.created[lid]

    def update_listing(self, shop_id, listing_id, fields):
        item = DemoEtsy.created.setdefault(int(listing_id), {"listing_id": int(listing_id)})
        item.update({k: v for k, v in fields.items() if k in ("state", "title")})
        return item

    def upload_image(self, shop_id, listing_id, path: Path, rank=1):
        return {"listing_image_id": int(time.time() * 1000) % 10**9}

    def upload_file(self, shop_id, listing_id, path: Path, rank=1):
        return {"listing_file_id": int(time.time() * 1000) % 10**9}

    def upload_video(self, shop_id, listing_id, path: Path):
        return {"video_id": int(time.time() * 1000) % 10**9}

    def receipts(self, shop_id, min_created=None):
        out = []
        base = _BASE
        for i in range(60):
            r = _rng(f"r{i}")
            n = r.choice([0, 1, 1, 1, 2])
            for k in range(n):
                cents = r.choice([1999, 2499, 2999, 3999, 4999])
                lid = 5000 + r.randint(0, 7)
                out.append({"receipt_id": 300000 + i * 10 + k, "created_timestamp": base + i * 86400 + k * 3600,
                            "status": "Completed", "is_paid": True, "country_iso": r.choice(["US", "CA", "GB", "AU"]),
                            "grandtotal": _money(cents), "subtotal": _money(cents), "total_shipping_cost": _money(0),
                            "total_tax_cost": _money(0), "discount_amt": _money(0),
                            "refunds": [{"amount": _money(cents)}] if r.random() < 0.03 else [],
                            "transactions": [{"transaction_id": 800000 + i * 10 + k, "listing_id": lid, "title": f"Demo plan {lid}",
                                              "quantity": 1, "price": _money(cents)}]})
        return out

    def receipt_payments(self, shop_id, receipt_id):
        return []

    def ledger(self, shop_id, min_created, max_created):
        """Full chronological ledger with a correct running balance, then filtered to the window."""
        events = []
        for rc in self.receipts(shop_id):
            ts = rc["created_timestamp"]
            g = rc["grandtotal"]["amount"]
            fee_t = round(g * 0.065)
            fee_p = round(g * 0.03) + 25
            events += [(ts, f"{rc['receipt_id']}-Payment", "Payment", "Payment for order", g, str(rc["receipt_id"])),
                       (ts + 1, f"{rc['receipt_id']}-Transaction", "Transaction", "Transaction fee", -fee_t, str(rc["receipt_id"])),
                       (ts + 2, f"{rc['receipt_id']}-Proc", "PaymentProcessingFee", "Processing fee", -fee_p, str(rc["receipt_id"]))]
            if rc["refunds"]:
                events.append((ts + 86400, f"{rc['receipt_id']}-refund", "Refund", "Refund", -g, str(rc["receipt_id"])))
        events.sort()
        first = events[0][0] if events else int(time.time())
        out, bal, k = [], 0, 0
        next_payout = first + 7 * 86400
        for ev in events + [(int(time.time()) + 1, None, None, None, 0, None)]:
            while next_payout <= ev[0] and next_payout <= int(time.time()):
                amt = max(0, bal) // 2
                if amt:
                    bal -= amt
                    out.append({"entry_id": f"disb-{k}", "create_date": next_payout, "ledger_type": "Disbursement",
                                "description": "Deposit to bank", "amount": -amt, "balance": bal, "currency": "USD",
                                "reference_id": f"payout-{k}"})
                    k += 1
                next_payout += 7 * 86400
            if ev[1] is None:
                break
            bal += ev[4]
            out.append({"entry_id": ev[1], "create_date": ev[0], "ledger_type": ev[2], "description": ev[3], "amount": ev[4],
                        "balance": bal, "currency": "USD", "reference_id": ev[5]})
        return [e for e in out if min_created <= e["create_date"] <= max_created]


class DemoPinterest:
    posted: dict = {}

    def me(self):
        return {"username": "demo_pins"}

    def boards(self):
        return [{"id": "demo-board-1", "name": "House Plans"}]

    def create_pin(self, board_id, title, description, link, image_path: Path | None = None, video_path: Path | None = None,
                   cover_path: Path | None = None):
        pid = f"demo-pin-{len(DemoPinterest.posted) + 1}"
        DemoPinterest.posted[pid] = {"id": pid, "title": title}
        return {"id": pid}

    def get_pin(self, pin_id):
        return DemoPinterest.posted.get(pin_id) or {"id": pin_id}

    def pin_url(self, pin_id):
        return f"https://www.pinterest.com/pin/{pin_id}/"

    def analytics(self, pin_id, start, end):
        r = _rng(pin_id)
        return {"all": {"summary_metrics": {"IMPRESSION": r.randint(100, 5000), "SAVE": r.randint(0, 80),
                                            "PIN_CLICK": r.randint(0, 200), "OUTBOUND_CLICK": r.randint(0, 60)}}}


class DemoYouTube:
    posted: dict = {}

    def me(self):
        return {"title": "Demo Channel", "id": "UCdemo"}

    def upload(self, path: Path, title, description, tags, privacy, category_id):
        vid = f"demovid{len(DemoYouTube.posted) + 1}"
        DemoYouTube.posted[vid] = {"id": vid}
        return {"id": vid, "status": {"privacyStatus": privacy, "uploadStatus": "uploaded"}}

    def get_video(self, video_id):
        return {"id": video_id, "status": {"uploadStatus": "processed", "privacyStatus": "public"}} if video_id in DemoYouTube.posted else None

    def stats(self, video_id):
        r = _rng(video_id)
        return {"viewCount": str(r.randint(20, 3000)), "likeCount": str(r.randint(0, 120)), "commentCount": str(r.randint(0, 15))}
