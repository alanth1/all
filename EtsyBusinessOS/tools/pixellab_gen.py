"""One-off asset generation with PixelLab API v2 (token injected by the environment proxy, or PIXELLAB_TOKEN).
Stages: characters -> walking animations -> isometric tiles. Resumable via manifest.json."""
import base64
import json
import os
import sys
import time
from pathlib import Path

import requests

API = "https://api.pixellab.ai/v2"
OUT = Path(__file__).resolve().parent.parent / "app" / "web" / "static" / "game" / "pl"
OUT.mkdir(parents=True, exist_ok=True)
MAN = OUT / "manifest.json"
H = {"Authorization": f"Bearer {os.environ['PIXELLAB_TOKEN']}"} if os.environ.get("PIXELLAB_TOKEN") else {}
man = json.loads(MAN.read_text()) if MAN.exists() else {"characters": {}, "tiles": {}}

NPCS = {
    "KAI-07": "cyberpunk office chief, long dark coat, short silver hair, cyan visor glasses",
    "RAZE-11": "cyberpunk data researcher, green hoodie, headset, holding a glowing tablet",
    "JUNO-X9": "cyberpunk copywriter woman, purple bob hair, oversized lilac sweater",
    "VOLT-3": "cyberpunk quality inspector, yellow utility jacket, goggles on forehead",
    "NYX-21": "cyberpunk shop manager woman, black jacket with pink neon trim, long black ponytail",
    "HEX-04": "cyberpunk social media creator, pink hair buns, colorful bomber jacket",
    "SABLE-6": "cyberpunk archivist, brown trench coat, round glasses, short brown hair",
    "ORIN-88": "cyberpunk data analyst man, blue shirt and tie, neon blue cybernetic arm",
    "KADE-12": "cyberpunk accountant woman, white blazer, dark skin, neat hair bun",
    "ZERO-1": "cyberpunk technician, orange work overalls, tool belt, red beanie",
}
TILES = {
    "floor_office": "dark blue-grey office floor panel with subtle cyan seams, cyberpunk",
    "floor_lab": "white clinical lab floor tile with faint green grid lines",
    "floor_studio": "purple carpet floor tile, soft texture, cyberpunk studio",
    "floor_qa": "dark metal floor plate with yellow hazard stripe edge",
    "floor_shop": "polished dark wooden floor boards with pink neon reflection",
    "floor_growth": "magenta glossy floor tile with pixel pattern",
    "floor_archive": "old brown parquet floor tile, worn",
    "floor_data": "dark navy floor tile with glowing blue circuit lines",
    "floor_finance": "black marble floor tile with gold veins",
    "floor_server": "steel grate floor tile over cables, industrial, dark",
}


def save():
    MAN.write_text(json.dumps(man, indent=1))


def post(path, body):
    for i in range(5):
        r = requests.post(API + path, json=body, headers=H, timeout=120)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(10 * (i + 1))
            continue
        if r.status_code >= 400:
            print("ERR", path, r.status_code, r.text[:400])
            return None
        return r.json()
    return None


def get(path):
    r = requests.get(API + path, headers=H, timeout=60)
    r.raise_for_status()
    return r.json()


def dl(url, dest: Path):
    if url.startswith("data:"):
        dest.write_bytes(base64.b64decode(url.split(",", 1)[1]))
        return
    r = requests.get(url, timeout=120)
    r.raise_for_status()
    dest.write_bytes(r.content)


def stage_characters():
    for name, desc in NPCS.items():
        c = man["characters"].setdefault(name, {})
        if c.get("id"):
            continue
        res = post("/create-character-with-8-directions", {
            "description": desc, "image_size": {"width": 48, "height": 48}, "mode": "standard",
            "view": "high top-down", "outline": "single color black outline", "shading": "medium shading",
            "detail": "medium detail", "proportions": {"type": "preset", "name": "chibi"}})
        print(name, json.dumps(res)[:300])
        if res:
            c["id"] = res.get("character_id") or (res.get("data") or {}).get("character_id")
            c["job"] = res.get("background_job_id")
            save()


def wait_jobs(key="job"):
    pending = True
    while pending:
        pending = False
        for name, c in man["characters"].items():
            j = c.get(key)
            if not j or c.get(key + "_done"):
                continue
            st = get(f"/background-jobs/{j}")
            s = st.get("status")
            if s == "completed":
                c[key + "_done"] = True
                save()
            elif s == "failed":
                print("FAILED", name, key, json.dumps(st)[:400])
                c[key + "_done"] = "failed"
                save()
            else:
                pending = True
        if pending:
            time.sleep(15)


