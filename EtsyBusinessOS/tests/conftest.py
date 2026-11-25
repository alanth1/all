import struct
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture()
def env(tmp_path, monkeypatch):
    """Fresh database + data folder per test, demo mode."""
    from app import config, db, vault
    from app.integrations import demo
    data = tmp_path / "data"
    monkeypatch.setattr(config, "DATA", data)
    monkeypatch.setattr(config, "DB_PATH", data / "ebos.sqlite3")
    monkeypatch.setattr(config, "BRAIN_DEFAULT", data / "brain")
    monkeypatch.setattr(config, "BACKUPS", data / "backups")
    monkeypatch.setattr(config, "LOGS", tmp_path / "logs")
    monkeypatch.setenv("PYTHON_KEYRING_BACKEND", "keyring.backends.fail.Keyring")
    db.reset_thread_connection()
    vault.reset_cache()
    demo.DemoEtsy.created = {}
    demo.DemoPinterest.posted = {}
    demo.DemoYouTube.posted = {}
    from app import orchestrator
    orchestrator.init()
    yield tmp_path
    db.reset_thread_connection()


def make_pdf(path: Path, text: str):
    content = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out = bytearray(b"%PDF-1.4\n")
    offs = []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for o in offs:
        out += b"%010d 00000 n \n" % o
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    path.write_bytes(bytes(out))


def _box(typ: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", 8 + len(payload)) + typ + payload


def make_mp4(path: Path, seconds: float, w: int, h: int):
    ts = 1000
    mvhd = _box(b"mvhd", b"\x00\x00\x00\x00" + struct.pack(">IIII", 0, 0, ts, int(seconds * ts)) + b"\x00" * 80)
    tkhd = _box(b"tkhd", b"\x00\x00\x00\x07" + struct.pack(">IIIII", 0, 0, 1, 0, int(seconds * ts)) + b"\x00" * 8 +
                b"\x00" * 8 + b"\x00" * 36 + struct.pack(">II", w << 16, h << 16))
    hdlr = _box(b"hdlr", b"\x00\x00\x00\x00" + b"\x00" * 4 + b"vide" + b"\x00" * 12 + b"VideoHandler\x00")
    mdia = _box(b"mdia", hdlr)
    trak = _box(b"trak", tkhd + mdia)
    moov = _box(b"moov", mvhd + trak)
    path.write_bytes(_box(b"ftyp", b"isom\x00\x00\x02\x00isomiso2mp41") + moov + _box(b"mdat", b"\x00" * 64))


@pytest.fixture()
def asset_root(tmp_path):
    from PIL import Image
    root = tmp_path / "assets"
    p = root / "Modern Cabin"
    (p / "marketing").mkdir(parents=True)
    make_pdf(p / "cabin-plan.pdf", "Modern cabin 2 bedroom 1 bathroom 850 sq ft floor plan elevations")
    Image.new("RGB", (2000, 3000), (200, 120, 50)).save(p / "cover.jpg")
    Image.new("RGB", (1000, 1500), (20, 120, 200)).save(p / "marketing" / "pin1.png")
    make_mp4(p / "marketing" / "tour.mp4", 12.0, 1080, 1920)
    (p / "notes.txt").write_text("Includes floor plan, elevations, sections.", encoding="utf-8")
    Image.new("RGB", (1000, 1500), (20, 120, 200)).save(p / "marketing" / "pin1-copy.png")  # duplicate content
    return root
