# YouTube Summaries

A personal library of YouTube videos from the channels in `channels.json`,
filterable by topic, length and channel. Installable on a phone home screen.

- `tools/fetch_catalog.py` + `.github/workflows/update.yml`: a daily GitHub job
  pulls every upload for each channel (Shorts skipped) using the
  `YOUTUBE_API_KEY` repo secret.
- `TAGGING.md`: rules the daily Claude scheduled task follows to give new
  videos one or two topics from `topics.json`.
- `index.html`, `app.js`, `styles.css`, `sw.js`: the app, served by GitHub Pages.

To add a channel, add `{ "handle": "theirhandle", "name": "Display Name" }`
to `channels.json` and push. The job runs right away and pulls its catalog.
