# Tagging rules

The daily GitHub job (`tools/fetch_catalog.py`) adds new videos to
`data/videos.json` with `"topics": []`. The daily Claude scheduled task fills
those in by following this file.

## How topics are structured

`topics.json` has **areas** (Health & Performance, Music Production, AI & Business, Poker,
Sales, Reality TV). Each video has an `area` (from its channel in
`channels.json`) and must only get topics from **its own area's list**.

A topic is either a plain name (`"Sleep"`) or a parent with sub-topics
(`{ "name": "Mixing", "sub": ["EQ", "Compression", ...] }`).

- To tag a sub-topic, write `"Parent/Sub"`, e.g. `"Mixing/EQ"`. That video
  automatically shows under Mixing too, so don't also add plain `"Mixing"`.
- Use plain `"Mixing"` only when the video is about mixing in general and no
  single sub-topic fits (e.g. "10 mixing mistakes").
- Topics without sub-topics are written plainly: `"Mastering"`, `"Sleep"`.
- If nothing in the area's list fits, use `"Other"`.

Reality TV (RHAP channels) is filtered and tagged automatically by
`tools/rules_reality.py` on every catalog run, so those videos never arrive
untagged. To change what's kept or how it's tagged, edit that file.

## Steps

1. Open `data/videos.json`. Find every video whose `topics` list is empty.
2. For each one, read its `title` and its description in
   `data/descriptions.json` (keyed by video id). Ignore sponsor reads, course
   ads and links; the episode summary is what matters.
3. Give it topics from its area, spelled exactly as in `topics.json`:
   - Health: 1–2 topics.
   - Music Production: 1–3 topics. Prefer the most specific sub-topic. A video
     covering EQ and compression gets `"Mixing/EQ"` and `"Mixing/Compression"`.
   - Other areas: 1–2 topics.
4. Never change a video that already has topics, and never change any other
   field or file.
5. Validate with `python3 -m json.tool data/videos.json > /dev/null`, commit
   as "Tag new videos YYYY-MM-DD", rebase on origin/main, and push.
   If nothing was untagged, don't commit.

## Rules of thumb

Health & Performance:
- Learning, memory, creativity, ADHD and attention → Focus & Productivity.
- Goals, purpose, resilience, mindset, dopamine-for-drive, procrastination →
  Motivation & Habits.
- Therapy, emotions, stress, anxiety, addiction, grief, psychedelics,
  meditation → Mental Health & Mood.
- Cold and heat exposure, metabolic health, anti-aging → Longevity & Aging.
- Fertility, testosterone, estrogen, menopause → Hormones.
- AMAs, live Q&As, relationships, general medicine (immune, skin, eyes, teeth,
  hearing, pain), brain science and culture → Other.

AI & Business (Nick Saraev):
- Building with AI/Claude Code: Claude Code, Claude skills/features, Codex-style coding agents.
- Building with AI/Vibe Coding & Apps: building apps/sites/SaaS by prompting (Lovable, Gemini, Antigravity).
- Building with AI/Agents & Workflows: AI agents, agentic workflows, MCP, RAG, voice agents.
- Building with AI/Using AI Well: prompting, learning with AI, second brain, "how to use AI".
- No-Code Automation/n8n, /Make.com, /Scraping & Data (scrapers, APIs, Apify); plain "No-Code Automation" for general automation.
- AI Business/Starting Out, /Getting Clients, /Pricing & Offers, /Delivery & Scaling (hiring, systems, productizing, onboarding), /Case Studies (income stories, interviews).
- Sales & Lead Gen: cold email, outreach, lead lists, sales scripts. Content & Growth: YouTube/social growth, content systems, ads.
- Models & News: new model drops, benchmarks, AI news. Future of Work: jobs, economy, staying valuable. Productivity & Mindset. Web Design.

Music Production:
- Mixing/EQ: EQ, filtering, frequency clashes, cleaning mud.
- Mixing/Compression: compressors, sidechain, glue, transients, punch.
- Mixing/Saturation & Distortion: saturation, distortion, warmth, clipping.
- Mixing/Reverb & Delay: reverb, delay, space, depth.
- Mixing/Stereo & Width: panning, stereo imaging, mono compatibility.
- Mixing/Levels & Gain Staging: gain staging, volume balance, headroom, metering.
- Mastering: mastering chains, limiting, loudness, LUFS, references.
- Producing/Arrangement: song structure, intros, drops, builds, energy flow.
- Producing/Drums & Groove: drum programming, kicks, hats, swing, groove.
- Producing/Melody & Chords: music theory, chords, melodies, basslines as notes.
- Producing/Sampling: sampling, chopping, flipping samples.
- Producing/Genre Guides: "how to make [genre]" walkthroughs and remakes.
- Producing/Workflow & Ableton: DAW tips, templates, speed, Ableton features.
- Producing/Finishing Tracks: finishing, writer's block, 8-bar loop syndrome.
- Sound Design/Synths: synth programming, Serum, Vital, presets.
- Sound Design/Bass: bass design, sub bass, reese, basslines as sounds.
- Sound Design/FX & Transitions: risers, impacts, sweeps, transitions.
- Mindset & Career: motivation, creativity, releasing music, labels, marketing,
  income, Q&As and podcasts about the music career.

## PS Pods (pods/)

Rob Has a Podcast feeds are tagged automatically by `tools/rules_reality.py`.
Feeds marked `"tagging": "claude"` in `pods/feeds.json` (currently Solved with
Mark Manson) arrive with `"topics": []` in `pods/data/episodes.json` and are
tagged by the daily Claude task:

1. Open `pods/data/episodes.json` (compact JSON) and find episodes with empty
   `topics`.
2. Read the `title` and `desc`. Give 1–2 topics from that episode's `area`
   in `pods/topics.json` (for `growth`: Purpose & Meaning, Happiness &
   Fulfillment, Confidence & Self-Worth, Emotions & Mental Health,
   Relationships, Habits, Discipline & Focus, Success & Money, Mindset &
   Philosophy, Society & Tech, Q&A).
3. Change nothing else. Write the file back compact
   (`json.dump(..., separators=(",", ":"), ensure_ascii=False)`), validate it
   loads, and commit with the PS Tube tags (same commit is fine).

Personal Growth rules of thumb: anxiety, fear, shame, ego, therapy, addiction,
resilience → Emotions & Mental Health; dating, love, friends, family,
boundaries, loneliness → Relationships; goals, habits, procrastination, focus,
productivity, self-discipline, health changes → Habits, Discipline & Focus;
luck, risk, careers, wealth → Success & Money; stoicism, values, paradoxes,
"harsh truths", critiques of self-help → Mindset & Philosophy; social media,
AI, politics, culture → Society & Tech; listener questions and live shows → Q&A.
