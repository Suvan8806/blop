// /api/push-subscribe and /api/cron-remind with a mock req/res, a fake Supabase (stubbed fetch) and a stubbed
// web-push: no real network calls.
const test = require("node:test");
const assert = require("node:assert/strict");
const Sub = require("../api/_lib/push-subscribe-handler.js");
const Cron = require("../api/_lib/cron-remind-handler.js");
const { loadUnits } = require("../api/_lib/curriculum.js");

const UID = "11111111-2222-4333-8444-555555555555";
const UID2 = "99999999-2222-4333-8444-555555555555";
const ENV = { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_svc",
  CRON_SECRET: "c".repeat(64), VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:a@b.c" };
const KEYS = { p256dh: "B" + "A".repeat(86), auth: "abcdefghijklmnopqrstuv" };
const EP = n => `https://fcm.googleapis.com/fcm/send/dev${n}`;
const subOf = n => ({ endpoint: EP(n), expirationTime: null, keys: KEYS });
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/* An in-memory push_subs / progress store behind PostgREST-shaped URLs. */
function fakeDb({ subs = [], progress = {}, user = 200, dbDown = false } = {}) {
  const db = { subs: subs.map(s => ({ ...s })), progress, calls: [] };
  const eq = (u, col) => { const m = new RegExp(`[?&]${col}=eq\\.([^&]*)`).exec(u); return m ? decodeURIComponent(m[1]) : null; };
  db.fetch = async (url, init = {}) => {
    const method = init.method || "GET";
    db.calls.push({ url, method, init });
    if (url.endsWith("/auth/v1/user")) return user === 200 ? json(200, { id: UID }) : json(user, {});
    if (dbDown) return json(500, {});
    const path = url.split("/rest/v1/")[1] || "";
    if (path.startsWith("push_subs")) {
      const ep = eq(url, "endpoint"), uid = eq(url, "user_id");
      if (method === "GET") {
        const rows = db.subs.filter(s => !uid || s.user_id === uid).sort((a, b) => a.created_at - b.created_at);
        return json(200, rows.map(s => ({ ...s })));
      }
      if (method === "POST") {
        const row = JSON.parse(init.body);
        const old = db.subs.find(s => s.endpoint === row.endpoint);
        if (old) Object.assign(old, row); else db.subs.push({ created_at: Date.now(), last_sent_day: null, ...row });
        return json(201, null);
      }
      if (method === "DELETE") { db.subs = db.subs.filter(s => !(s.endpoint === ep && (!uid || s.user_id === uid))); return json(204, null); }
      if (method === "PATCH") {
        const body = JSON.parse(init.body), s = db.subs.find(x => x.endpoint === ep);
        const m = /last_sent_day\.neq\.([\d-]+)/.exec(url);
        if (!s || (m && s.last_sent_day === m[1])) return json(200, []);
        Object.assign(s, body);
        return json(200, [{ ...s }]);
      }
    }
    if (path.startsWith("progress")) {
      const ids = /user_id=in\.\(([^)]*)\)/.exec(url)[1].split(",");
      return json(200, ids.filter(id => db.progress[id]).map(id => ({ user_id: id, data: db.progress[id] })));
    }
    return json(404, {});
  };
  return db;
}
function mockRes() {
  return { statusCode: 0, headers: {}, body: "", setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b || ""; } };
}
async function run(handler, req) {
  const res = mockRes();
  await handler(req, res);
  return { res, data: res.body ? JSON.parse(res.body) : null };
}

/* ---------- /api/push-subscribe ---------- */
function subCall({ db = fakeDb(), env = ENV, method = "POST", headers = {}, body = { subscription: subOf(1), time: "20:00", tz: "Europe/London" } } = {}) {
  const logs = [];
  const h = Sub.createHandler({ fetch: db.fetch, env, log: (...a) => logs.push(a.join(" ")) });
  const req = { method, body, headers: { host: "blop.example", origin: "https://blop.example", "content-type": "application/json",
    authorization: "Bearer user-token", ...headers } };
  return run(h, req).then(r => ({ ...r, db, logs }));
}

