import json, sys, collections
sys.path.insert(0, "tools")
import fetch_catalog as f
out = {}
for cid in ["UCZfyDCVWuENLM6U78qraE4A", "UC5Xie0uXhhSryn1kLoe_9sw", "UCUGzQNf0wetqg1_UmT1TRpw"]:
    cid, name, pl = f.resolve({"id": cid})
    vids = [{"id": i["id"], "t": i["snippet"]["title"], "s": f.iso_seconds(i["contentDetails"].get("duration")), "p": i["snippet"]["publishedAt"][:10], "d": i["snippet"].get("description", "")[:300]} for i in f.details(f.uploads(pl))]
    out[cid] = {"name": name, "count": len(vids), "years": dict(collections.Counter(v["p"][:4] for v in vids)), "videos": vids}
json.dump(out, open("probe/others.json", "w"))
print({k: (v["name"], v["count"]) for k, v in out.items()})
