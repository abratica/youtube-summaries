# PS Tube

A personal library of YouTube videos from the channels in `channels.json`,
filterable by topic, length and channel. Installable on a phone home screen.

Live at https://abratica.github.io/youtube-summaries/ — open it in Chrome on Android and tap Install, or follow the Add to Home Screen guide on iPhone.

- `tools/fetch_catalog.py` + `.github/workflows/update.yml`: a daily GitHub job
  pulls every upload for each channel (Shorts skipped) using the
  `YOUTUBE_API_KEY` repo secret.
- Update button (top right, both apps; `updater.js`): starts the update job on
  GitHub (PS Tube runs a quick check of each channel's newest uploads, PS Pods
  re-reads its feeds), waits for it, and reloads the list. The first tap asks for
  a GitHub fine-grained token with Actions: Read and write on this repo only,
  saved in that browser.
- `data/live.json`: streams that are live now or scheduled in the next week,
  shown in PS Tube's "Live now & upcoming" row on every tab; tapping one plays
  it in the in-app player (live mode: no seek bar, "Go live" button).
- `TAGGING.md`: rules the daily Claude scheduled task follows to give new
  videos one or two topics from `topics.json`.
- `index.html`, `app.js`, `styles.css`, `sw.js`: the app, served by GitHub Pages.

To add a channel, add `{ "handle": "theirhandle", "name": "Display Name", "area": "music" }`
(or `"id": "UC..."` instead of a handle) to `channels.json` and push. The job runs
right away and pulls its catalog. Areas and their topics live in `topics.json`:
health, music, poker, sales, reality-tv.