test("subscribe: a signed-in POST saves the subscription, time and zone", async () => {
  const { res, data, db } = await subCall();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(data, { ok: true, time: "20:00", tz: "Europe/London", dropped: 0 });
  assert.equal(db.subs.length, 1);
  assert.deepEqual(db.subs[0].sub, { endpoint: EP(1), keys: KEYS });
  assert.equal(db.subs[0].user_id, UID);
  const auth = db.calls.find(c => c.url.endsWith("/auth/v1/user"));
  assert.deepEqual(auth.init.headers, { apikey: "anon-key", Authorization: "Bearer user-token" });
  const up = db.calls.find(c => c.method === "POST");
  assert.equal(up.init.headers.apikey, "sb_secret_svc");
  assert.match(up.init.headers.Prefer, /merge-duplicates/);
  assert.ok(!("last_sent_day" in JSON.parse(up.init.body))); // changing the time keeps today's sent mark
  assert.equal(res.headers["cache-control"], "no-store");
});

test("subscribe: changing the time updates the same row", async () => {
  const db = fakeDb();
  await subCall({ db });
  const { data } = await subCall({ db, body: { subscription: subOf(1), time: "07:30", tz: "Asia/Tokyo" } });
  assert.equal(data.ok, true);
  assert.equal(db.subs.length, 1);
  assert.deepEqual([db.subs[0].remind_time, db.subs[0].tz], ["07:30", "Asia/Tokyo"]);
});

