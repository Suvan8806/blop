// Offline support: serve cached files instantly, refresh them in the background.
const CACHE = "blop-v11";
const ASSETS = ["/", "/index.html", "/content.js", "/content-code.js", "/content-sd.js", "/content-ml-deep.js", "/content-extra.js", "/plan.js", "/srs.js", "/jobs.js", "/mock-prompts.js", "/mock.js", "/state.js", "/merge.js", "/sync-logic.js", "/push-logic.js", "/logic.js",
  "/core.js", "/qtypes.js", "/today.js", "/jobs-ui.js", "/config.js", "/sync.js", "/sync-ui.js", "/push-ui.js", "/mock-ui.js", "/app.js", "/manifest.webmanifest",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png"];
const ASSET_PATHS = new Set(ASSETS);
// Sign-in redirects carry one-time secrets in the URL; such a URL is never stored in the cache.
const AUTH_PARAMS = ["code", "error", "error_description", "access_token", "refresh_token"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function hasAuthParams(url) {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  return AUTH_PARAMS.some(k => url.searchParams.has(k) || hash.has(k));
}
// Stale-while-revalidate for one cache key: answer from the cache, refresh it from the network.
function fromCache(e, key, fetchReq) {
  return caches.open(CACHE).then(async cache => {
    const cached = await cache.match(key);
    const network = fetch(fetchReq).then(res => {
      if (res && res.ok && res.type === "basic") cache.put(key, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    const res = await network;
    return res || new Response("", { status: 504 });
  });
}

// Cached: the files in ASSETS (same-origin GETs) and Google Fonts. Opening the app ("/" or "/index.html", with any
// query or hash, including a sign-in redirect's ?code=) is answered with /index.html, and only that clean key is
// stored. Other same-origin URLs with sign-in parameters are never handled or cached.
// Everything else (the Supabase library on jsDelivr, the Supabase API, /api/*, any other path) isn't touched,
// so the browser fetches it normally and an unreachable CDN can't break the app.
const CACHED_ORIGINS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"];
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && url.pathname.startsWith("/api/")) return; // server functions: always the network, never cached
  if (req.mode === "navigate" && same && (url.pathname === "/" || url.pathname === "/index.html")) {
    e.respondWith(fromCache(e, "/index.html", "/index.html"));
    return;
  }
  if (same && hasAuthParams(url)) return;
  if (same && url.pathname === "/config.js") {
    // Network first, so newly pasted sync settings apply on the next load.
    e.respondWith(fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put("/config.js", copy)); }
      return res;
    }).catch(() => caches.match("/config.js").then(r => r || new Response("", { status: 504 }))));
    return;
  }
  if (same && ASSET_PATHS.has(url.pathname)) {
    e.respondWith(fromCache(e, url.pathname, url.pathname));
    return;
  }
  if (CACHED_ORIGINS.includes(url.origin)) {
    e.respondWith(caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { e.waitUntil(network); return cached; }
      return (await network) || new Response("", { status: 504 });
    }));
  }
});

/* Daily streak reminder (sent by /api/cron-remind). The title and icon are fixed here; only the text comes
   from the payload, and a tap always opens the app's Today tab (never a URL from the payload). */
const REMIND_URL = "/?tab=today";
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  const body = d && typeof d.body === "string" && d.body ? d.body.slice(0, 200) : "Time for today’s blop lessons.";
  e.waitUntil(self.registration.showNotification("blop", {
    body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: "blop-streak", data: { url: REMIND_URL }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(c => new URL(c.url).origin === self.location.origin);
    if (open) { open.postMessage({ type: "blop-open", tab: "today" }); return open.focus(); }
    return self.clients.openWindow(REMIND_URL);
  }));
});
