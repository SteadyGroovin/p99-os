// Pizza 99 OS — service worker. Network first (so a new release shows on the next open), cache as the offline fallback.
const CACHE = "p99os-v0.7";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./icons.js", "./db.js", "./data.js", "./sales-view.js", "./today-v2.js", "./stock-v2.js", "./clean-v2.js", "./finance-v2.js", "./today-v2.css", "./stock-v2.css", "./clean-v2.css", "./finance-v2.css", "./icons.js", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
