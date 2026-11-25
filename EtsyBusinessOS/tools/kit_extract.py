"""Cut furniture sprites out of the Gemini asset sheets (chroma key + connected components)."""
import json, sys
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

KIT = Path(__file__).resolve().parent.parent / "app" / "web" / "static" / "game" / "kit"
OUT = KIT / "obj"; OUT.mkdir(exist_ok=True)


def key_mask(a, kind):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    if kind == "green":
        bg = (g - np.maximum(r, b) > 55) & (g > 150)
    else:
        bg = ((r - g) > 70) & ((b - g) > 70) & (np.abs(r - b) < 90)
    return ~bg


def despill(a, kind):
    a = a.astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if kind == "green":
        g2 = np.minimum(g, np.maximum(r, b) + 12); a[..., 1] = g2
    else:
        m = np.minimum(r, b); a[..., 0] = np.minimum(r, g + 60 + (r - m)); a[..., 2] = np.minimum(b, g + 60 + (b - m))
    return a.clip(0, 255).astype(np.uint8)


def components(mask, min_px):
    h, w = mask.shape
    # dilate a bit so thin parts (tripod legs) stay connected
    m = mask.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (2, 0), (-2, 0), (0, 2), (0, -2)):
        m |= np.roll(np.roll(mask, dy, 0), dx, 1)
    seen = np.zeros_like(m); comps = []
    for y0 in range(0, h, 3):
        for x0 in range(0, w, 3):
            if not m[y0, x0] or seen[y0, x0]:
                continue
            q = deque([(y0, x0)]); seen[y0, x0] = True; pts = []
            while q:
                y, x = q.popleft(); pts.append((y, x))
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; q.append((ny, nx))
            if len(pts) >= min_px:
                ys, xs = zip(*pts); comps.append((min(ys), min(xs), max(ys), max(xs), len(pts)))
    return sorted(comps, key=lambda c: (round((c[0] + c[2]) / 2 / 250), c[1]))


SHEETS = {
    "sheet_work.jpg": ("magenta", ["desk3", "desk2", "desk_l", "chair", "rack", "cabinet", "bookshelf", "_ghost", "_bit", "whiteboard", "holo", "plant_small", "boxes", "counter", "safe", "_bit2", "packing"]),
    "sheet_lounge2.jpg": ("green", ["vending", "coffee", "water", "fridge", "couch", "coffee_table", "bean_teal", "bean_blue", "bean_purple", "arcade_blue", "arcade_pink", "pingpong", "ringlight", "camera", "lamp", "plant_big"]),
    "sheet_extra.jpg": ("green", ["vault_door", "coins", "scanner", "cooler", "cables", "snack_shelf", "trash", "side_table", "papers", "tv_chart"]),
}

BOXES = {  # explicit crops (x0, y0, x1, y1) where auto components merge with Gemini "ghost" artifacts
    "sheet_work.jpg": {"desk3": (51, 138, 375, 431), "desk2": (452, 157, 683, 400), "desk_l": (737, 126, 1077, 378),
                       "chair": (95, 549, 251, 801), "rack": (352, 490, 526, 822), "cabinet": (608, 538, 764, 792),
                       "bookshelf": (851, 502, 1033, 803), "whiteboard": (46, 895, 282, 1211), "holo": (340, 930, 581, 1186),
                       "boxes": (834, 970, 1046, 1184), "counter": (52, 1330, 350, 1600), "safe": (429, 1307, 647, 1587),
                       "packing": (740, 1315, 1061, 1591)},
    "sheet_extra.jpg": {"vault_door": (32, 137, 281, 483), "coins": (318, 192, 551, 399), "scanner": (589, 90, 852, 510),
                        "cooler": (881, 106, 1088, 500), "cables": (24, 728, 396, 974), "snack_shelf": (458, 644, 718, 958),
                        "trash": (845, 693, 1048, 969), "side_table": (74, 1176, 298, 1502), "papers": (383, 1215, 726, 1476),
                        "tv_chart": (799, 1141, 1059, 1487)},
}


def crop_save(a, mask, kind, name, box, manifest):
    x0, y0, x1, y1 = box
    crop = despill(a[y0:y1 + 1, x0:x1 + 1], kind)
    alpha = (mask[y0:y1 + 1, x0:x1 + 1] * 255).astype(np.uint8)
    rgba = np.dstack([crop, alpha])
    # drop small detached islands (Gemini ghost bits), keep pieces >= 4% of the largest
    comps = components(alpha > 0, 30)
    if comps:
        big = max(c[4] for c in comps)
        for (cy0, cx0, cy1, cx1, n) in comps:
            if n < big * 0.04:
                rgba[cy0:cy1 + 1, cx0:cx1 + 1, 3] = 0
    alpha = rgba[..., 3]
    ys, xs = np.nonzero(alpha)
    rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    Image.fromarray(rgba, "RGBA").save(OUT / f"{name}.webp", "WEBP", quality=92, method=6)
    manifest[name] = {"w": int(rgba.shape[1]), "h": int(rgba.shape[0])}


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "final":
    manifest = {}
    for f in OUT.glob("*.webp"):
        f.unlink()
    for fname, (kind, names) in SHEETS.items():
        a = np.asarray(Image.open(KIT / fname).convert("RGB")); mask = key_mask(a, kind)
        if fname in BOXES:
            for name, box in BOXES[fname].items():
                crop_save(a, mask, kind, name, box, manifest)
        else:
            for i, (y0, x0, y1, x1, n) in enumerate(components(mask, 1500)):
                if i < len(names) and not names[i].startswith("_"):
                    crop_save(a, mask, kind, names[i], (x0, y0, x1, y1), manifest)
    (KIT / "objects.json").write_text(json.dumps(manifest, indent=1))
    print(len(manifest), "objects:", ", ".join(sorted(manifest)))
    sys.exit(0)

if __name__ == "__main__":
    manifest = {}
    S = Path("/tmp/claude-0/-home-user-all/f8bd9113-fa2c-5c29-bb04-e1c093cdd8a1/scratchpad")
    for fname, (kind, names) in SHEETS.items():
        im = Image.open(KIT / fname).convert("RGB"); a = np.asarray(im)
        mask = key_mask(a, kind)
        comps = components(mask, 1500)
        dbg = im.copy(); d = ImageDraw.Draw(dbg)
        print(fname, len(comps), "objects")
        for i, (y0, x0, y1, x1, n) in enumerate(comps):
            name = names[i] if i < len(names) else f"_x{i}"
            d.rectangle([x0, y0, x1, y1], outline=(255, 0, 0), width=3); d.text((x0 + 4, y0 + 4), f"{i}:{name}", fill=(255, 255, 0))
            print(f"  {i:2d} {name:14s} box=({x0},{y0},{x1},{y1}) px={n}")
            if name.startswith("_"):
                continue
            crop = despill(a[y0:y1 + 1, x0:x1 + 1], kind)
            alpha = (mask[y0:y1 + 1, x0:x1 + 1] * 255).astype(np.uint8)
            Image.fromarray(np.dstack([crop, alpha]), "RGBA").save(OUT / f"{name}.webp", "WEBP", quality=92, method=6)
            manifest[name] = {"w": int(x1 - x0 + 1), "h": int(y1 - y0 + 1)}
        dbg.resize((dbg.width // 2, dbg.height // 2)).save(S / f"lbl_{fname}.png")
    (KIT / "objects.json").write_text(json.dumps(manifest, indent=1))
