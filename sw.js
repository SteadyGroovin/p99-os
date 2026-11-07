// Rocket OS (was Pizza 99 OS) — service worker. Network first (so a new release shows on the next open), cache as the offline fallback.
// v0.11.6: every network fetch revalidates with the server (no-cache = a cheap 304), so GitHub Pages' 10-minute HTTP cache can never mix two releases.
const CACHE = "p99os-v0.13.1";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./icons.js", "./db.js", "./data.js", "./sync.js", "./sales-view.js", "./today-v2.js", "./stock-v2.js", "./clean-v2.js", "./tasks-v2.js", "./finance-v2.js", "./walk-v2.js", "./transfer-v2.js", "./order-v2.js", "./today-v2.css", "./stock-v2.css", "./clean-v2.css", "./tasks-v2.css", "./finance-v2.css", "./walk-v2.css", "./icons.js", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith((e.request.mode === "navigate" ? fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }) : fetch(e.request, { cache: "no-cache" })).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});

// v0.12: order alerts. sync/reorder-alert sends { title, body, url }; tapping opens that screen (default: Order today).
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Rocket OS", { body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: d.tag || "order", data: { url: d.url || "./#/order" } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || "./#/order";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => { const c = cs.find(x => x.url.startsWith(self.registration.scope)); if (c) { c.navigate(url); return c.focus(); } return self.clients.openWindow(url); }));
});
