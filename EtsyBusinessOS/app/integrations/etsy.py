"""Etsy Open API v3 client (official API only). OAuth 2.0 Authorization Code + PKCE.
Docs: https://developers.etsy.com/documentation/  Scopes are configurable in Settings."""
from __future__ import annotations

import logging
import mimetypes
import time
from pathlib import Path
from urllib.parse import urlencode

import requests

from .. import config, db, vault
from ..audit import audit
from ..jobs import Fatal
from ..util import now
from .base import ApiError, RateLimiter, connection, new_oauth_state, pkce_pair, pop_oauth_state, raise_for, set_connection

log = logging.getLogger("ebos.etsy")
API = "https://openapi.etsy.com/v3/application"
AUTH_URL = "https://www.etsy.com/oauth/connect"
TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token"
REDIRECT = f"{config.BASE_URL}/oauth/etsy/callback"
_limiter = RateLimiter(5)


def app_keys(slot=1) -> dict:
    from ..shops import app_key_name
    own = vault.get(app_key_name(slot), {}) or {}
    return own if own.get("keystring") else (vault.get("etsy_app", {}) or {})


def api_key_header(slot=1) -> str:
    k = app_keys(slot)
    if not k.get("keystring"):
        raise Fatal("Etsy API key is not set (Settings > Connections > Etsy)")
    return f"{k['keystring']}:{k['shared_secret']}" if k.get("shared_secret") else k["keystring"]


def authorize_url(slot=1) -> str:
    from ..shops import norm
    slot = norm(slot)
    k = app_keys(slot)
    if not k.get("keystring"):
        raise ValueError("Isi Etsy keystring dulu (KAI-07 > Toko)")
    verifier, challenge = pkce_pair()
    state = new_oauth_state("etsy", verifier=verifier, slot=slot)
    params = {"response_type": "code", "client_id": k["keystring"], "redirect_uri": REDIRECT,
              "scope": db.settings()["etsy"]["scopes"], "state": state, "code_challenge": challenge,
              "code_challenge_method": "S256"}
    return AUTH_URL + "?" + urlencode(params)


def handle_callback(code: str, state: str):
    from ..shops import SLOTS, norm, platform, token_key
    d = pop_oauth_state(state, "etsy")
    slot = norm(d.get("slot", 1))
    k = app_keys(slot)
    r = requests.post(TOKEN_URL, data={"grant_type": "authorization_code", "client_id": k["keystring"],
                                       "redirect_uri": REDIRECT, "code": code, "code_verifier": d["verifier"]},
                      headers={"x-api-key": api_key_header(slot)}, timeout=30)
    if r.status_code >= 400:
        set_connection(platform(slot), "error", error=r.text[:500])
        raise ValueError(f"Etsy token exchange failed: {r.text[:300]}")
    tok = r.json()
    c = EtsyClient(slot, token=tok)
    me = c.me()
    sid = str(me.get("shop_id") or "")
    # never let one Etsy shop be bound to two slots (that is how listings would end up in the wrong shop)
    for other in SLOTS:
        if other != slot and sid and connection(platform(other)).get("account_id") == sid and vault.get(token_key(other)):
            set_connection(platform(slot), "error", error="this Etsy shop is already connected as another shop slot")
            raise ValueError(f"Toko Etsy ini sudah tersambung sebagai Toko {other}. Login dengan akun Etsy yang lain.")
    _store_token(tok, slot)
    shop = c.get_shop(me["shop_id"]) if me.get("shop_id") else {}
    set_connection(platform(slot), "connected", account_name=shop.get("shop_name"), account_id=sid,
                   scopes=db.settings()["etsy"]["scopes"])
    audit("human", "etsy.connect", "shop", me.get("shop_id"), {"slot": slot})
    return slot


def _store_token(tok: dict, slot=1):
    from ..shops import token_key
    tok["expires_at"] = time.time() + int(tok.get("expires_in", 3600)) - 60
    vault.put(token_key(slot), tok)


