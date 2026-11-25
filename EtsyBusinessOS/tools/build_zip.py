"""Build dist/EtsyBusinessOS_v<VERSION>.zip (excludes runtime, data, logs, caches)."""
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION = (ROOT / "VERSION").read_text().strip()
EXCLUDE_DIRS = {"runtime", "data", "logs", "dist", "__pycache__", ".pytest_cache", ".git"}
out = ROOT / "dist" / f"EtsyBusinessOS_v{VERSION}.zip"
out.parent.mkdir(exist_ok=True)
n = 0
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for p in sorted(ROOT.rglob("*")):
        rel = p.relative_to(ROOT)
        if p.is_dir() or EXCLUDE_DIRS & set(rel.parts) or p.suffix == ".pyc":
            continue
        z.write(p, Path(f"EtsyBusinessOS_v{VERSION}") / rel)
        n += 1
print(f"{out} ({n} files, {out.stat().st_size // 1024} KB)")
