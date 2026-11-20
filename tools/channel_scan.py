"""Scan a YouTube channel's uploads and report how many short, single-exercise clips it has.

Used to pick exercise-demo sources for the BraticaFit library. Read-only: it writes
results to scan-out/ and the GitHub job summary, and never touches PS Tube's data.

    YOUTUBE_API_KEY=... python tools/channel_scan.py @SquatUniversity
"""
import json, os, re, sys, urllib.parse, urllib.request

KEY = os.environ["YOUTUBE_API_KEY"]
API = "https://www.googleapis.com/youtube/v3/"

EXERCISE_WORDS = [
    "squat", "deadlift", "rdl", "lunge", "split squat", "step up", "hinge", "hip thrust", "glute bridge", "bridge",
    "press", "bench", "push up", "pushup", "push-up", "pull up", "pullup", "pull-up", "chin up", "row", "pulldown",
    "pull down", "fly", "raise", "curl", "extension", "pushdown", "dip", "plank", "dead bug", "bird dog", "carry",
    "swing", "clean", "snatch", "jerk", "thruster", "calf", "good morning", "face pull", "shrug", "crunch",
    "rotation", "chop", "pallof", "copenhagen", "nordic", "stretch", "mobility", "drill", "lift",
]
NOT_DEMO = ["podcast", "q&a", "vlog", "interview", "story", "reacts", "reaction", "live", "episode"]


def get(path, **params):
    params["key"] = KEY
    with urllib.request.urlopen(API + path + "?" + urllib.parse.urlencode(params), timeout=30) as r:
        return json.load(r)


def seconds(iso):
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m:
        return 0
    d, h, mi, s = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


def bucket(sec):
    for limit, name in [(15, "≤15s"), (30, "16–30s"), (60, "31–60s"), (180, "1–3 min"), (600, "3–10 min"), (1800, "10–30 min")]:
        if sec <= limit:
            return name
    return "30+ min"


def looks_like_demo(title):
    t = title.lower()
    if any(w in t for w in NOT_DEMO):
        return False
    return any(w in t for w in EXERCISE_WORDS)


def main(handle):
    ch = get("channels", part="snippet,contentDetails,statistics", forHandle=handle.lstrip("@"))
    if not ch.get("items"):
        print(f"No channel found for {handle}; skipping")
        return
    c = ch["items"][0]
    uploads = c["contentDetails"]["relatedPlaylists"]["uploads"]
    ids, token = [], None
    while True:
        p = get("playlistItems", part="contentDetails", playlistId=uploads, maxResults=50, **({"pageToken": token} if token else {}))
        ids += [i["contentDetails"]["videoId"] for i in p.get("items", [])]
        token = p.get("nextPageToken")
        if not token:
            break
    videos = []
    for i in range(0, len(ids), 50):
        v = get("videos", part="snippet,contentDetails,statistics,status", id=",".join(ids[i:i + 50]))
        for it in v.get("items", []):
            sec = seconds(it["contentDetails"].get("duration"))
            videos.append({
                "id": it["id"], "title": it["snippet"]["title"], "seconds": sec, "bucket": bucket(sec),
                "published": it["snippet"]["publishedAt"][:10],
                "views": int(it.get("statistics", {}).get("viewCount", 0)),
                "embeddable": it.get("status", {}).get("embeddable", True),
                "demo_like": looks_like_demo(it["snippet"]["title"]),
            })

    order = ["≤15s", "16–30s", "31–60s", "1–3 min", "3–10 min", "10–30 min", "30+ min"]
    counts = {b: sum(1 for v in videos if v["bucket"] == b) for b in order}
    short = [v for v in videos if v["seconds"] <= 60]
    short_demo = [v for v in short if v["demo_like"]]
    blocked = sum(1 for v in videos if not v["embeddable"])

    os.makedirs("scan-out", exist_ok=True)
    slug = handle.lstrip("@").lower()
    meta = {"slug": slug, "channel": c["snippet"]["title"], "handle": handle,
            "subscribers": int(c["statistics"].get("subscriberCount", 0)), "total": len(videos),
            "thumb": c["snippet"].get("thumbnails", {}).get("default", {}).get("url"), "counts": counts}
    # Compact file the BraticaFit coach Library reads: [id, title, seconds, published, views]
    with open(f"scan-out/{slug}.json", "w") as f:
        json.dump({**meta, "videos": [[v["id"], v["title"], v["seconds"], v["published"], v["views"]]
                                      for v in videos if v["embeddable"]]}, f, separators=(",", ":"), ensure_ascii=False)
    with open(f"scan-out/{slug}.meta.json", "w") as f:
        json.dump(meta, f, ensure_ascii=False)

    lines = [f"## {c['snippet']['title']} ({handle})", "",
             f"{len(videos)} uploads · {int(c['statistics'].get('subscriberCount', 0)):,} subscribers · {blocked} block embedding", "",
             "| Length | Videos |", "|---|---|"] + [f"| {b} | {counts[b]} |" for b in order] + [
             "", f"**Under 60s: {len(short)}, of which {len(short_demo)} have an exercise name in the title.**", "",
             "### Short clips with exercise titles (most viewed first)", "", "| Length | Title | Views |", "|---|---|---|"]
    for v in sorted(short_demo, key=lambda v: -v["views"])[:60]:
        lines.append(f"| {v['seconds']}s | [{v['title'].replace('|', '/')}](https://youtu.be/{v['id']}) | {v['views']:,} |")
    report = "\n".join(lines)
    print(report)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as f:
            f.write(report + "\n")


if __name__ == "__main__":
    for h in sys.argv[1:]:
        main(h)