class EtsyClient:
    """Live client. All requests are rate-limited, 429/5xx become RetryLater, 401 triggers one refresh."""

    def __init__(self, slot=1, token: dict | None = None):
        from ..shops import norm, platform, token_key
        s = db.settings()["etsy"]
        _limiter.interval = 1.0 / max(float(s.get("rate_per_second", 5)), 0.5)
        self.slot = norm(slot)
        self.platform = platform(self.slot)
        self.token_key = token_key(self.slot)
        self._tmp_token = token

    # ---- auth ----
    def _token(self) -> str:
        if self._tmp_token:
            return self._tmp_token["access_token"]
        tok = vault.get(self.token_key)
        if not tok:
            raise Fatal(f"Toko {self.slot} belum tersambung ke Etsy (KAI-07 > Toko > Sambungkan)")
        if time.time() > tok.get("expires_at", 0):
            tok = self.refresh()
        return tok["access_token"]

    def refresh(self) -> dict:
        tok = vault.get(self.token_key) or {}
        k = app_keys(self.slot)
        r = requests.post(TOKEN_URL, data={"grant_type": "refresh_token", "client_id": k.get("keystring", ""),
                                           "refresh_token": tok.get("refresh_token", "")},
                          headers={"x-api-key": api_key_header(self.slot)}, timeout=30)
        if r.status_code >= 400:
            set_connection(self.platform, "expired", error="refresh failed: " + r.text[:300])
            raise Fatal(f"Login Etsy Toko {self.slot} kedaluwarsa - sambungkan ulang lewat KAI-07")
        new = r.json()
        _store_token(new, self.slot)
        return vault.get(self.token_key)

    def _req(self, method: str, path: str, *, auth: bool = True, params=None, data=None, files=None, _retry=True):
        _limiter.wait()
        headers = {"x-api-key": api_key_header(self.slot)}
        if auth:
            headers["Authorization"] = f"Bearer {self._token()}"
        try:
            r = requests.request(method, API + path, params=params, data=data, files=files, headers=headers, timeout=60)
        except requests.RequestException as e:
            from ..jobs import RetryLater
            raise RetryLater(f"network error contacting Etsy: {e}") from e
        if r.status_code == 401 and auth and _retry:
            self.refresh()
            return self._req(method, path, auth=auth, params=params, data=data, files=files, _retry=False)
        raise_for(r)
        if auth and not self._tmp_token:
            set_connection(self.platform, "connected")
        return r.json() if r.content else {}

    def _paged(self, path: str, params: dict, auth=True, max_items=2000):
        params = {**params, "limit": 100, "offset": 0}
        while True:
            page = self._req("GET", path, params=params, auth=auth)
            results = page.get("results", [])
            yield from results
            params["offset"] += len(results)
            if not results or params["offset"] >= min(page.get("count", 0), max_items):
                break

    # ---- endpoints ----
    def me(self):
        return self._req("GET", "/users/me")

    def get_shop(self, shop_id):
        return self._req("GET", f"/shops/{shop_id}")

    def shop_listings(self, shop_id, state="active"):
        return list(self._paged(f"/shops/{shop_id}/listings", {"state": state}))

    def find_active(self, keywords: str, limit: int = 100, offset: int = 0, sort_on: str = "score"):
        """findAllListingsActive - public listings via the official API (api key only)."""
        return self._req("GET", "/listings/active", auth=False,
                         params={"keywords": keywords, "limit": limit, "offset": offset, "sort_on": sort_on})

    def get_listing(self, listing_id):
        return self._req("GET", f"/listings/{listing_id}", auth=False, params={"includes": "Images"})

    def taxonomy(self):
        return self._req("GET", "/seller-taxonomy/nodes", auth=False)

    def create_draft(self, shop_id, fields: dict):
        return self._req("POST", f"/shops/{shop_id}/listings", data=fields)

    def update_listing(self, shop_id, listing_id, fields: dict):
        return self._req("PATCH", f"/shops/{shop_id}/listings/{listing_id}", data=fields)

    def upload_image(self, shop_id, listing_id, path: Path, rank: int = 1):
        with open(path, "rb") as fh:  # read-only access to the original asset
            return self._req("POST", f"/shops/{shop_id}/listings/{listing_id}/images",
                             files={"image": (path.name, fh, mimetypes.guess_type(path.name)[0] or "image/jpeg")},
                             data={"rank": rank})

    def upload_file(self, shop_id, listing_id, path: Path, rank: int = 1):
        with open(path, "rb") as fh:
            return self._req("POST", f"/shops/{shop_id}/listings/{listing_id}/files",
                             files={"file": (path.name, fh, "application/pdf")}, data={"name": path.name, "rank": rank})

    def upload_video(self, shop_id, listing_id, path: Path):
        with open(path, "rb") as fh:
            return self._req("POST", f"/shops/{shop_id}/listings/{listing_id}/videos",
                             files={"video": (path.name, fh, "video/mp4")}, data={"name": path.name})

    def receipts(self, shop_id, min_created: int | None = None):
        params = {"min_created": min_created} if min_created else {}
        return list(self._paged(f"/shops/{shop_id}/receipts", params))

    def receipt_payments(self, shop_id, receipt_id):
        return self._req("GET", f"/shops/{shop_id}/receipts/{receipt_id}/payments").get("results", [])

    def ledger(self, shop_id, min_created: int, max_created: int):
        return list(self._paged(f"/shops/{shop_id}/payment-account/ledger-entries",
                                {"min_created": min_created, "max_created": max_created}))


def shop_id(slot=1) -> str:
    from ..shops import platform
    sid = connection(platform(slot)).get("account_id")
    if not sid:
        raise Fatal(f"Toko {slot} belum tersambung ke Etsy")
    return sid


def test_connection(slot=1) -> dict:
    try:
        c = EtsyClient(slot)
        me = c.me()
        return {"ok": True, "detail": f"user {me.get('user_id')} shop {me.get('shop_id')}"}
    except (Fatal, ApiError, Exception) as e:  # noqa: BLE001
        return {"ok": False, "detail": str(e)}