test("subscribe: DELETE removes only this user's row for that endpoint", async () => {
  const db = fakeDb({ subs: [{ endpoint: EP(1), user_id: UID, created_at: 1 }, { endpoint: EP(2), user_id: UID, created_at: 2 }] });
  const { res } = await subCall({ db, method: "DELETE", body: { endpoint: EP(1) } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(db.subs.map(s => s.endpoint), [EP(2)]);
  const del = db.calls.find(c => c.method === "DELETE");
  assert.ok(del.url.includes(`user_id=eq.${UID}`));
});

test("subscribe: auth failures are 401 and never touch the database", async () => {
  const none = await subCall({ headers: { authorization: "" } });
  assert.equal(none.res.statusCode, 401);
  assert.equal(none.db.calls.length, 0);
  const bad = await subCall({ db: fakeDb({ user: 401 }) });
  assert.equal(bad.res.statusCode, 401);
  assert.ok(!bad.db.calls.some(c => c.url.includes("/rest/v1/")));
  const down = await subCall({ db: fakeDb({ user: 500 }) });
  assert.equal(down.res.statusCode, 503);
});

test("subscribe: wrong method 405, cross-site 403, non-JSON 415, missing config 503", async () => {
  for (const m of ["GET", "PUT"]) { const r = await subCall({ method: m }); assert.equal(r.res.statusCode, 405); assert.equal(r.db.calls.length, 0); }
  assert.equal((await subCall({ method: "OPTIONS" })).res.statusCode, 204);
  assert.equal((await subCall({ headers: { origin: "https://evil.example" } })).res.statusCode, 403);
  assert.equal((await subCall({ headers: { "sec-fetch-site": "cross-site" } })).res.statusCode, 403);
  assert.equal((await subCall({ headers: { "content-type": "text/plain" } })).res.statusCode, 415);
  assert.equal((await subCall({ env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: "" } })).res.statusCode, 503);
});

test("subscribe: bad input is 400 before any write", async () => {
  const bodies = [
    { subscription: { ...subOf(1), endpoint: "https://evil.example/push" }, time: "20:00", tz: "UTC" },
    { subscription: { ...subOf(1), endpoint: "http://fcm.googleapis.com/x" }, time: "20:00", tz: "UTC" },
    { subscription: subOf(1), time: "25:00", tz: "UTC" },
    { subscription: subOf(1), time: "20:00", tz: "Not/AZone" },
    { time: "20:00", tz: "UTC" },
    "not json"
  ];
  for (const body of bodies) {
    const { res, db } = await subCall({ body });
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.ok(!db.calls.some(c => c.method !== "GET" && c.url.includes("/rest/v1/")));
  }
});

test("subscribe: at the cap of 10, adding a new device drops the oldest; re-saving a known one drops nothing", async () => {
  const subs = Array.from({ length: 10 }, (_, i) => ({ endpoint: EP(i + 10), user_id: UID, created_at: i, sub: subOf(i + 10) }));
  subs.push({ endpoint: EP(99), user_id: UID2, created_at: 0 }); // someone else's row is never counted or touched
  const db = fakeDb({ subs });
  const { data } = await subCall({ db, body: { subscription: subOf(1), time: "20:00", tz: "UTC" } });
  assert.equal(data.dropped, 1);
  const mine = db.subs.filter(s => s.user_id === UID).map(s => s.endpoint);
  assert.equal(mine.length, 10);
  assert.ok(!mine.includes(EP(10)));   // the oldest went
  assert.ok(mine.includes(EP(1)));
  assert.ok(db.subs.some(s => s.endpoint === EP(99)));
  const again = await subCall({ db, body: { subscription: subOf(1), time: "21:00", tz: "UTC" } });
  assert.equal(again.data.dropped, 0);
  assert.equal(db.subs.filter(s => s.user_id === UID).length, 10);
});

test("subscribe: a database error is a friendly 503 and the log has no endpoint or token", async () => {
  const { res, logs } = await subCall({ db: fakeDb({ dbDown: true }) });
  assert.equal(res.statusCode, 503);
  assert.ok(logs.length);
  assert.ok(logs.every(l => !l.includes("fcm.googleapis.com") && !l.includes("user-token") && !l.includes("sb_secret")));
});

/* ---------- /api/cron-remind ---------- */
const NOW = Date.parse("2026-10-22T19:05:00Z"); // 20:05 in London
const DAY = Date.UTC(2026, 9, 22) / 864e5;
const UNITS = loadUnits();
function stubPush(outcomes = {}) {
  const sent = [];
  return { sent, sendNotification: async (sub, payload, opts) => {
    const o = outcomes[sub.endpoint];
    if (o) throw Object.assign(new Error("push failed"), { statusCode: o });
    sent.push({ sub, payload: JSON.parse(payload), opts });
    return { statusCode: 201 };
  } };
}
function row(n, extra) { return { endpoint: EP(n), user_id: UID, sub: { endpoint: EP(n), keys: KEYS }, remind_time: "20:00", tz: "Europe/London", last_sent_day: null, created_at: n, ...extra }; }
async function cronCall({ db, push = stubPush(), env = ENV, auth = `Bearer ${ENV.CRON_SECRET}`, method = "GET", now = NOW } = {}) {
  const logs = [];
  const h = Cron.createHandler({ fetch: db.fetch, env, webPush: push, now: () => now, loadUnits: () => UNITS, log: (...a) => logs.push(a.join(" ")) });
  const r = await run(h, { method, headers: { authorization: auth } });
  return { ...r, push, logs };
}

test("cron: a missing or wrong secret is 401 and nothing runs", async () => {
  for (const auth of [null, "", "Bearer wrong", `Bearer ${ENV.CRON_SECRET}x`, ENV.CRON_SECRET, `Basic ${ENV.CRON_SECRET}`]) {
    const db = fakeDb({ subs: [row(1)] });
    const { res, push } = await cronCall({ db, auth });
    assert.equal(res.statusCode, 401, String(auth));
    assert.equal(db.calls.length, 0);
    assert.equal(push.sent.length, 0);
  }
  const unset = await cronCall({ db: fakeDb(), env: { ...ENV, CRON_SECRET: "" } });
  assert.equal(unset.res.statusCode, 503);
  assert.equal(Cron.secretOk(`Bearer ${"c".repeat(64)}`, "c".repeat(64)), true);
});

test("cron: sends to due subscriptions whose goal isn't done, with the streak message, and marks the day", async () => {
  const db = fakeDb({ subs: [row(1)], progress: { [UID]: { goal: 3, day: DAY, dayLessons: 1, streak: 9, last: DAY - 1 } } });
  const { res, data, push } = await cronCall({ db });
  assert.equal(res.statusCode, 200);
  assert.deepEqual([data.due, data.sent], [1, 1]);
  assert.equal(push.sent[0].payload.body, "Keep your 9-day streak: 2 lessons left today");
  assert.equal(push.sent[0].payload.url, "/?tab=today");
  assert.deepEqual(push.sent[0].opts.vapidDetails, { subject: "mailto:a@b.c", publicKey: "pub", privateKey: "priv" });
  assert.equal(db.subs[0].last_sent_day, "2026-10-22");
  // A second run in the same hour sends nothing.
  const again = await cronCall({ db });
  assert.deepEqual([again.data.due, again.data.sent], [0, 0]);
});

test("cron: not due yet, already sent today, or goal done -> no push", async () => {
  const db = fakeDb({
    subs: [row(1, { remind_time: "21:00" }), row(2, { last_sent_day: "2026-10-22" }), row(3, { user_id: UID2 })],
    progress: { [UID2]: { goal: 2, day: DAY, dayLessons: 2, streak: 4, last: DAY } }
  });
  const { data, push } = await cronCall({ db });
  assert.equal(push.sent.length, 0);
  assert.deepEqual([data.total, data.due, data.done, data.sent], [3, 1, 1, 0]);
  assert.equal(db.subs.find(s => s.endpoint === EP(3)).last_sent_day, "2026-10-22"); // goal done still marks the day
});

test("cron: no progress row means a generic reminder", async () => {
  const db = fakeDb({ subs: [row(1)] });
  const { push } = await cronCall({ db });
  assert.equal(push.sent[0].payload.body, "Time for today’s blop lessons.");
});

test("cron: 404/410 subscriptions are deleted; other failures un-mark the day for a retry", async () => {
  const db = fakeDb({ subs: [row(1), row(2), row(3), row(4, { last_sent_day: "2026-10-20" })] });
  const push = stubPush({ [EP(1)]: 410, [EP(2)]: 404, [EP(4)]: 500 });
  const { data, logs } = await cronCall({ db, push });
  assert.deepEqual([data.removed, data.sent, data.failed], [2, 1, 1]);
  assert.deepEqual(db.subs.map(s => s.endpoint).sort(), [EP(3), EP(4)]);
  assert.equal(db.subs.find(s => s.endpoint === EP(4)).last_sent_day, "2026-10-20");
  assert.ok(logs.every(l => !l.includes("fcm.googleapis.com")));
});

test("cron: a run that has used its time budget defers the rest", async () => {
  const db = fakeDb({ subs: [row(1), row(2)] });
  const h = Cron.createHandler({ fetch: db.fetch, env: ENV, webPush: stubPush(), now: () => NOW, loadUnits: () => UNITS, log: () => {}, budgetMs: -1 });
  const { data } = await run(h, { method: "POST", headers: { authorization: `Bearer ${ENV.CRON_SECRET}` } });
  assert.equal(data.deferred, 2);
  assert.equal(data.sent, 0);
});

test("cron: missing VAPID config is 503; wrong method is 405", async () => {
  assert.equal((await cronCall({ db: fakeDb(), env: { ...ENV, VAPID_PRIVATE_KEY: "" } })).res.statusCode, 503);
  assert.equal((await cronCall({ db: fakeDb(), method: "DELETE" })).res.statusCode, 405);
});
