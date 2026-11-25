"""Shared HTTP plumbing: rate limiting, retry classification, connection status, OAuth state."""
from __future__ import annotations

import base64
import hashlib
import secrets
import threading
import time

import requests

from .. import db
from ..jobs import Fatal, RetryLater
from ..util import now

_pending_oauth: dict[str, dict] = {}


def pkce_pair() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).rstrip(b"=").decode()
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


def new_oauth_state(platform: str, **data) -> str:
    state = secrets.token_urlsafe(24)
    _pending_oauth[state] = {"platform": platform, "created": time.time(), **data}
    return state


def pop_oauth_state(state: str, platform: str) -> dict:
    d = _pending_oauth.pop(state, None)
    if not d or d["platform"] != platform or time.time() - d["created"] > 900:
        raise ValueError("OAuth state invalid or expired - start the connection again")
    return d


class RateLimiter:
    def __init__(self, per_second: float):
        self.interval = 1.0 / max(per_second, 0.1)
        self.lock = threading.Lock()
        self.next_at = 0.0

    def wait(self):
        with self.lock:
            t = time.time()
            if t < self.next_at:
                time.sleep(self.next_at - t)
            self.next_at = max(t, self.next_at) + self.interval


class ApiError(Exception):
    def __init__(self, status: int, body: str):
        super().__init__(f"HTTP {status}: {body[:300]}")
        self.status = status
        self.body = body


def raise_for(r: requests.Response):
    if r.status_code < 400:
        return
    if r.status_code == 429:
        ra = r.headers.get("Retry-After")
        raise RetryLater(f"rate limited by {r.url.split('/')[2]}", int(float(ra)) if ra and ra.replace('.', '').isdigit() else 120)
    if r.status_code >= 500:
        raise RetryLater(f"server error {r.status_code} from {r.url.split('/')[2]}")
    raise ApiError(r.status_code, r.text)


def set_connection(platform: str, status: str, *, account_name=None, account_id=None, scopes=None, error=None):
    row = db.q1("SELECT id FROM api_connections WHERE platform=?", (platform,))
    ok_at = now() if status == "connected" else None
    if row:
        db.ex("UPDATE api_connections SET status=?, account_name=COALESCE(?,account_name), account_id=COALESCE(?,account_id), "
              "scopes=COALESCE(?,scopes), last_ok_at=COALESCE(?,last_ok_at), last_error=?, updated_at=? WHERE platform=?",
              (status, account_name, account_id, scopes, ok_at, error, now(), platform))
    else:
        db.ex("INSERT INTO api_connections(platform, status, account_name, account_id, scopes, last_ok_at, last_error, updated_at) "
              "VALUES(?,?,?,?,?,?,?,?)", (platform, status, account_name, account_id, scopes, ok_at, error, now()))


def connection(platform: str) -> dict:
    row = db.q1("SELECT * FROM api_connections WHERE platform=?", (platform,))
    return dict(row) if row else {"platform": platform, "status": "not_connected"}


def unavailable(feature: str, reason: str):
    raise Fatal(f"{feature} unavailable: {reason}")
