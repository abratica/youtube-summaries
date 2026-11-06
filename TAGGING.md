# Tagging rules

The daily GitHub job (`tools/fetch_catalog.py`) adds new videos to
`data/videos.json` with `"topics": []`. The daily Claude scheduled task fills
those in by following this file.

1. Open `data/videos.json`. Find every video whose `topics` list is empty.
2. For each one, read its `title` and its description in
   `data/descriptions.json` (keyed by video id). Skip sponsor reads and links
   in the description; the guest and episode summary are what matter.
3. Give it one or two topics, copied exactly from `topics.json`. Use two
   only when the video is clearly about both. If none fit, use `"Other"`.
4. Never change a video that already has topics, and never change any other
   field or file.
5. Validate with `python3 -m json.tool data/videos.json > /dev/null`, commit
   as "Tag new videos YYYY-MM-DD", rebase on origin/main, and push.
   If nothing was untagged, don't commit.

Rules of thumb used for the back catalog:
- Learning, memory, creativity, ADHD and attention go under Focus & Productivity.
- Goals, purpose, resilience, mindset, dopamine-for-drive and procrastination
  go under Motivation & Habits.
- Therapy, emotions, stress, anxiety, addiction, grief, psychedelics and
  meditation go under Mental Health & Mood.
- Cold and heat exposure, metabolic health and anti-aging go under
  Longevity & Aging.
- Fertility, testosterone, estrogen, menopause and sexual development go under
  Hormones.
- AMAs, live Q&As, relationships, general medicine (immune, skin, eyes, teeth,
  hearing, pain) and brain-science or culture episodes go under Other.
