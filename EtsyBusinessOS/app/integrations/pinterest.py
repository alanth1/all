"""Pinterest API v5 (official). OAuth 2.0 code flow. Trial apps must use the sandbox host for writes;
toggle 'sandbox' in the Pinterest connection settings."""
from __future__ import annotations

import base64
import mimetypes
import time
from pathlib import Path
from urllib.parse import urlencode

import requests

from .. import config, vault
from ..audit import audit
from ..jobs import Fatal, RetryLater
from .base import RateLimiter, new_oauth_state, pop_oauth_state, raise_for, set_connection

AUTH_URL = "https://www.pinterest.com/oauth/"
REDIRECT = f"{config.BASE_URL}/oauth/pinterest/callback"
SCOPES = "boards:read,pins:read,pins:write,user_accounts:read"
_limiter = RateLimiter(2)


def keys() -> dict:
    return vault.get("pinterest_app", {}) or {}


def api_base() -> str:
    return "https://api-sandbox.pinterest.com/v5" if keys().get("sandbox") else "https://api.pinterest.com/v5"


def authorize_url() -> str:
    k = keys()
    if not k.get("client_id"):
        raise ValueError("Save your Pinterest App ID and secret first")
    state = new_oauth_state("pinterest")
    return AUTH_URL + "?" + urlencode({"client_id": k["client_id"], "redirect_uri": REDIRECT, "response_type": "code",
                                       "scope": SCOPES, "state": state})


def _token_request(data: dict) -> dict:
    k = keys()
    basic = base64.b64encode(f"{k['client_id']}:{k['client_secret']}".encode()).decode()
    r = requests.post("https://api.pinterest.com/v5/oauth/token", data=data,
                      headers={"Authorization": f"Basic {basic}"}, timeout=30)
    if r.status_code >= 400:
        raise ValueError(f"Pinterest token error: {r.text[:300]}")
    tok = r.json()
    tok["expires_at"] = time.time() + int(tok.get("expires_in", 2592000)) - 120
    old = vault.get("pinterest_token") or {}
    tok.setdefault("refresh_token", old.get("refresh_token"))
    vault.put("pinterest_token", tok)
    return tok


def handle_callback(code: str, state: str):
    pop_oauth_state(state, "pinterest")
    _token_request({"grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT})
    me = PinterestClient().me()
    set_connection("pinterest", "connected", account_name=me.get("username"), scopes=SCOPES)
    audit("human", "pinterest.connect", "account", me.get("username"))


class PinterestClient:
    def _token(self):
        tok = vault.get("pinterest_token")
        if not tok:
            raise Fatal("Pinterest is not connected")
        if time.time() > tok.get("expires_at", 0):
            tok = _token_request({"grant_type": "refresh_token", "refresh_token": tok.get("refresh_token")})
        return tok["access_token"]

    def _req(self, method, path, **kw):
        _limiter.wait()
        try:
            r = requests.request(method, api_base() + path, headers={"Authorization": f"Bearer {self._token()}"}, timeout=120, **kw)
        except requests.RequestException as e:
            raise RetryLater(f"network error contacting Pinterest: {e}") from e
        if r.status_code in (401, 403):
            set_connection("pinterest", "error", error=r.text[:300])
            raise Fatal(f"Pinterest refused access ({r.status_code}). Check app access level / reconnect: {r.text[:200]}")
        raise_for(r)
        set_connection("pinterest", "connected")
        return r.json() if r.content else {}

    def me(self):
        return self._req("GET", "/user_account")

    def boards(self):
        return self._req("GET", "/boards", params={"page_size": 100}).get("items", [])

    def _upload_video(self, path: Path) -> str:
        reg = self._req("POST", "/media", json={"media_type": "video"})
        with open(path, "rb") as fh:
            up = requests.post(reg["upload_url"], data=reg["upload_parameters"], files={"file": (path.name, fh)}, timeout=600)
        if up.status_code >= 300:
            raise RetryLater(f"Pinterest video upload failed: {up.status_code}")
        for _ in range(60):
            st = self._req("GET", f"/media/{reg['media_id']}")
            if st.get("status") == "succeeded":
                return reg["media_id"]
            if st.get("status") == "failed":
                raise Fatal("Pinterest rejected the video")
            time.sleep(5)
        raise RetryLater("Pinterest video still processing")

    def create_pin(self, board_id, title, description, link, image_path: Path | None = None, video_path: Path | None = None,
                   cover_path: Path | None = None):
        if video_path:
            media_id = self._upload_video(video_path)
            src = {"source_type": "video_id", "media_id": media_id}
            if cover_path:
                src["cover_image_content_type"] = mimetypes.guess_type(cover_path.name)[0] or "image/jpeg"
                src["cover_image_data"] = base64.b64encode(cover_path.read_bytes()).decode()
        else:
            src = {"source_type": "image_base64", "content_type": mimetypes.guess_type(image_path.name)[0] or "image/jpeg",
                   "data": base64.b64encode(image_path.read_bytes()).decode()}
        body = {"board_id": board_id, "title": title[:100], "description": description[:500], "media_source": src}
        if link:
            body["link"] = link
        return self._req("POST", "/pins", json=body)

    def get_pin(self, pin_id):
        return self._req("GET", f"/pins/{pin_id}")

    def pin_url(self, pin_id):
        return f"https://www.pinterest.com/pin/{pin_id}/"

    def analytics(self, pin_id, start: str, end: str):
        return self._req("GET", f"/pins/{pin_id}/analytics", params={
            "start_date": start, "end_date": end, "metric_types": "IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK"})
