"""YouTube Data API v3 (official) with Google OAuth (Desktop/installed-app client, loopback redirect, PKCE).
Note: videos uploaded by apps that have not passed Google's audit are locked to private."""
from __future__ import annotations

import json
import time
from pathlib import Path
from urllib.parse import urlencode

import requests

from .. import config, vault
from ..audit import audit
from ..jobs import Fatal, RetryLater
from .base import new_oauth_state, pkce_pair, pop_oauth_state, raise_for, set_connection

REDIRECT = f"{config.BASE_URL}/oauth/youtube/callback"
SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly"
API = "https://www.googleapis.com/youtube/v3"


def keys() -> dict:
    return vault.get("youtube_app", {}) or {}


def authorize_url() -> str:
    k = keys()
    if not k.get("client_id"):
        raise ValueError("Save your Google OAuth client ID and secret first")
    verifier, challenge = pkce_pair()
    state = new_oauth_state("youtube", verifier=verifier)
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
        "client_id": k["client_id"], "redirect_uri": REDIRECT, "response_type": "code", "scope": SCOPES,
        "access_type": "offline", "prompt": "consent", "state": state, "code_challenge": challenge,
        "code_challenge_method": "S256"})


def _token(data: dict) -> dict:
    k = keys()
    r = requests.post("https://oauth2.googleapis.com/token",
                      data={**data, "client_id": k["client_id"], "client_secret": k.get("client_secret", "")}, timeout=30)
    if r.status_code >= 400:
        raise ValueError(f"Google token error: {r.text[:300]}")
    tok = r.json()
    tok["expires_at"] = time.time() + int(tok.get("expires_in", 3600)) - 60
    old = vault.get("youtube_token") or {}
    tok.setdefault("refresh_token", old.get("refresh_token"))
    vault.put("youtube_token", tok)
    return tok


def handle_callback(code: str, state: str):
    d = pop_oauth_state(state, "youtube")
    _token({"grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT, "code_verifier": d["verifier"]})
    me = YouTubeClient().me()
    set_connection("youtube", "connected", account_name=me.get("title"), account_id=me.get("id"), scopes=SCOPES)
    audit("human", "youtube.connect", "channel", me.get("id"))


class YouTubeClient:
    def _access(self):
        tok = vault.get("youtube_token")
        if not tok:
            raise Fatal("YouTube is not connected")
        if time.time() > tok.get("expires_at", 0):
            try:
                tok = _token({"grant_type": "refresh_token", "refresh_token": tok.get("refresh_token")})
            except ValueError as e:
                set_connection("youtube", "expired", error=str(e))
                raise Fatal("YouTube authorization expired - reconnect") from e
        return tok["access_token"]

    def _req(self, method, url, **kw):
        try:
            r = requests.request(method, url, headers={"Authorization": f"Bearer {self._access()}", **kw.pop("headers", {})},
                                 timeout=kw.pop("timeout", 60), **kw)
        except requests.RequestException as e:
            raise RetryLater(f"network error contacting YouTube: {e}") from e
        if r.status_code == 403 and "quotaExceeded" in r.text:
            raise RetryLater("YouTube daily quota exhausted", 6 * 3600)
        if r.status_code in (401, 403):
            raise Fatal(f"YouTube refused access: {r.text[:200]}")
        raise_for(r)
        set_connection("youtube", "connected")
        return r

    def me(self):
        items = self._req("GET", f"{API}/channels", params={"part": "snippet", "mine": "true"}).json().get("items", [])
        return {"id": items[0]["id"], "title": items[0]["snippet"]["title"]} if items else {}

    def upload(self, path: Path, title, description, tags, privacy, category_id):
        meta = {"snippet": {"title": title[:100], "description": description[:5000], "tags": tags[:30], "categoryId": category_id},
                "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": False}}
        size = path.stat().st_size
        init = self._req("POST", "https://www.googleapis.com/upload/youtube/v3/videos",
                         params={"uploadType": "resumable", "part": "snippet,status"},
                         headers={"Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/*",
                                  "X-Upload-Content-Length": str(size)}, data=json.dumps(meta))
        loc = init.headers["Location"]
        with open(path, "rb") as fh:  # read-only
            r = self._req("PUT", loc, data=fh, headers={"Content-Type": "video/*", "Content-Length": str(size)}, timeout=3600)
        return r.json()

    def get_video(self, video_id):
        items = self._req("GET", f"{API}/videos", params={"part": "status,snippet", "id": video_id}).json().get("items", [])
        return items[0] if items else None

    def stats(self, video_id):
        items = self._req("GET", f"{API}/videos", params={"part": "statistics", "id": video_id}).json().get("items", [])
        return items[0]["statistics"] if items else {}
