"""Fetch one YouTube video's captions and save them as plain text.

Usage: python3 tools/fetch_transcript.py VIDEO_ID
Writes transcripts/VIDEO_ID.txt. Prefers English (human-made over auto-generated),
otherwise takes whatever language the video has. Tries youtube-transcript-api first,
then yt-dlp. Exits non-zero if neither gets anything (blocked or no captions).
Run by .github/workflows/transcript.yml, which PS Tube's Copy transcript button starts.
"""
import glob
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EN = ["en", "en-US", "en-GB", "en-CA", "en-AU"]
TAG = re.compile(r"^\[[^\]]*\]$")  # lines that are only "[Music]", "[Applause]"...


def to_text(cues):
    """cues: list of (start_seconds, text). Paragraph break about every minute."""
    paras, cur, mark = [], [], None
    for start, text in cues:
        text = re.sub(r"\s+", " ", text or "").strip()
        if not text or TAG.match(text):
            continue
        if mark is None:
            mark = start
        if start - mark >= 60 and cur:
            paras.append(" ".join(cur))
            cur, mark = [], start
        cur.append(text)
    if cur:
        paras.append(" ".join(cur))
    return "\n\n".join(paras)


def via_api(vid):
    from youtube_transcript_api import YouTubeTranscriptApi

    tl = YouTubeTranscriptApi().list(vid)
    t = None
    for find in (tl.find_manually_created_transcript, tl.find_generated_transcript):
        try:
            t = find(EN)
            break
        except Exception:
            pass
    if t is None:
        t = next(iter(tl))
    return [(s.start, s.text) for s in t.fetch().snippets]


def via_ytdlp(vid):
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(
            ["yt-dlp", "--skip-download", "--write-subs", "--write-auto-subs",
             "--sub-langs", "en.*,en", "--sub-format", "json3",
             "-o", os.path.join(d, "s"), "https://www.youtube.com/watch?v=" + vid],
            check=False, timeout=180,
        )
        files = sorted(glob.glob(os.path.join(d, "*.json3")), key=len)
        if not files:
            return []
        ev = json.load(open(files[0], encoding="utf-8")).get("events", [])
        return [(e.get("tStartMs", 0) / 1000, "".join(s.get("utf8", "") for s in e.get("segs", [])))
                for e in ev if e.get("segs")]


def main():
    vid = sys.argv[1] if len(sys.argv) > 1 else ""
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", vid):
        sys.exit("Not a YouTube video id: %r" % vid)
    out = os.path.join(ROOT, "transcripts", vid + ".txt")
    if os.path.exists(out):
        print("Already saved")
        return
    text = ""
    for name, fn in (("youtube-transcript-api", via_api), ("yt-dlp", via_ytdlp)):
        try:
            text = to_text(fn(vid))
        except Exception as e:  # blocked, no captions, network...
            print(f"{name}: {type(e).__name__}: {str(e)[:300]}")
        if text:
            print(f"{name}: {len(text)} characters")
            break
    if not text:
        sys.exit("No transcript (YouTube blocked the request or the video has no captions).")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(text + "\n")


if __name__ == "__main__":
    main()
