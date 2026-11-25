"""Render isometric layout guides (blockouts) for the three towers: walkways, lift, bridge doors, desks and seats.
Two versions per tower: clean (attach to Gemini as composition guide) and annotated (for the owner)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "docs" / "layout"
W, H = 1116, 2000
UX, VX = (50.5, 25.2), (-49.5, 24.7)
PLANES = {"u": (565, 825), "l": (570, 1325)}
WALL = {"u": 470, "l": 430}


def P(lv, u, v, z=0):
    B = PLANES[lv]
    return (B[0] + u * UX[0] + v * VX[0], B[1] + u * UX[1] + v * VX[1] - z)


def quad(d, pts, fill, outline=None, width=2):
    d.polygon(pts, fill=fill, outline=outline, width=width)


def box(d, lv, u, v, a, b, h, top, left, right, line=(10, 10, 20)):
    A = lambda uu, vv, z=0: P(lv, uu, vv, z)
    quad(d, [A(u, v + b), A(u + a, v + b), A(u + a, v + b, h), A(u, v + b, h)], left, line)
    quad(d, [A(u + a, v), A(u + a, v + b), A(u + a, v + b, h), A(u + a, v, h)], right, line)
    quad(d, [A(u, v, h), A(u + a, v, h), A(u + a, v + b, h), A(u, v + b, h)], top, line)


FLOOR_U = [(0, 0), (10, 0), (10, 3.6), (4.5, 3.6), (4.5, 10), (0, 10)]
LIFT = (8.4, 0, 1.6, 1.8)
# walkways (rectangles in grid units u0,v0,u1,v1)
WALK = {
    "l": [(1.8, 2.2, 10, 3.6), (1.8, 2.2, 3.2, 10), (8.4, 1.8, 10, 3.6), (3.2, 5.6, 10, 7.0)],
    "u": [(2.0, 1.8, 10, 3.2), (2.0, 1.8, 3.4, 10)],
}
DOORS = {"l": [(2.5, 10, "v"), (10, 6.3, "u")]}   # bridge doors: left side (front-left edge) and right side

# Desks: (u, v, a, b, wall, label); seat is in front of the desk (back of the NPC to the camera)
TOWERS = {
    1: {"u": [("COMMAND DECK", [(0, 3.6, 1.2, 3.0, "L", "KAI-07 desk")], [(0, 0, .9, 1.6, "bookshelf"), (0, 7.4, .9, 1.4, "holo table (low)")]),
              ("RESEARCH LAB", [(4.6, 0, 2.6, 1.2, "R", "RAZE-11 desk")], [(2.6, 0, 1.6, .6, "whiteboard")])],
        "l": [("SERVER ROOM", [(0, 0, .9, 1.0, "-", "rack"), (1.0, 0, .9, 1.0, "-", "rack"), (0, 4.0, 1.2, 3.0, "L", "ZERO-1 desk")], [(0, 1.1, .9, 1.0, "rack"), (0, 8.0, 1.0, 1.4, "cooling unit")]),
              ("ARCHIVE", [(4.6, 0, 2.6, 1.2, "R", "SABLE-6 desk")], [(2.2, 0, 1.0, .9, "cabinet"), (3.3, 0, 1.0, .9, "cabinet"), (7.8, 8.0, 1.6, 1.0, "boxes (low)")])]},
    2: {"u": [("WRITERS STUDIO", [(0, 3.6, 1.2, 3.0, "L", "JUNO-X9 desk")], [(0, 0, .8, 2.4, "bookshelf"), (0, 7.6, 1.2, 1.2, "bean bag (low)")]),
              ("QA BAY", [(4.6, 0, 2.6, 1.2, "R", "VOLT-3 desk")], [(2.6, 0, 1.6, .9, "scanner arch")])],
        "l": [("SHOP FLOOR", [(0, 4.0, 1.2, 3.0, "L", "NYX-21 desk + approval button")], [(0, 0, 1.0, 2.4, "shop counter"), (4.2, 8.0, 2.2, 1.2, "packing table (low)")]),
              ("FINANCE VAULT", [(4.6, 0, 2.6, 1.2, "R", "KADE-12 desk")], [(2.2, 0, 1.4, .3, "vault door (wall)"), (3.4, .2, 1.0, .9, "safe"), (7.6, 8.0, 1.4, 1.0, "gold coins (low)")])]},
    3: {"u": [("GROWTH STUDIO", [(0, 3.6, 1.2, 3.0, "L", "HEX-04 desk")], [(0, 0, .3, 2.6, "green screen"), (0, 7.6, 1.2, 1.2, "bean bag (low)")]),
              ("DATA ROOM", [(4.6, 0, 2.6, 1.2, "R", "ORIN-88 desk")], [(2.6, 0, 1.6, .3, "dashboard wall")])],
        "l": [("LOUNGE & PANTRY", [], [(0, 0, 1.0, 1.0, "vending"), (0, 1.1, .9, .9, "coffee"), (1.1, 0, 1.0, .9, "fridge"), (2.3, 0, 1.0, .9, "arcade blue"), (3.5, 0, 1.0, .9, "arcade pink"),
                                         (0, 4.0, 1.2, 2.6, "couch (low)"), (1.6, 4.4, 1.0, 1.8, "coffee table (low)"), (4.4, 8.0, 1.2, 1.2, "bean bag (low)"), (6.0, 8.2, 1.2, 1.2, "bean bag (low)"), (6.6, 3.8, 2.6, 1.4, "ping-pong (low)")])]},
}


def seat_of(d):
    u, v, a, b, wall, _ = d
    return (u + a / 2, v + b + .7) if wall == "R" else (u + a + .7, v + b / 2) if wall == "L" else None


def render(t, annotated):
    im = Image.new("RGB", (W, H), (14, 13, 30)); d = ImageDraw.Draw(im, "RGBA")
    try:
        font = ImageFont.truetype("/home/user/all/EtsyBusinessOS/app/web/static/game/fonts/VT323.ttf", 26)
    except OSError:
        font = ImageFont.load_default()
    for lv in ("l", "u"):
        Hh = WALL[lv]
        # back walls
        quad(d, [P(lv, 0, 0), P(lv, 0, 10), P(lv, 0, 10, Hh), P(lv, 0, 0, Hh)], (44, 42, 82, 255), (8, 8, 18))
        quad(d, [P(lv, 0, 0), P(lv, 10, 0), P(lv, 10, 0, Hh), P(lv, 0, 0, Hh)], (38, 52, 96, 255), (8, 8, 18))
        for k in range(1, 5):   # window mullions on the right wall
            a, b = P(lv, k * 2, 0, 40), P(lv, k * 2, 0, Hh - 40); d.line([a, b], fill=(90, 140, 200), width=3)
        a, b = P(lv, 0, 0, Hh - 20), P(lv, 10, 0, Hh - 20); d.line([a, b], fill=(103, 232, 249), width=8)
        a, b = P(lv, 0, 0, Hh - 20), P(lv, 0, 10, Hh - 20); d.line([a, b], fill=(192, 132, 252), width=8)
        # floor
        fl = [P(lv, *p) for p in (FLOOR_U if lv == "u" else [(0, 0), (10, 0), (10, 10), (0, 10)])]
        quad(d, fl, (70, 80, 120, 255), (8, 8, 18), 3)
        for k in range(0, 11, 2):
            d.line([P(lv, k, 0), P(lv, k, 10 if lv == 'l' or k <= 4.5 else 3.6)], fill=(60, 68, 104), width=1)
            d.line([P(lv, 0, k), P(lv, 10 if lv == 'l' or k <= 3.6 else 4.5, k)], fill=(60, 68, 104), width=1)
        # walkways
        for (u0, v0, u1, v1) in WALK[lv]:
            quad(d, [P(lv, u0, v0), P(lv, u1, v0), P(lv, u1, v1), P(lv, u0, v1)], (34, 211, 238, 70))
            d.line([P(lv, u0, v0), P(lv, u1, v0), P(lv, u1, v1), P(lv, u0, v1), P(lv, u0, v0)], fill=(34, 211, 238, 200), width=2)
        # lift (glass box spanning the level)
        lu, lvv, la, lb = LIFT
        box(d, lv, lu, lvv, la, lb, Hh - 30, (140, 200, 240, 60), (140, 200, 240, 70), (120, 180, 230, 70), line=(103, 232, 249))
        door = [P(lv, lu, lvv + lb), P(lv, lu + la, lvv + lb), P(lv, lu + la, lvv + lb, 180), P(lv, lu, lvv + lb, 180)]
        quad(d, door, (103, 232, 249, 90), (103, 232, 249), 3)
        # bridge doors
        for (u, v, axis) in DOORS.get(lv, []):
            if axis == "v":
                pts = [P(lv, u - .8, v), P(lv, u + .8, v), P(lv, u + .8, v, 180), P(lv, u - .8, v, 180)]
            else:
                pts = [P(lv, u, v - .8), P(lv, u, v + .8), P(lv, u, v + .8, 180), P(lv, u, v - .8, 180)]
            quad(d, pts, (8, 10, 30, 230), (34, 211, 238), 4)
        # furniture blockouts, painter-sorted (back to front)
        items = []
        for room, desks, props in TOWERS[t][lv]:
            for dsk in desks: items.append(("desk", dsk))
            for pr in props: items.append(("prop", pr))
            if annotated:
                cu, cv = (2.2, 6) if room in ("COMMAND DECK", "WRITERS STUDIO", "GROWTH STUDIO", "SERVER ROOM", "SHOP FLOOR") else (5.8, 2.2) if lv == "u" else (6.6, 6.0)
                if room == "LOUNGE & PANTRY":
                    cu, cv = 5, 5
                x, y = P(lv, cu, cv, 300 if lv == "l" else 330); d.text((x - 70, y), room, fill=(250, 204, 21), font=font)
        items.sort(key=lambda it: (it[1][0] + it[1][2]) + (it[1][1] + it[1][3]))
        for kind, it in items:
            if kind == "desk":
                u, v, a, b, wall, label = it
                hh = 70 if wall != "-" else 200
                box(d, lv, u, v, a, b, hh, (120, 120, 150), (80, 80, 110), (60, 60, 90))
                if wall == "R":
                    box(d, lv, u + .2, v + .15, a - .4, .25, hh + 55, (40, 220, 250), (30, 160, 200), (20, 120, 160))
                elif wall == "L":
                    box(d, lv, u + .15, v + .2, .25, b - .4, hh + 55, (40, 220, 250), (30, 160, 200), (20, 120, 160))
                s = seat_of(it)
                if s:
                    x, y = P(lv, *s); d.ellipse([x - 22, y - 11, x + 22, y + 11], outline=(244, 114, 182), width=4)
                if annotated:
                    x, y = P(lv, u + a / 2, v + b / 2, hh + 90); d.text((x - 60, y), label, fill=(255, 255, 255), font=font)
            else:
                u, v, a, b, label = it
                box(d, lv, u, v, a, b, 60 if "(low)" in label else 160, (150, 140, 170), (110, 100, 130), (90, 80, 110))
                if annotated:
                    x, y = P(lv, u + a / 2, v + b / 2, 190); d.text((x - 40, y), label, fill=(220, 220, 240), font=font)
    # mezzanine glass railing (front edges of the upper level)
    rail = [(4.5, 10), (0, 10)]
    for (a1, b1), (a2, b2) in [((0, 10), (4.5, 10)), ((4.5, 10), (4.5, 3.6)), ((4.5, 3.6), (10, 3.6))]:
        quad(d, [P("u", a1, b1), P("u", a2, b2), P("u", a2, b2, 70), P("u", a1, b1, 70)], (150, 200, 240, 60), (150, 220, 250), 2)
    if annotated:
        d.text((40, 1930), f"TOWER {t}: cyan = walkway (keep empty)   pink ring = seat (no chair painted)   dark door = skybridge   glass box = lift", fill=(255, 255, 255), font=font)
    return im


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for t in (1, 2, 3):
        render(t, False).save(OUT / f"tower{t}_guide.png")
        render(t, True).save(OUT / f"tower{t}_annotated.png")
    print("ok")
