/* Daily reminder (Web Push) helpers for the browser: can this device get push at all, is it an iPhone/iPad that
   has to add blop to the Home Screen first, the VAPID key as bytes, and the request body for /api/push-subscribe.
   Pure functions, no DOM, tested in node (test/push-logic.test.js). push-ui.js does the rest. */
(function (root) {
/* env: { hasSW, hasPush, hasNotif, ua, platform, maxTouchPoints, standalone, displayStandalone }. */
function isIOS(env) {
  const ua = String(env.ua || "");
  return /iPhone|iPad|iPod/.test(ua) || (env.platform === "MacIntel" && (env.maxTouchPoints || 0) > 1);
}
function isStandalone(env) { return env.standalone === true || !!env.displayStandalone; }
/* "ios-install": an iPhone/iPad in Safari, where push only works from the Home Screen app (iOS 16.4+).
   "unsupported": no push in this browser. "ok": push can be offered. */
function support(env) {
  const e = env || {};
  if (isIOS(e) && !isStandalone(e)) return "ios-install";
  return e.hasSW && e.hasPush && e.hasNotif ? "ok" : "unsupported";
}

/* An uncompressed P-256 public key in base64url: 65 bytes, 87 characters. */
function validKey(k) { return typeof k === "string" && /^[A-Za-z0-9_-]{86,88}={0,2}$/.test(k); }
/* base64url -> Uint8Array, for pushManager.subscribe({ applicationServerKey }). */
function keyBytes(b64url) {
  const b64 = (b64url + "=".repeat((4 - b64url.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
/* Body for POST /api/push-subscribe: only the fields the server keeps. */
function subscribeBody(subJSON, time, tz) {
  const s = subJSON || {};
  return { subscription: { endpoint: s.endpoint, keys: { p256dh: s.keys && s.keys.p256dh, auth: s.keys && s.keys.auth } }, time, tz };
}
/* Does this device's saved subscription need re-posting (time or time zone changed since it was saved)? */
function needsRepost(saved, time, tz) { return !!(saved && saved.on) && (saved.time !== time || saved.tz !== tz); }

/* What to do with this device's subscription after sign-in (saved: the blop-push entry, which records the account
   it was saved for; subEndpoint: the browser's current subscription, or "" when it has none).
   "none": nothing to do. "clear": the browser dropped it, so show it as off. "drop": it was saved for another
   account (signed out without clearing, then someone else signed in), so unsubscribe it here and show it as off;
   the push service then reports it gone and the server deletes it. "save": post it again (time, zone or endpoint
   changed, or an older entry that doesn't record its account). */
function reconcileAction(saved, userId, subEndpoint, time, tz) {
  if (!saved || !saved.on) return "none";
  if (!subEndpoint) return "clear";
  if (saved.user && saved.user !== userId) return "drop";
  if (!saved.user || saved.endpoint !== subEndpoint || needsRepost(saved, time, tz)) return "save";
  return "none";
}
/* "Sign out and clear this device": which endpoint to delete on the server (while the token still works), and
   whether there is a browser subscription to unsubscribe. The browser's own subscription wins over the saved one. */
function cleanupPlan(saved, subEndpoint) {
  const endpoint = subEndpoint || (saved && typeof saved.endpoint === "string" ? saved.endpoint : "");
  return { deleteEndpoint: endpoint, unsubscribe: !!subEndpoint };
}

const PushLogic = { isIOS, isStandalone, support, validKey, keyBytes, subscribeBody, needsRepost, reconcileAction, cleanupPlan };
if (typeof module !== "undefined" && module.exports) module.exports = PushLogic; else root.PushLogic = PushLogic;
})(typeof window !== "undefined" ? window : globalThis);
