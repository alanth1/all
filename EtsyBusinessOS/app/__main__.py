"""Entry point: python -m app  (START.bat runs this)."""
from __future__ import annotations

import logging
import logging.handlers
import sys
import threading
import webbrowser

from . import config


def setup_logging():
    config.LOGS.mkdir(parents=True, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    fh = logging.handlers.RotatingFileHandler(config.LOGS / "app.log", maxBytes=5_000_000, backupCount=5, encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(fh)
    root.addHandler(sh)


def main():
    setup_logging()
    import socket
    s = socket.socket()
    try:
        s.bind((config.HOST, config.PORT))
    except OSError:
        print(f"Etsy Business OS already seems to be running - opening {config.BASE_URL}")
        webbrowser.open(config.BASE_URL)
        return
    finally:
        s.close()
    import uvicorn
    from .web.server import app
    if "--no-browser" not in sys.argv:
        threading.Timer(2.0, lambda: webbrowser.open(config.BASE_URL)).start()
    print(f"Etsy Business OS {config.VERSION} running at {config.BASE_URL}  (close this window to stop)")
    uvicorn.run(app, host=config.HOST, port=config.PORT, log_level="warning")


if __name__ == "__main__":
    main()
