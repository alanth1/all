"""Round 3 (40 generations): emotion animations for the 10 NPCs via image-based pixminimax."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import pixellab_gen2 as g  # noqa: E402

MAN = g.OUT / "manifest3.json"
man = json.loads(MAN.read_text()) if MAN.exists() else {}
EMOTIONS = [
    ("celebrate", "celebrating happily, pumping a fist in the air, small joyful jump, big smile", "standing relaxed"),
    ("frustrated", "frustrated and annoyed, both hands grabbing the head, shaking the head, then a facepalm", "standing relaxed"),
    ("talk", "talking to someone, explaining with lively hand gestures, nodding", "standing relaxed"),
    ("yawn", "yawning widely and stretching both arms above the head, sleepy", "standing relaxed"),
]
for key, motion, pose in EMOTIONS:
    for name in g.M1["characters"]:
        k = f"{name}:{key}"
        if man.get(k, {}).get("frames"):
            continue
        src = g.OUT / name / "rot_south-east.png"
        body = {"first_frame": {"type": "base64", "base64": g.b64file(src)}, "description": motion, "frame_count": 8,
                "no_background": True, "direction": "south-east", "view": "high top-down", "initial_pose": pose,
                "subject_description": "a cyberpunk office worker"}
        res = g.post("/animate-pixminimax", body)
        if not res:
            man[k] = {"status": "error"}; MAN.write_text(json.dumps(man, indent=1)); continue
        st = g.wait(res.get("background_job_id"))
        n = g.save_frames((st.get("last_response") or {}).get("images"), g.OUT / name / f"{key}_south-east") if st.get("status") == "completed" else 0
        man[k] = {"status": st.get("status"), "frames": n}
        MAN.write_text(json.dumps(man, indent=1))
        print(name, key, st.get("status"), n, flush=True)
print(g.get("/balance"), flush=True)
