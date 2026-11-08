// PS Pods app shell. Always checks GitHub for a newer copy; offline falls back to
// the last one. Audio comes straight from the podcast hosts and isn't cached here.
const CACHE = "pp-v2";
const SHELL = ["./", "index.html", "styles.css?v=2", "app.js?v=2", "topics.json", "feeds.json", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/logo-96.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pp-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return;
  // Leave audio and partial (seek) requests alone so scrubbing works.
  if (e.request.headers.has("range") || e.request.destination === "audio" || /\.(mp3|m4a|aac|wav)$/i.test(url.pathname)) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
