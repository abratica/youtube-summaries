// App shell is cached; the library data is fetched fresh when online and
// falls back to the last copy when offline.
const CACHE = "pt-v12";
const SHELL = ["./", "index.html", "styles.css?v=13", "app.js?v=13", "topics.json", "channels.json", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/logo-light.png", "icons/logo-dark.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // Always check GitHub for a newer copy (no stale browser cache); offline falls back to the last one.
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
