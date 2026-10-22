// The service worker's push and notificationclick handlers, run against a fake service worker global.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadSw({ windows = [] } = {}) {
  const handlers = {}, shown = [], opened = [];
  const self = {
    location: { origin: "https://blop.example" },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    registration: { showNotification: async (title, opts) => { shown.push({ title, opts }); } },
    clients: { matchAll: async () => windows, openWindow: async url => { opened.push(url); }, claim: async () => {} },
    skipWaiting: () => {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8"), { self, caches: {}, fetch: () => {}, URL, URLSearchParams, Response: function () {}, Set });
  async function fire(type, ev) { let p; handlers[type]({ ...ev, waitUntil: x => { p = x; } }); await p; }
  return { fire, shown, opened };
}
const pushEvent = data => ({ data: data === null ? null : { json: () => JSON.parse(data) } });

test("CACHE is bumped and the reminder scripts are cached", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
  assert.match(src, /const CACHE = "blop-v9"/);
  assert.ok(src.includes('"/push-logic.js"') && src.includes('"/push-ui.js"'));
});

test("a push shows a 'blop' notification with the payload's text and the app icon", async () => {
  const sw = loadSw();
  await sw.fire("push", pushEvent(JSON.stringify({ title: "ignored", body: "Keep your 3-day streak: 2 lessons left today", url: "https://evil.example" })));
  assert.equal(sw.shown[0].title, "blop");
  assert.equal(sw.shown[0].opts.body, "Keep your 3-day streak: 2 lessons left today");
  assert.equal(sw.shown[0].opts.icon, "/icons/icon-192.png");
  assert.equal(sw.shown[0].opts.data.url, "/?tab=today"); // never a URL from the payload
});

test("an empty or broken payload still shows a generic reminder", async () => {
  for (const ev of [pushEvent(null), { data: { json: () => { throw new Error("bad"); } } }]) {
    const sw = loadSw();
    await sw.fire("push", ev);
    assert.equal(sw.shown[0].opts.body, "Time for today’s blop lessons.");
  }
});

test("a tap focuses an open blop window on Today, or opens /?tab=today", async () => {
  const messages = [];
  const win = { url: "https://blop.example/", focus: async () => { win.focused = true; }, postMessage: m => messages.push(m) };
  const sw = loadSw({ windows: [{ url: "https://other.example/", focus: () => {}, postMessage: () => {} }, win] });
  const note = { close: () => { note.closed = true; } };
  await sw.fire("notificationclick", { notification: note });
  assert.equal(note.closed, true);
  assert.equal(win.focused, true);
  assert.equal(JSON.stringify(messages), JSON.stringify([{ type: "blop-open", tab: "today" }]));
  const none = loadSw();
  await none.fire("notificationclick", { notification: { close() {} } });
  assert.deepEqual(none.opened, ["/?tab=today"]);
});