def fetch_characters():
    for name, c in man["characters"].items():
        if not c.get("id"):
            continue
        info = get(f"/characters/{c['id']}")
        (OUT / f"{name}.json").write_text(json.dumps(info, indent=1))
        rot = info.get("rotation_urls") or info.get("rotations") or {}
        d = OUT / name
        d.mkdir(exist_ok=True)
        for direction, url in (rot.items() if isinstance(rot, dict) else []):
            if isinstance(url, dict):
                url = url.get("url")
            if url:
                dl(url, d / f"rot_{direction}.png")
        for anim in info.get("animations", []) or []:
            if (anim.get("animation_type") or anim.get("name") or "") not in ("walking", "walk"):
                continue
            dirs = anim.get("directions") or []
            items = dirs if isinstance(dirs, list) else [{"direction": k, "frames": v} for k, v in dirs.items()]
            for item in items:
                for i, f in enumerate(item.get("frames") or []):
                    url = f.get("url") if isinstance(f, dict) else f
                    if url:
                        dl(url, d / f"walk_{item['direction']}_{i}.png")
        print("fetched", name, sorted(p.name for p in d.iterdir())[:4], "...")


def wait_job(job, label=""):
    for _ in range(120):
        st = get(f"/background-jobs/{job}")
        if st.get("status") in ("completed", "failed"):
            if st.get("status") == "failed":
                print("FAILED", label, json.dumps(st)[:300])
            return st.get("status")
        time.sleep(10)
    return "timeout"


def stage_animations():
    """Free plan allows 1 concurrent generation: one direction per call, wait for each."""
    for name, c in man["characters"].items():
        if not c.get("id"):
            continue
        done = c.setdefault("walk_done_dirs", [])
        for direction in ("south-east", "north-east"):
            if direction in done:
                continue
            body = {"character_id": c["id"], "mode": "template", "template_animation_id": "walking", "directions": [direction]}
            if c.get("walk_group"):
                body["animation_group_id"] = c["walk_group"]
            else:
                body["animation_name"] = "walk"
            res = post("/characters/animations", body)
            print(name, direction, json.dumps(res)[:240], flush=True)
            if not res:
                continue
            c["walk_group"] = res.get("animation_group_id") or c.get("walk_group")
            jobs = res.get("background_job_ids") or [res.get("background_job_id")]
            st = wait_job(jobs[0], f"{name} {direction}")
            if st == "completed":
                done.append(direction)
            save()


def stage_tiles():
    for key, desc in TILES.items():
        t = man["tiles"].setdefault(key, {})
        if t.get("file"):
            continue
        res = post("/create-isometric-tile", {"description": desc, "image_size": {"width": 32, "height": 32},
                                             "isometric_tile_size": 32, "isometric_tile_shape": "thin tile",
                                             "outline": "lineless", "shading": "basic shading", "detail": "medium detail"})
        print(key, json.dumps(res)[:200] if res else None)
        if not res:
            continue
        job = res.get("background_job_id")
        t["job"] = job
        t["id"] = res.get("tile_id") or res.get("id")
        save()


def fetch_tiles():
    for key, t in man["tiles"].items():
        if t.get("file") or not t.get("job"):
            continue
        for _ in range(40):
            st = get(f"/background-jobs/{t['job']}")
            if st.get("status") in ("completed", "failed"):
                break
            time.sleep(10)
        (OUT / f"tile_{key}.json").write_text(json.dumps(st, indent=1)[:200000])
        lr = st.get("last_response") or {}
        img = (lr.get("image") or {}).get("base64") or lr.get("image_base64") or (lr.get("image") if isinstance(lr.get("image"), str) else None)
        url = lr.get("image_url") or lr.get("url")
        dest = OUT / f"tile_{key}.png"
        if img:
            dest.write_bytes(base64.b64decode(img.split(",", 1)[-1]))
        elif url:
            dl(url, dest)
        else:
            print("no image for", key, json.dumps(st)[:500])
            continue
        t["file"] = dest.name
        save()


if __name__ == "__main__":
    step = sys.argv[1]
    {"chars": stage_characters, "wait": lambda: wait_jobs("job"), "anims": stage_animations,
     "waitanims": lambda: wait_jobs("walk_job"), "fetch": fetch_characters, "tiles": stage_tiles, "fetchtiles": fetch_tiles,
     "balance": lambda: print(get("/balance"))}[step]()
