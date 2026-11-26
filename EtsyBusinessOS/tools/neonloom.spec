# PyInstaller spec: builds dist/NEONLOOM/NEONLOOM.exe (one-folder, starts fast).
# Run on Windows from the EtsyBusinessOS folder:  pyinstaller tools/neonloom.spec --noconfirm
from pathlib import Path
from PyInstaller.utils.hooks import collect_all, collect_submodules

ROOT = Path(SPECPATH).parent
datas = [(str(ROOT / "app" / "web" / "templates"), "app/web/templates"), (str(ROOT / "app" / "web" / "static"), "app/web/static"),
         (str(ROOT / "app" / "schema.sql"), "app")]
binaries, hidden = [], collect_submodules("uvicorn") + collect_submodules("app") + ["apscheduler.triggers.interval", "apscheduler.triggers.cron"]
for pkg in ("kokoro_onnx", "espeakng_loader", "phonemizer", "segments", "dlinfo", "onnxruntime", "webview", "keyring", "tzdata"):
    d, b, h = collect_all(pkg)
    datas += d; binaries += b; hidden += h

a = Analysis([str(ROOT / "run_desktop.py")], pathex=[str(ROOT)], binaries=binaries, datas=datas, hiddenimports=hidden,
             excludes=["tkinter", "matplotlib", "torch"], noarchive=False)
pyz = PYZ(a.pure)
icon = ROOT / "tools" / "neonloom.ico"
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="NEONLOOM", console=False, icon=str(icon) if icon.exists() else None)
coll = COLLECT(exe, a.binaries, a.datas, name="NEONLOOM")
