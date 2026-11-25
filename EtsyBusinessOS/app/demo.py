"""Demo mode seed: a small read-only sample asset library so the whole flow
(asset scan -> listing draft -> QA -> owner approval) can be tried before Etsy is connected."""
from pathlib import Path

from . import config, db

PRODUCTS = [("Modern Farmhouse 3 Bed", (255, 179, 71)), ("Cyber Cabin 1 Bed", (63, 240, 255)), ("Tiny House Loft", (255, 63, 164))]


def demo_root() -> Path:
    return config.DATA.parent / "demo_assets"


def _draw_plan(path: Path, title: str, col, pdf: bool):
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (1200, 1200), (14, 18, 30))
    d = ImageDraw.Draw(img)
    for x in range(0, 1200, 40):
        d.line([(x, 0), (x, 1200)], fill=(24, 32, 50))
        d.line([(0, x), (1200, x)], fill=(24, 32, 50))
    d.rectangle([200, 260, 1000, 940], outline=col, width=10)
    d.line([(600, 260), (600, 700)], fill=col, width=6)
    d.line([(200, 700), (820, 700)], fill=col, width=6)
    d.rectangle([640, 300, 960, 660], outline=(200, 210, 230), width=3)
    d.text((210, 150), title.upper(), fill=col)
    d.text((210, 980), "DIGITAL HOUSE PLAN - DEMO SAMPLE", fill=(200, 210, 230))
    img.save(path, "PDF" if pdf else "PNG")


def ensure_demo_assets() -> bool:
    """Create the sample library and register it as an asset folder (demo mode only). Returns True if a scan is needed."""
    s = db.settings()
    if s.get("mode") != "demo":
        return False
    root = demo_root()
    for name, col in PRODUCTS:
        folder = root / name
        folder.mkdir(parents=True, exist_ok=True)
        if not (folder / "cover.png").exists():
            _draw_plan(folder / "cover.png", name, col, pdf=False)
        if not (folder / "floor-plan.pdf").exists():
            _draw_plan(folder / "floor-plan.pdf", name, col, pdf=True)
    folders = s["assets"].get("folders", [])
    if str(root) in folders:
        return db.q1("SELECT COUNT(*) n FROM products")["n"] == 0
    db.update_settings({"assets": {"folders": folders + [str(root)]}}, "system")
    return True
