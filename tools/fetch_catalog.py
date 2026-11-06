"""Pull every upload for each channel in channels.json into data/videos.json.

Runs on GitHub Actions with the YOUTUBE_API_KEY secret. Uses the official
YouTube Data API (about 1 quota unit per 50 videos), so a full rescan of a
channel costs a few dozen units out of the free 10,000 per day.

- Shorts (3 minutes or less) are skipped.
- Topic tags already on a video are kept; new videos arrive untagged
  ("topics": []) for the daily tagging task to fill in.
- Descriptions go to data/descriptions.json, which the tagger reads and the
  app never loads, so the app's data file stays small.
"""

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API = "https://www.googleapis.com/youtube/v3/"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHORTS_MAX_SECONDS = 180


def get(endpoint, **params):
    params["key"] = os.environ["YOUTUBE_API_KEY"]
    url = API + endpoint + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def iso_seconds(d):
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", d or "")
    if not m:
        return 0
    days, h, mi, s = (int(x or 0) for x in m.groups())
    return days * 86400 + h * 3600 + mi * 60 + s


def load(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")


def resolve(ch):
    if ch.get("id"):
        res = get("channels", part="snippet,contentDetails", id=ch["id"])
    else:
        res = get("channels", part="snippet,contentDetails", forHandle="@" + ch["handle"].lstrip("@"))
    item = res["items"][0]
    return item["id"], item["snippet"]["title"], item["contentDetails"]["relatedPlaylists"]["uploads"]


def uploads(playlist):
    ids, token = [], None
    while True:
        kw = dict(part="contentDetails", playlistId=playlist, maxResults=50)
        if token:
            kw["pageToken"] = token
        res = get("playlistItems", **kw)
        ids += [i["contentDetails"]["videoId"] for i in res["items"]]
        token = res.get("nextPageToken")
        if not token:
            return ids


def details(ids):
    out = []
    for i in range(0, len(ids), 50):
        res = get("videos", part="snippet,contentDetails,status", id=",".join(ids[i:i + 50]))
        out += res["items"]
    return out


def main():
    channels = load(os.path.join(ROOT, "channels.json"), [])
    vpath = os.path.join(ROOT, "data", "videos.json")
    dpath = os.path.join(ROOT, "data", "descriptions.json")
    old = {v["id"]: v for v in load(vpath, {"videos": []})["videos"]}
    descs = load(dpath, {})

    videos, added, skipped = [], 0, 0
    for ch in channels:
        cid, cname, playlist = resolve(ch)
        name = ch.get("name") or cname
        for item in details(uploads(playlist)):
            vid = item["id"]
            secs = iso_seconds(item["contentDetails"].get("duration"))
            live = item["snippet"].get("liveBroadcastContent", "none")
            if secs <= SHORTS_MAX_SECONDS or live != "none" or item["status"].get("privacyStatus") != "public":
                skipped += 1
                continue
            prev = old.get(vid, {})
            if not prev:
                added += 1
            videos.append({
                "id": vid,
                "title": item["snippet"]["title"],
                "channel": name,
                "channelId": cid,
                "published": item["snippet"]["publishedAt"],
                "seconds": secs,
                "topics": prev.get("topics", []),
            })
            descs[vid] = item["snippet"].get("description", "")
        print(f"{name}: {sum(v['channelId'] == cid for v in videos)} videos")

    keep = {v["id"] for v in videos}
    descs = {k: v for k, v in descs.items() if k in keep}
    videos.sort(key=lambda v: v["published"], reverse=True)
    save(vpath, {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "videos": videos,
    })
    save(dpath, descs)
    untagged = sum(not v["topics"] for v in videos)
    print(f"total {len(videos)}, new {added}, skipped shorts/live/private {skipped}, untagged {untagged}")


if __name__ == "__main__":
    if not os.environ.get("YOUTUBE_API_KEY"):
        sys.exit("YOUTUBE_API_KEY is not set")
    main()
