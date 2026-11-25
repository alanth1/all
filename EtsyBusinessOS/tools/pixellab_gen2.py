"""Round 2 (39 generations): NPC typing / idle / coffee animations, office cat, flying cars.
Sequential (free plan = 1 concurrent job). Resumable via pl/manifest2.json."""
import base64
import json
import sys
import time
from pathlib import Path

import requests

API = "https://api.pixellab.ai/v2"
OUT = Path(__file__).resolve().parent.parent / "app" / "web" / "static" / "game" / "pl"
M1 = json.loads((OUT / "manifest.json").read_text())
MAN = OUT / "manifest2.json"
man = json.loads(MAN.read_text()) if MAN.exists() else {"anims": {}, "cat": {}, "cars": {}}
log = []


def save():
    MAN.write_text(json.dumps(man, indent=1))


def post(path, body):
    for i in range(6):
        r = requests.post(API + path, json=body, timeout=180)
        if r.status_code == 429 or r.status_code >= 500 or (r.status_code == 403 and "at a time" in r.text):
            time.sleep(15 * (i + 1)); continue
        if r.status_code >= 400:
            print("ERR", path, r.status_code, r.text[:300], flush=True); return None
        return r.json()
    return None


def get(path):
    for i in range(5):
        try:
            r = requests.get(API + path, timeout=60); r.raise_for_status(); return r.json()
        except requests.RequestException:
            time.sleep(10)
    raise RuntimeError("GET failed " + path)


def wait(job):
    for _ in range(150):
        st = get(f"/background-jobs/{job}")
        if st.get("status") in ("completed", "failed"):
            return st
        time.sleep(8)
    return {"status": "timeout"}


ANIMS = [  # key, source rotation, motion description, initial pose
    ("typing", "north-west", "seated on an office chair at a desk, typing quickly on a keyboard, arms and shoulders moving, head nodding slightly",
     "sitting on an office chair facing away from the camera, hands on a keyboard"),
    ("idle", "south-east", "idle breathing, chest rising and falling, small weight shift, blinking, glancing around",
     "standing relaxed"),
    ("coffee", "south-east", "raising a coffee mug to the mouth, sipping, lowering the mug again",
     "standing, holding a coffee mug in one hand"),
]


def b64file(path):
    return base64.b64encode(path.read_bytes()).decode()


def save_frames(images, dest_prefix):
    n = 0
    for i, im in enumerate(images or []):
        data = im.get("base64") if isinstance(im, dict) else im
        url = im.get("url") if isinstance(im, dict) else None
        dest = Path(f"{dest_prefix}_{i}.png")
        if data:
            dest.write_bytes(base64.b64decode(data.split(",", 1)[-1])); n += 1
        elif url:
            dl(url, dest); n += 1
    return n


def stage_anims():
    for key, direction, motion, pose in ANIMS:
        for name in M1["characters"]:
            k = f"{name}:{key}"
            if man["anims"].get(k, {}).get("frames"):
                continue
            src = OUT / name / f"rot_{direction}.png"
            body = {"first_frame": {"type": "base64", "base64": b64file(src)}, "description": motion, "frame_count": 8,
                    "no_background": True, "direction": direction, "view": "high top-down", "initial_pose": pose,
                    "subject_description": M1.get("desc", {}).get(name) or "a cyberpunk office worker"}
            res = post("/animate-pixminimax", body)
            if not res:
                man["anims"][k] = {"status": "error"}; save(); continue
            st = wait(res.get("background_job_id"))
            lr = st.get("last_response") or {}
            n = save_frames(lr.get("images"), OUT / name / f"{key}_{direction}") if st.get("status") == "completed" else 0
            man["anims"][k] = {"status": st.get("status"), "frames": n}
            print(name, key, st.get("status"), n, "frames", flush=True)
            save()


def stage_cat():
    c = man["cat"]
    if not c.get("id"):
        res = post("/create-character-with-8-directions", {"description": "small fluffy grey office cat with a tiny neon blue collar",
                                                          "image_size": {"width": 32, "height": 32}, "mode": "standard",
                                                          "template_id": "cat", "view": "high top-down"})
        print("cat", json.dumps(res)[:200] if res else None, flush=True)
        if not res:
            return
        c["id"] = res.get("character_id"); save()
        wait(res["background_job_id"])
    for key, mode, direction, extra in [("walk", "template", "south-east", {"template_animation_id": "walking"}),
                                         ("walk", "template", "north-east", {"template_animation_id": "walking"}),
                                         ("sleep", "v3", "south-east", {"action_description": "curled up sleeping, slow breathing", "frame_count": 8})]:
        k = f"{key}:{direction}"
        if c.get(k) == "completed":
            continue
        body = {"character_id": c["id"], "mode": mode, "directions": [direction], "animation_name": key, **extra}
        if key == "walk" and c.get("walk_group"):
            body["animation_group_id"] = c["walk_group"]; body.pop("animation_name")
        res = post("/characters/animations", body)
        print("cat", k, json.dumps(res)[:200] if res else None, flush=True)
        if not res:
            continue
        if key == "walk":
            c["walk_group"] = res.get("animation_group_id") or c.get("walk_group")
        st = wait((res.get("background_job_ids") or [res.get("background_job_id")])[0])
        c[k] = st.get("status"); save()


CARS = {
    "car_pink": "sleek futuristic flying hover car, side view facing right, glossy black body with pink neon underglow and headlight",
    "car_cyan": "futuristic flying police hover car, side view facing right, white and cyan stripes, blue lights",
    "car_taxi": "futuristic flying taxi hover car, side view facing right, yellow body, glowing windows",
    "car_van": "futuristic flying delivery van, side view facing right, dark purple body with orange lights",
    "car_bike": "futuristic flying hover motorbike with rider, side view facing right, red neon trail",
}


def stage_cars():
    for key, desc in CARS.items():
        if (OUT / f"{key}.png").exists():
            continue
        res = post("/create-image-pixflux", {"description": desc + ", pixel art, night, transparent background",
                                             "image_size": {"width": 64, "height": 32}, "no_background": True,
                                             "detail": "highly detailed", "outline": "selective outline"})
        print(key, "ok" if res else None, flush=True)
        if res and res.get("image"):
            (OUT / f"{key}.png").write_bytes(base64.b64decode(res["image"]["base64"]))
            man["cars"][key] = "ok"; save()


def dl(url, dest):
    r = requests.get(url, timeout=120); r.raise_for_status(); dest.write_bytes(r.content)


def fetch():
    """NPC frames are saved directly by stage_anims; only the cat (own character on this account) is fetched."""
    c = man["cat"]
    if c.get("id"):
        info = get(f"/characters/{c['id']}")
        d = OUT / "CAT"; d.mkdir(exist_ok=True)
        for direction, url in (info.get("rotation_urls") or {}).items():
            if url:
                dl(url if isinstance(url, str) else url["url"], d / f"rot_{direction}.png")
        for anim in info.get("animations") or []:
            t = (anim.get("display_name") or anim.get("animation_type") or "").lower()
            key = "walk" if "walk" in t else "sleep" if "sleep" in t or "curl" in t else None
            if not key:
                continue
            for item in anim.get("directions") or []:
                for i, url in enumerate(item.get("frames") or []):
                    dl(url if isinstance(url, str) else url["url"], d / f"{key}_{item['direction']}_{i}.png")
    print("fetched", flush=True)


if __name__ == "__main__":
    for step in sys.argv[1:]:
        {"anims": stage_anims, "cat": stage_cat, "cars": stage_cars, "fetch": fetch,
         "balance": lambda: print(get("/balance"), flush=True)}[step]()
