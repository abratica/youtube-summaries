import json, urllib.request, urllib.parse, xml.etree.ElementTree as ET, re, html
UA={"User-Agent":"Mozilla/5.0 (PS Pods feed reader)"}
def get(u,t=90):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t) as r: return r.read()
out={"search":[]}
for term in ["Solved with Mark Manson","Mark Manson podcast","Solved Mark Manson"]:
    r=json.loads(get("https://itunes.apple.com/search?"+urllib.parse.urlencode({"term":term,"entity":"podcast","limit":20})))
    for x in r["results"]:
        out["search"].append([x["collectionId"],x["collectionName"],x.get("artistName"),x.get("feedUrl"),x.get("trackCount"),x.get("artworkUrl600")])
best=[s for s in out["search"] if "manson" in (s[1]+" "+(s[2] or "")).lower()]
out["best"]=best
eps=[]
if best:
    root=ET.fromstring(get(best[0][3],120))
    NS={"itunes":"http://www.itunes.com/dtds/podcast-1.0.dtd"}
    for it in root.findall("./channel/item"):
        d=re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]+>"," ",it.findtext("description") or "")))[:400]
        eps.append({"t":it.findtext("title"),"p":it.findtext("pubDate"),"dur":it.findtext("itunes:duration",namespaces=NS),"d":d})
out["episodes"]=eps
json.dump(out,open("probe/manson.json","w"))
print(best, len(eps))
