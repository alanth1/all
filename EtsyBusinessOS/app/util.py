from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, default=str)


def loads(s, default=None):
    if s is None or s == "":
        return default
    try:
        return json.loads(s)
    except (TypeError, ValueError):
        return default


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def to_cents(value) -> int:
    """Deterministic money parsing: '1,234.50' / 12.5 / Decimal -> integer cents."""
    if value is None or value == "":
        return 0
    if isinstance(value, int):
        return value * 100
    s = str(value).strip().replace(",", "").replace("$", "")
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    d = (Decimal(s) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return -int(d) if neg else int(d)


def money_obj_cents(m: dict | None) -> int:
    """Etsy Money object {amount, divisor, currency_code} -> cents."""
    if not m:
        return 0
    amount = Decimal(int(m.get("amount", 0)))
    divisor = Decimal(int(m.get("divisor", 100) or 100))
    return int((amount * 100 / divisor).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def fmt_money(cents: int | None, currency: str = "USD") -> str:
    if cents is None:
        return "-"
    sign = "-" if cents < 0 else ""
    c = abs(int(cents))
    sym = {"USD": "$", "EUR": "€", "GBP": "£", "IDR": "Rp"}.get(currency, currency + " ")
    return f"{sign}{sym}{c // 100:,}.{c % 100:02d}"


def ts_to_iso(ts) -> str:
    return datetime.fromtimestamp(int(ts), tz=timezone.utc).replace(microsecond=0).isoformat()
