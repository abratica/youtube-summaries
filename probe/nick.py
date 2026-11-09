import json, sys
sys.path.insert(0, "tools")
import fetch_catalog as f
r = f.get("channels", part="snippet,contentDetails,statistics", forHandle="@nicksaraev")
out = {"channels": [(i["id"], i["snippet"]["title"], i["statistics"].get("videoCount")) for i in r.get("items", [])]}
if not r.get("items"):
    s = f.get("search", part="snippet", q="Nick Saraev", type="channel", maxResults=5)
    out["search"] = [(i["snippet"]["channelId"], i["snippet"]["title"]) for i in s["items"]]
    cid = s["items"][0]["snippet"]["channelId"]
else:
    cid = r["items"][0]["id"]
cid, name, pl = f.resolve({"id": cid})
vids = [{"id": i["id"], "t": i["snippet"]["title"], "s": f.iso_seconds(i["contentDetails"].get("duration")),
         "p": i["snippet"]["publishedAt"][:10], "live": i["snippet"].get("liveBroadcastContent"),
         "v": int(i.get("statistics", {}).get("viewCount", 0) or 0), "d": i["snippet"].get("description", "")[:250]}
        for i in f.details(f.uploads(pl))]
out.update({"channel": [cid, name], "videos": vids})
json.dump(out, open("probe/nick.json", "w"))
print(cid, name, len(vids))
