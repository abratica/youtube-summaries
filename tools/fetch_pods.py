"""PS Pods: pull RHAP podcast feeds into pods/data/episodes.json.

- Feeds are listed in pods/feeds.json. Feeds with a "show" are all about that show;
  the rest are filtered with the same Reality TV rules PS Tube uses.
- The same episode often appears in several feeds; it's kept once.
- Podcast feeds only carry their latest few hundred episodes, so episodes that drop
  off a feed are kept here - the library grows over time.
- Artwork comes from Apple's podcast directory (no key needed).
"""

import hashlib
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rules_reality  # noqa: E402

UA = {"User-Agent": "PS Pods feed reader (personal podcast app)"}
NS = {"itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd"}
OUT = os.path.join(ROOT, "pods", "data", "episodes.json")


def get(url, timeout=90):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def seconds(d):
    d = (d or "").strip()
    if not d:
        return 0
    if d.isdigit():
        return int(d)
    parts = [int(p) for p in d.split(":") if p.strip().isdigit()]
    total = 0
    for p in parts:
        total = total * 60 + p
    return total


def plain(text, n=320):
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = html.unescape(text)
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:n].rsplit(" ", 1)[0] + "…" if len(text) > n else text


def norm(title):
    return re.sub(r"[^a-z0-9]", "", html.unescape(title).lower().replace("’", "'"))


def lookup(feed_ids):
    """Feed URL + artwork from Apple's directory (falls back to feeds.json)."""
    try:
        r = json.loads(get("https://itunes.apple.com/lookup?" + urllib.parse.urlencode({"id": ",".join(feed_ids), "entity": "podcast"})))
        return {str(x["collectionId"]): x for x in r.get("results", [])}
    except Exception as e:
        print("!! lookup failed:", e)
        return {}


def main():
    feeds = json.load(open(os.path.join(ROOT, "pods", "feeds.json")))
    info = lookup([f["id"] for f in feeds])
    try:
        old = {e["id"]: e for e in json.load(open(OUT))["episodes"]}
    except FileNotFoundError:
        old = {}

    episodes, seen_titles, shows = {}, {}, {}
    for f in feeds:
        meta = info.get(f["id"], {})
        url = meta.get("feedUrl") or f["feed"]
        shows[f["id"]] = {"name": f["name"], "art": meta.get("artworkUrl600") or f.get("art", "")}
        try:
            root = ET.fromstring(get(url))
        except Exception as e:
            print(f"!! {f['name']}: {e}")
            continue
        kept = 0
        for it in root.findall("./channel/item"):
            title = html.unescape((it.findtext("title") or "").strip())
            enc = it.find("enclosure")
            if not title or enc is None or not enc.get("url"):
                continue
            desc = it.findtext("description") or it.findtext("itunes:summary", namespaces=NS) or ""
            topics = rules_reality.classify(title, plain(desc, 220))
            if f.get("show"):
                if not any(t.startswith(f["show"] + "/") for t in topics):
                    topics = [rules_reality.tag_for(f["show"], title, f.get("sub"))] + topics
                elif f.get("sub"):
                    topics = [t.replace(f"{f['show']}/Other Netflix", f"{f['show']}/{f['sub']}") for t in topics]
            if not topics:
                continue
            try:
                pub = parsedate_to_datetime(it.findtext("pubDate")).astimezone(timezone.utc)
            except Exception:
                continue
            key = norm(title)
            dup = seen_titles.get(key)
            if dup and abs((dup - pub).total_seconds()) < 3 * 86400:
                continue  # same episode already taken from another feed
            seen_titles[key] = pub
            guid = (it.findtext("guid") or enc.get("url")).strip()
            eid = hashlib.sha1(guid.encode()).hexdigest()[:12]
            episodes[eid] = {
                "id": eid,
                "title": title,
                "show": f["id"],
                "published": pub.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "seconds": seconds(it.findtext("itunes:duration", namespaces=NS)),
                "audio": enc.get("url"),
                "topics": topics,
                "desc": plain(desc),
            }
            kept += 1
        print(f"{f['name']}: kept {kept}")

    # keep episodes that have dropped off their feeds
    for eid, e in old.items():
        if eid not in episodes and norm(e["title"]) not in seen_titles:
            episodes[eid] = e

    eps = sorted(episodes.values(), key=lambda e: e["published"], reverse=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump({"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "shows": shows, "episodes": eps}, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"total {len(eps)} episodes")


if __name__ == "__main__":
    main()
