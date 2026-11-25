"""Encrypted credential storage (Fernet). The key is kept in the OS keyring when available
(Windows Credential Manager), otherwise in data/secret.key. Secrets are never logged or shown."""
from __future__ import annotations

import json
import logging

from cryptography.fernet import Fernet, InvalidToken

from . import config, db
from .util import now

log = logging.getLogger("ebos.vault")
_SERVICE = "EtsyBusinessOS"
_fernet: Fernet | None = None


def _key() -> bytes:
    keyfile = config.DATA / "secret.key"
    try:
        import keyring  # noqa
        k = keyring.get_password(_SERVICE, "master")
        if k:
            return k.encode()
        if not keyfile.exists():
            k = Fernet.generate_key().decode()
            keyring.set_password(_SERVICE, "master", k)
            if keyring.get_password(_SERVICE, "master") == k:
                return k.encode()
    except Exception as e:  # keyring backend missing (Linux tests) -> file fallback
        log.debug("keyring unavailable: %s", e)
    if keyfile.exists():
        return keyfile.read_bytes().strip()
    keyfile.parent.mkdir(parents=True, exist_ok=True)
    k = Fernet.generate_key()
    keyfile.write_bytes(k)
    return k


def _f() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_key())
    return _fernet


def reset_cache():
    global _fernet
    _fernet = None


def put(name: str, value: dict | str):
    data = json.dumps(value) if not isinstance(value, str) else value
    token = _f().encrypt(data.encode())
    db.ex("INSERT INTO credentials(name, secret, updated_at) VALUES(?,?,?) "
          "ON CONFLICT(name) DO UPDATE SET secret=excluded.secret, updated_at=excluded.updated_at",
          (name, token, now()))


def get(name: str, default=None):
    row = db.q1("SELECT secret FROM credentials WHERE name=?", (name,))
    if not row:
        return default
    try:
        raw = _f().decrypt(row["secret"]).decode()
    except InvalidToken:
        log.error("credential %s could not be decrypted (key changed?)", name)
        return default
    try:
        return json.loads(raw)
    except ValueError:
        return raw


def delete(name: str):
    db.ex("DELETE FROM credentials WHERE name=?", (name,))


def has(name: str) -> bool:
    return db.q1("SELECT 1 FROM credentials WHERE name=?", (name,)) is not None


def mask(s: str | None) -> str:
    if not s:
        return ""
    return s[:4] + "…" + s[-2:] if len(s) > 8 else "••••"
