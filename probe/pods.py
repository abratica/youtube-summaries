import json, urllib.request, urllib.parse, xml.etree.ElementTree as ET, re
UA={"User-Agent":"Mozilla/5.0 (PS Pods feed reader)"}
def get(u, t=60):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t) as r: return r.read()
found={}
for term in ["Rob Has a Podcast","RHAP","Rob Cesternino","We Know Survivor","We Know Big Brother","RHAP Traitors","Nothing But Netflix","RHAP Reality","We Know Reality TV","RHAP Survivor"]:
    for kind in ["podcast"]:
        try:
            r=json.loads(get("https://itunes.apple.com/search?"+urllib.parse.urlencode({"term":term,"entity":kind,"limit":50})))
        except Exception as e:
            print("search fail", term, e); continue
        for x in r.get("results",[]):
            a=(x.get("artistName","")+" "+x.get("collectionName","")).lower()
            if "cesternino" in a or "rhap" in a or "rob has" in a:
                found[x["collectionId"]]={"name":x["collectionName"],"artist":x.get("artistName"),"feed":x.get("feedUrl"),"count":x.get("trackCount"),"art":x.get("artworkUrl600")}
out={"shows":found,"feeds":{}}
NS={"itunes":"http://www.itunes.com/dtds/podcast-1.0.dtd"}
for cid,s in found.items():
    if not s.get("feed"): continue
    try:
        raw=get(s["feed"],120); root=ET.fromstring(raw)
        items=root.findall("./channel/item")
        ep=[]
        for it in items:
            enc=it.find("enclosure")
            ep.append({"t":(it.findtext("title") or "")[:140],"p":it.findtext("pubDate"),"dur":it.findtext("itunes:duration",namespaces=NS),
                       "a":enc.get("url")[:60] if enc is not None else None,"g":(it.findtext("guid") or "")[:60],
                       "d":re.sub(r"<[^>]+>"," ",(it.findtext("description") or ""))[:300]})
        out["feeds"][str(cid)]={"name":s["name"],"bytes":len(raw),"items":len(ep),"newest":ep[0]["p"] if ep else None,"oldest":ep[-1]["p"] if ep else None,"episodes":ep}
        print(s["name"], len(ep), len(raw))
    except Exception as e:
        out["feeds"][str(cid)]={"name":s["name"],"error":str(e)}; print("feed fail", s["name"], e)
json.dump(out,open("probe/pods.json","w"))
