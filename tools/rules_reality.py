"""Filter + auto-tag rules for Rob Has a Podcast (RHAP) channels.

Only keeps videos about The Traitors, Survivor, Big Brother and Netflix shows,
and tags them with Reality TV topics ("Show/Version"). Used by fetch_catalog.py
for channels with "rules": "reality" in channels.json. Returns [] to skip a video.
"""

import re

I = re.I

# Other shows RHAP covers. A video is only kept on description evidence when its
# title isn't about one of these.
OTHER_SHOWS = re.compile(
    r"amazing race|the challenge|love island|drag race|below deck|top chef|wrestl|jet lag|taskmaster|"
    r"dancing with|tough as nails|deal or no deal|hit or quit|bachelor|housewives|temptation island|"
    r"race to survive|special forces|genius game|pod friends|paradise|reality mafia|watch what crappens|"
    r"\bMAFS\b|married at first sight|perfect match (?:podcast|rhapup)|news af", I)

# Married at First Sight's podcast is called "A Perfect Match" - not Netflix's Perfect Match.
NOT_NETFLIX_PM = re.compile(r"perfect match (?:podcast|rhapup)|\bMAFS\b|married at first sight", I)

SHOWS = [
    ("The Traitors",
     re.compile(r"traitor", I),
     re.compile(r"weknowthetraitors|\bthe traitors\b", I),
     [("Canada", r"canad"), ("UK", r"\bUK\b|british"), ("Other", r"austral|\bAU\b|zealand|\bNZ\b|ireland|france")],
     "US"),
    ("Survivor",
     re.compile(r"survivor|pride has spoken|talking with t-?bird|ask dr\.? christian hubicki|ka[oô]h|probst|know-?it-?alls", I),
     re.compile(r"weknowsurvivor|survivor \d+|survivor (?:legend|alum|fan|strategy|winner|player)", I),
     [("Australian", r"austral|\bAU\b"), ("International", r"south africa|zealand|\bNZ\b|qu[eé]bec|philippines|israel|turkey|\bUK\b")],
     "US"),
    ("Big Brother",
     re.compile(r"big brother|\bBB ?(?:US|OTT|CAN|UK|\d)|\bCBB|BB reindeer|summer of stein", I),
     re.compile(r"weknowbigbrother|big brother \d+|big brother canada", I),
     [("Canada", r"canad|BBCAN"), ("Celebrity", r"celebrity|\bCBB"), ("Live Feeds", r"feed"), ("Other", r"\bOTT\b|over the top|\bUK\b|reindeer")],
     "US"),
    ("Netflix",
     re.compile(r"netflix|\bNBN\b|love is blind|perfect match|the circle|celebrity circle|ultimatum|too hot to handle|"
                r"squid game|the mole|million dollar secret|\boutlast(?::| season| s\d| recap| premiere)|battle camp|the trust\b|building the band|"
                r"sneaky links|age of attraction|golden ticket", I),
     None,
     [("Love Is Blind", r"love is blind"), ("Perfect Match", r"perfect match"), ("The Circle", r"circle"),
      ("Squid Game: The Challenge", r"squid game"), ("Too Hot to Handle", r"too hot to handle"), ("The Mole", r"the mole"), ("Nothing But Netflix", r"nothing but netflix|\bNBN\b")],
     "Other Netflix"),
]


def classify(title, desc=""):
    """Title first; the description is only consulted when the title names none of the shows."""
    def tag(name, subs, default):
        sub = next((s for s, rx in subs if re.search(rx, title, I)), default)
        return f"{name}/{sub}"

    topics = []
    for name, title_rx, desc_rx, subs, default in SHOWS:
        if name == "Netflix" and NOT_NETFLIX_PM.search(title):
            continue
        if title_rx.search(title):
            topics.append(tag(name, subs, default))
    if topics or OTHER_SHOWS.search(title):
        return topics
    head = (desc or "")[:220]
    for name, title_rx, desc_rx, subs, default in SHOWS:
        if desc_rx and desc_rx.search(head):
            return [tag(name, subs, default)]  # one show from description evidence
    return []


def tag_for(show, title, default_sub=None):
    """Tag a video/episode as `show` (used when a whole feed is about one show)."""
    for name, _t, _d, subs, default in SHOWS:
        if name == show:
            sub = next((s for s, rx in subs if re.search(rx, title, I)), default_sub or default)
            return f"{name}/{sub}"
    return None
