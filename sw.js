// Offline support: serve cached files instantly, refresh them in the background.
const CACHE = "blop-v7";
const ASSETS = ["/", "/index.html", "/content.js", "/content-code.js", "/content-sd.js", "/content-ml-deep.js", "/content-extra.js", "/plan.js", "/srs.js", "/jobs.js", "/mock-prompts.js", "/mock.js", "/state.js", "/merge.js", "/sync-logic.js", "/logic.js",
  "/core.js", "/qtypes.js", "/today.js", "/jobs-ui.js", "/config.js", "/sync.js", "/sync-ui.js", "/mock-ui.js", "/app.js", "/manifest.webmanifest",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Only this site and Google Fonts are cached. Everything else (the Supabase library on jsDelivr, the
// Supabase API) isn't touched, so the browser fetches it normally and an unreachable CDN can't break the app.
const CACHED_ORIGINS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"];
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin && !CACHED_ORIGINS.includes(url.origin)) return;
  // Server functions (/api/grade) always go to the network and are never cached. (POSTs never reach here.)
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;
  // config.js goes to the network first so newly pasted sync settings apply on the next load.
  if (url.origin === self.location.origin && url.pathname === "/config.js") {
    e.respondWith(fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || new Response("", { status: 504 }))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then(res => {
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    if (req.mode === "navigate") return cache.match("/index.html");
    return new Response("", { status: 504 });
  }));
});
