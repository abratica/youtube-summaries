import json, os, sys
sys.path.insert(0, "tools")
import fetch_catalog as f
out = {"tried": []}
cid = None
for h in ["RobHasAPodcast", "RHAP", "robhasapodcast", "RobCesternino"]:
    try:
        r = f.get("channels", part="snippet,contentDetails,statistics", forHandle="@" + h)
        out["tried"].append([h, [(i["id"], i["snippet"]["title"], i["statistics"].get("videoCount")) for i in r.get("items", [])]])
        if r.get("items") and not cid and "rob" in r["items"][0]["snippet"]["title"].lower():
            cid = r["items"][0]["id"]
    except Exception as e:
        out["tried"].append([h, str(e)])
if not cid:
    r = f.get("search", part="snippet", q="Rob Has a Podcast", type="channel", maxResults=5)
    out["search"] = [(i["snippet"]["channelId"], i["snippet"]["title"]) for i in r["items"]]
    cid = r["items"][0]["snippet"]["channelId"]
cid, name, pl = f.resolve({"id": cid})
out["channel"] = [cid, name]
vids = []
for item in f.details(f.uploads(pl)):
    vids.append({"id": item["id"], "t": item["snippet"]["title"], "s": f.iso_seconds(item["contentDetails"].get("duration")),
                 "p": item["snippet"]["publishedAt"][:10], "live": item["snippet"].get("liveBroadcastContent"),
                 "priv": item["status"].get("privacyStatus"), "d": item["snippet"].get("description", "")[:400]})
out["count"] = len(vids)
json.dump(out, open("probe/meta.json", "w"), indent=1)
json.dump(vids, open("probe/videos.json", "w"))
print(out["channel"], len(vids))
