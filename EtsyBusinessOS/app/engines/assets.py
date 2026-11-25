"""Asset Reader Engine (PRD module 07). Source folders are READ-ONLY: files are only opened with 'rb'.
All metadata is stored in the database. Never deletes, renames or modifies originals."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import os
from pathlib import Path

from .. import db
from ..audit import audit
from ..jobs import handler
from ..util import dumps, now
from . import mp4

log = logging.getLogger("ebos.assets")
TYPES = {".pdf": "pdf", ".jpg": "image", ".jpeg": "image", ".png": "image", ".webp": "image",
         ".mp4": "video", ".mov": "video", ".txt": "text", ".json": "data", ".csv": "data"}


class ReadOnlyViolation(Exception):
    pass


def roots() -> list[Path]:
    return [Path(p) for p in db.settings()["assets"].get("folders", []) if p]


def assert_writable(path: Path):
    """Every write in the app goes through data/ - this guard refuses any path inside an asset root."""
    p = Path(path).resolve()
    for r in roots():
        rr = r.resolve()
        if p == rr or rr in p.parents:
            raise ReadOnlyViolation(f"refusing to write inside read-only asset folder: {p}")


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def extract(path: Path, kind: str) -> dict:
    meta: dict = {}
    try:
        if kind == "image":
            from PIL import Image
            with Image.open(path) as im:
                meta["width"], meta["height"] = im.size
                meta["format"] = im.format
                meta["mode"] = im.mode
        elif kind == "video":
            meta.update(mp4.probe(path))
        elif kind == "pdf":
            from pypdf import PdfReader
            with open(path, "rb") as fh:
                rd = PdfReader(fh)
                meta["pages"] = len(rd.pages)
                text = []
                for page in rd.pages[:6]:
                    text.append(page.extract_text() or "")
                    if sum(map(len, text)) > 4000:
                        break
                meta["text_excerpt"] = " ".join(" ".join(text).split())[:4000]
                info = rd.metadata or {}
                meta["pdf_title"] = str(info.get("/Title", "") or "")
        elif kind == "text":
            with open(path, "rb") as fh:
                meta["text_excerpt"] = fh.read(4000).decode("utf-8", "replace")
        elif kind == "data":
            with open(path, "rb") as fh:
                raw = fh.read(200000).decode("utf-8", "replace")
            if path.suffix.lower() == ".json":
                try:
                    obj = json.loads(raw)
                    meta["json_keys"] = list(obj.keys())[:50] if isinstance(obj, dict) else f"list[{len(obj)}]"
                except ValueError:
                    meta["json_error"] = "invalid or truncated JSON"
            else:
                rows = list(csv.reader(io.StringIO(raw)))
                meta["csv_columns"] = rows[0][:50] if rows else []
                meta["csv_rows_sampled"] = max(0, len(rows) - 1)
            meta["text_excerpt"] = raw[:1500]
    except Exception as e:  # noqa: BLE001 - a broken file must not stop the scan
        meta["error"] = f"{type(e).__name__}: {e}"
    return meta


def compatibility(kind: str, ext: str, size: int, meta: dict) -> dict:
    w, h, d = meta.get("width"), meta.get("height"), meta.get("duration_s")
    ratio = (w / h) if w and h else None
    c = {}
    if kind == "image":
        c["etsy_listing_image"] = bool(w and min(w, h) >= 1000 and size <= 20 * 1024 * 1024)
        c["pinterest_image"] = bool(size <= 20 * 1024 * 1024 and w)
        c["pinterest_ideal_2x3"] = bool(ratio and 0.6 <= ratio <= 0.7)
    elif kind == "video":
        c["etsy_listing_video"] = bool(d and 5 <= d <= 15 and size <= 100 * 1024 * 1024)
        c["pinterest_video"] = bool(d and 4 <= d <= 900 and size <= 2 * 1024 ** 3)
        c["youtube_video"] = bool(d)
        c["youtube_short"] = bool(d and d <= 180 and ratio and ratio < 1)
    elif kind == "pdf":
        c["etsy_digital_file"] = size <= 20 * 1024 * 1024 and not meta.get("error")
    return c


def _product_for(root: Path, rel: Path) -> int | None:
    if len(rel.parts) < 2:
        return None
    key = rel.parts[0].strip().lower()
    row = db.q1("SELECT id FROM products WHERE key=?", (key,))
    if row:
        return row["id"]
    return db.ex("INSERT INTO products(key, name, facts, created_at) VALUES(?,?,?,?)", (key, rel.parts[0], "{}", now()))


def scan(root: Path) -> dict:
    stats = {"root": str(root), "new": 0, "changed": 0, "unchanged": 0, "missing": 0, "errors": 0}
    if not root.exists():
        raise FileNotFoundError(f"asset folder not found: {root}")
    mr = db.settings()["assets"].get("marketing_ready_dirname", "marketing").lower()
    seen = set()
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for fn in filenames:
            p = Path(dirpath) / fn
            ext = p.suffix.lower()
            if ext not in TYPES or fn.startswith("."):
                continue
            key = str(p.resolve())
            seen.add(key)
            try:
                st = p.stat()
                row = db.q1("SELECT * FROM social_assets WHERE path=?", (key,))
                if row and row["size_bytes"] == st.st_size and abs((row["mtime"] or 0) - st.st_mtime) < 1e-3:
                    db.ex("UPDATE social_assets SET last_seen=?, missing=0 WHERE id=?", (now(), row["id"]))
                    stats["unchanged"] += 1
                    continue
                kind = TYPES[ext]
                digest = file_hash(p)
                meta = extract(p, kind)
                rel = p.relative_to(root)
                product_id = _product_for(root, rel)
                ready = 1 if any(part.lower() == mr for part in rel.parts[:-1]) else 0
                compat = compatibility(kind, ext, st.st_size, meta)
                fields = (kind, st.st_size, digest, st.st_mtime, meta.get("width"), meta.get("height"), meta.get("duration_s"),
                          meta.get("pages"), meta.get("text_excerpt"), dumps(meta), product_id, dumps(compat), now())
                if row:
                    if row["sha256"] != digest:
                        version = row["version"] + 1
                        stats["changed"] += 1
                    else:
                        version = row["version"]
                        stats["unchanged"] += 1
                    db.ex("UPDATE social_assets SET kind=?, size_bytes=?, sha256=?, mtime=?, width=?, height=?, duration_s=?, pages=?, "
                          "text_excerpt=?, meta=?, product_id=?, compat=?, last_seen=?, version=?, missing=0, "
                          "marketing_ready=MAX(marketing_ready, ?) WHERE id=?", fields + (version, ready, row["id"]))
                    if version != row["version"]:
                        db.ex("INSERT INTO asset_versions(asset_id, version, sha256, size_bytes, seen_at) VALUES(?,?,?,?,?)",
                              (row["id"], version, digest, st.st_size, now()))
                else:
                    aid = db.ex("INSERT INTO social_assets(kind, size_bytes, sha256, mtime, width, height, duration_s, pages, text_excerpt, "
                                "meta, product_id, compat, last_seen, path, root, rel_path, file_type, marketing_ready, first_seen) "
                                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                                fields + (key, str(root), rel.as_posix(), ext.lstrip("."), ready, now()))
                    db.ex("INSERT INTO asset_versions(asset_id, version, sha256, size_bytes, seen_at) VALUES(?,?,?,?,?)",
                          (aid, 1, digest, st.st_size, now()))
                    stats["new"] += 1
            except Exception as e:  # noqa: BLE001
                stats["errors"] += 1
                log.warning("asset scan error %s: %s", p, e)
    for r in db.q("SELECT id, path FROM social_assets WHERE root=? AND missing=0", (str(root),)):
        if r["path"] not in seen:
            db.ex("UPDATE social_assets SET missing=1 WHERE id=?", (r["id"],))
            stats["missing"] += 1
    return stats


def duplicates() -> list[dict]:
    rows = db.q("SELECT sha256, COUNT(*) n, GROUP_CONCAT(rel_path, ' | ') paths FROM social_assets WHERE missing=0 "
                "GROUP BY sha256 HAVING n > 1")
    return [dict(r) for r in rows]


@handler("asset_scan", lane="io", agent="Libby", max_attempts=3)
def job_asset_scan(payload, job):
    results = [scan(r) for r in roots()]
    audit("system", "assets.scan", "assets", None, results)
    return {"roots": results, "duplicates": len(duplicates())}
