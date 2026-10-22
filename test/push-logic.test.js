// Browser-side reminder helpers: when push can be offered, the iPhone Home Screen rule, the VAPID key bytes.
const test = require("node:test");
const assert = require("node:assert/strict");
const PL = require("../push-logic.js");

const CHROME = { hasSW: true, hasPush: true, hasNotif: true, ua: "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile", platform: "Linux armv8l", maxTouchPoints: 5 };
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

test("push is offered when service worker, PushManager and Notification all exist", () => {
  assert.equal(PL.support(CHROME), "ok");
  for (const k of ["hasSW", "hasPush", "hasNotif"]) assert.equal(PL.support({ ...CHROME, [k]: false }), "unsupported", k);
  assert.equal(PL.support({}), "unsupported");
  assert.equal(PL.support(undefined), "unsupported");
});

test("an iPhone or iPad in Safari must add blop to the Home Screen first", () => {
  const safari = { hasSW: true, hasPush: false, hasNotif: false, ua: IPHONE_UA, platform: "iPhone", maxTouchPoints: 5, standalone: false };
  assert.equal(PL.support(safari), "ios-install");
  // iPadOS reports a Mac platform but has touch.
  assert.equal(PL.support({ ...safari, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" }), "ios-install");
  // Home Screen app on iOS 16.4+: push exists.
  assert.equal(PL.support({ ...safari, standalone: true, hasPush: true, hasNotif: true }), "ok");
  assert.equal(PL.support({ ...safari, displayStandalone: true, hasPush: true, hasNotif: true }), "ok");
  // Home Screen app on an older iOS without push.
  assert.equal(PL.support({ ...safari, standalone: true }), "unsupported");
  // A real Mac (no touch) is not iOS.
  assert.equal(PL.isIOS({ ua: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 }), false);
});

test("the VAPID public key is validated and decoded to 65 bytes", () => {
  const key = require("fs").readFileSync(require("path").join(__dirname, "..", "config.js"), "utf8").match(/vapidPublicKey:\s*"([^"]+)"/)[1];
  assert.equal(PL.validKey(key), true);
  const bytes = PL.keyBytes(key);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 4); // uncompressed P-256 point
  assert.equal(PL.validKey(""), false);
  assert.equal(PL.validKey("not a key"), false);
});

test("the subscribe body keeps only endpoint, keys, time and zone", () => {
  const body = PL.subscribeBody({ endpoint: "https://fcm.googleapis.com/x", expirationTime: null, keys: { p256dh: "p", auth: "a", extra: 1 } }, "20:00", "Europe/London");
  assert.deepEqual(body, { subscription: { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "p", auth: "a" } }, time: "20:00", tz: "Europe/London" });
});

test("a saved subscription is re-posted when the time or zone changed", () => {
  const saved = { on: true, time: "20:00", tz: "Europe/London" };
  assert.equal(PL.needsRepost(saved, "20:00", "Europe/London"), false);
  assert.equal(PL.needsRepost(saved, "21:00", "Europe/London"), true);
  assert.equal(PL.needsRepost(saved, "20:00", "America/New_York"), true);
  assert.equal(PL.needsRepost({ on: false, time: "x" }, "20:00", "UTC"), false);
  assert.equal(PL.needsRepost(null, "20:00", "UTC"), false);
});
