"""Tiny read-only MP4/MOV metadata parser (duration, width, height) - no ffmpeg needed."""
from __future__ import annotations

import struct
from pathlib import Path

CONTAINERS = {b"moov", b"trak", b"mdia", b"minf", b"stbl", b"edts"}


def _boxes(fh, start: int, end: int):
    pos = start
    while pos + 8 <= end:
        fh.seek(pos)
        hdr = fh.read(8)
        if len(hdr) < 8:
            return
        size, typ = struct.unpack(">I4s", hdr)
        header = 8
        if size == 1:
            size = struct.unpack(">Q", fh.read(8))[0]
            header = 16
        elif size == 0:
            size = end - pos
        if size < header:
            return
        yield typ, pos + header, pos + size
        pos += size


def probe(path: Path) -> dict:
    out: dict = {}
    with open(path, "rb") as fh:
        fh.seek(0, 2)
        total = fh.tell()
        for typ, s, e in _boxes(fh, 0, total):
            if typ != b"moov":
                continue
            for t2, s2, e2 in _boxes(fh, s, e):
                if t2 == b"mvhd":
                    fh.seek(s2)
                    ver = fh.read(1)[0]
                    fh.read(3)
                    if ver == 1:
                        fh.read(16)
                        ts, dur = struct.unpack(">IQ", fh.read(12))
                    else:
                        fh.read(8)
                        ts, dur = struct.unpack(">II", fh.read(8))
                    if ts:
                        out["duration_s"] = round(dur / ts, 2)
                elif t2 == b"trak":
                    w, h, is_video = None, None, False
                    for t3, s3, e3 in _boxes(fh, s2, e2):
                        if t3 == b"tkhd":
                            fh.seek(s3)
                            ver = fh.read(1)[0]
                            skip = 3 + (32 if ver == 1 else 20) + 8 + 2 + 2 + 2 + 2 + 36
                            fh.seek(s3 + 1 + skip)
                            w, h = struct.unpack(">II", fh.read(8))
                            w, h = w >> 16, h >> 16
                        elif t3 == b"mdia":
                            for t4, s4, e4 in _boxes(fh, s3, e3):
                                if t4 == b"hdlr":
                                    fh.seek(s4 + 8)
                                    is_video = fh.read(4) == b"vide"
                    if is_video and w:
                        out["width"], out["height"] = w, h
    return out
