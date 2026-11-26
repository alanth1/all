"""NEONLOOM desktop app: runs the local server inside the process and shows the HQ in a native window
(Edge WebView2). When the HQ window is minimised a small frameless companion appears and roams the desktop.
Build to an .exe with tools/neonloom.spec (PyInstaller)."""
from __future__ import annotations

import os
import socket
import sys
import threading
import time
from pathlib import Path


def _base() -> Path:
    if getattr(sys, "frozen", False):          # PyInstaller: data next to the exe, code inside the bundle
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


os.environ.setdefault("EBOS_ROOT", str(_base()))

# Windowed exe has no console: give stdout/stderr a log file so uvicorn/logging never crash on None streams
_logdir = _base() / "logs"
_logdir.mkdir(parents=True, exist_ok=True)
if sys.stdout is None or sys.stderr is None:
    _log = open(_logdir / "neonloom.log", "a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stdout or _log
    sys.stderr = sys.stderr or _log

from . import config  # noqa: E402

URL = f"http://{config.HOST}:{config.PORT}"


def _port_open() -> bool:
    with socket.socket() as s:
        s.settimeout(.3)
        return s.connect_ex((config.HOST, config.PORT)) == 0


def _start_server():
    import uvicorn
    from .web.server import app
    srv = uvicorn.Server(uvicorn.Config(app, host=config.HOST, port=config.PORT, log_level="warning", log_config=None))
    th = threading.Thread(target=srv.run, daemon=True, name="ebos-server")
    th.start()
    for _ in range(200):
        if _port_open():
            break
        time.sleep(.05)
    return srv


class CompanionApi:
    """Called from companion.js. Moves the frameless companion window along the bottom of the screen."""
    W, H = 260, 330

    def __init__(self):
        self.win = None
        self.main = None
        self.x = 0
        self.y = 0
        self.max = 1600
        self.target = None
        self.speed = 170
        self._lock = threading.Lock()

    def place(self):
        import webview
        try:
            sc = webview.screens[0]
            sw, sh, sx, sy = sc.width, sc.height, sc.x, sc.y
        except Exception:  # noqa: BLE001
            sw, sh, sx, sy = 1920, 1080, 0, 0
        self.max = sx + sw - self.W
        self.x = sx + sw - self.W - 40
        self.y = sy + sh - self.H - 48          # just above the taskbar
        self.win.move(int(self.x), int(self.y))

    def state(self):
        return {"x": self.x, "max": self.max, "moving": self.target is not None}

    def walk_to(self, x, speed=170):
        with self._lock:
            self.target = max(0, min(self.max, float(x)))
            self.speed = max(60, min(600, float(speed)))
        return True

    def restore(self):
        if self.main:
            self.main.restore()
            self.main.show()
        return True

    def loop(self):
        last = time.time()
        while True:
            time.sleep(1 / 60)
            now = time.time()
            dt, last = now - last, now
            with self._lock:
                if self.target is None or self.win is None:
                    continue
                d = self.target - self.x
                step = self.speed * dt
                if abs(d) <= step:
                    self.x, self.target = self.target, None
                else:
                    self.x += step if d > 0 else -step
            try:
                self.win.move(int(self.x), int(self.y))
            except Exception:  # noqa: BLE001 - window closed
                return


def main():
    try:
        _main()
    except Exception:  # noqa: BLE001 - always leave a trace for support
        import traceback
        (_base() / "logs" / "crash.log").write_text(traceback.format_exc(), encoding="utf-8")
        raise


def _main():
    if "--server-only" in sys.argv:              # used by the CI smoke test and for headless use
        srv = _start_server()
        while not srv.should_exit:
            time.sleep(.5)
        return
    import webview
    srv = None if _port_open() else _start_server()   # second launch reuses the running server
    api = CompanionApi()
    hq = webview.create_window("NEONLOOM HQ · Etsy Business OS", URL + "/", width=1600, height=900, min_size=(800, 480),
                               background_color="#0b0e16", text_select=False, zoomable=False)
    comp = webview.create_window("NEONLOOM Companion", URL + "/companion", js_api=api, width=api.W, height=api.H,
                                 frameless=True, easy_drag=True, on_top=True, transparent=True, hidden=True,
                                 background_color="#000000", shadow=False, focus=False)
    api.win, api.main = comp, hq

    def on_min():
        api.place()
        comp.show()

    def on_restore():
        comp.hide()

    def on_close():
        try:
            comp.destroy()
        except Exception:  # noqa: BLE001
            pass
        if srv:
            srv.should_exit = True

    hq.events.minimized += on_min
    hq.events.restored += on_restore
    hq.events.closed += on_close
    threading.Thread(target=api.loop, daemon=True).start()
    storage = Path(config.DATA) / "webview"
    storage.mkdir(parents=True, exist_ok=True)
    webview.start(private_mode=False, storage_path=str(storage), debug="--debug" in sys.argv)


if __name__ == "__main__":
    main()
