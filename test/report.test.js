// /api/report: body validation, IP hashing and the handler with a fake Supabase (stubbed fetch, no network).
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../api/_lib/report-core.js");
const { createHandler } = require("../api/_lib/report-handler.js");

const UID = "11111111-2222-4333-8444-555555555555";
const ENV = { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_svc", REPORT_SALT: "s".repeat(32) };
const IP = "203.0.113.7";
const BODY = { lessonId: "u3l2", questionId: "u3l2q1", reason: "wrong", note: "The answer should be B.", shownText: "Prompt\nA\nB", appVersion: "blop-v16", ts: "2026-10-22T10:00:00Z" };
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function fakeDb({ rows = [], user = 200, dbDown = false } = {}) {
  const db = { rows: rows.map(r => ({ ...r })), calls: [] };
  const eq = (u, col) => { const m = new RegExp(`[?&]${col}=eq\\.([^&]*)`).exec(u); return m ? decodeURIComponent(m[1]) : null; };
  db.fetch = async (url, init = {}) => {
    const method = init.method || "GET";
    db.calls.push({ url, method, init });
    if (url.endsWith("/auth/v1/user")) return user === 200 ? json(200, { id: UID }) : json(user, {});
    if (dbDown) return json(500, {});
    if (!url.includes("/rest/v1/content_reports")) return json(404, {});
    if (method === "GET") {
      const uid = eq(url, "user_id"), hash = eq(url, "reporter_hash"), anon = url.includes("user_id=is.null");
      return json(200, db.rows.filter(r => (uid ? r.user_id === uid : true) && (hash ? r.reporter_hash === hash : true) && (anon ? r.user_id === null : true)));
    }
    if (method === "POST") { db.rows.push({ id: db.rows.length + 1, ...JSON.parse(init.body) }); return json(201, null); }
    return json(405, {});
  };
  return db;
}
function mockRes() {
  return { statusCode: 0, headers: {}, body: "", setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b || ""; } };
}
async function call({ db = fakeDb(), env = ENV, method = "POST", headers = {}, body = BODY, now } = {}) {
  const logs = [];
  const h = createHandler({ fetch: db.fetch, env, log: (...a) => logs.push(a.join(" ")), ...(now ? { now } : {}) });
  const req = { method, body, headers: { host: "blop.example", origin: "https://blop.example", "content-type": "application/json",
    "x-forwarded-for": `${IP}, 10.0.0.1`, ...headers } };
  const res = mockRes();
  await h(req, res);
  return { res, data: res.body ? JSON.parse(res.body) : null, db, logs };
}

/* ---------- validation ---------- */
test("validateReport: a good body becomes a row with only known fields", () => {
  const v = core.validateReport(BODY);
  assert.equal(v.ok, true);
  assert.deepEqual(v.row, { lesson_id: "u3l2", question_id: "u3l2q1", reason: "wrong", note: "The answer should be B.",
    shown_text: "Prompt\nA\nB", app_version: "blop-v16" });
  assert.equal(core.validateReport(JSON.stringify(BODY)).ok, true);
});

test("validateReport: teach slides, a missing note and odd versions are accepted", () => {
  const v = core.validateReport({ lessonId: "u0l0", questionId: "teach", reason: "typo", appVersion: "<script>" });
  assert.equal(v.ok, true);
  assert.equal(v.row.note, "");
  assert.equal(v.row.app_version, "unknown");
});

test("validateReport: ids must match the lesson/question patterns", () => {
  for (const [lessonId, questionId] of [["u3", "u3l2q1"], ["x3l2", "u3l2q1"], ["u3l2", "u3l2"], ["u3l2", "u4l2q1"], ["u3l2", "u3l2q1;drop"],
    ["u3l2 ", "u3l2q1"], ["u3l2", ""], [3, "teach"]]) {
    const v = core.validateReport({ ...BODY, lessonId, questionId });
    assert.equal(v.ok, false, `${lessonId} ${questionId}`);
    assert.equal(v.status, 400);
  }
});

test("validateReport: the reason must be in the list and the note at most 500 characters", () => {
  assert.equal(core.validateReport({ ...BODY, reason: "spam" }).ok, false);
  assert.equal(core.validateReport({ ...BODY, reason: undefined }).ok, false);
  assert.equal(core.validateReport({ ...BODY, note: "x".repeat(500) }).ok, true);
  const long = core.validateReport({ ...BODY, note: "x".repeat(501) });
  assert.equal(long.ok, false); assert.match(long.error, /500/);
  assert.equal(core.validateReport({ ...BODY, note: 5 }).ok, false);
});

test("validateReport: bad JSON, arrays and oversized bodies are rejected; control characters are stripped", () => {
  assert.equal(core.validateReport("{").status, 400);
  assert.equal(core.validateReport([]).status, 400);
  assert.equal(core.validateReport("x".repeat(9000)).status, 413);
  const v = core.validateReport({ ...BODY, note: "a\u001b[31mb\nc", shownText: "y".repeat(5000) });
  assert.equal(v.row.note, "a[31mb\nc");
  assert.equal(v.row.shown_text.length, core.MAX_SHOWN);
});

test("clientIp, saltOf and hashIp: a salted SHA-256, never the IP itself", () => {
  assert.equal(core.clientIp({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }), "1.2.3.4");
  assert.equal(core.clientIp({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.2.3.4" }), "9.9.9.9");
  assert.equal(core.clientIp({}, { remoteAddress: "::1" }), "::1");
  assert.equal(core.clientIp({}), "unknown");
  assert.equal(core.saltOf({ REPORT_SALT: "a", CRON_SECRET: "b" }), "a");
  assert.equal(core.saltOf({ CRON_SECRET: "b" }), "b");
  assert.equal(core.saltOf({}), "");
  const h = core.hashIp(IP, "salt");
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, core.hashIp(IP, "other"));
  assert.ok(!h.includes(IP));
});

/* ---------- handler ---------- */
test("report: an anonymous POST is stored without a user and without the raw IP", async () => {
  const { res, data, db } = await call();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(data, { ok: true });
  assert.equal(db.rows.length, 1);
  const row = db.rows[0];
  assert.equal(row.user_id, null);
  assert.equal(row.reporter_hash, core.hashIp(IP, ENV.REPORT_SALT));
  assert.equal(row.lesson_id, "u3l2"); assert.equal(row.question_id, "u3l2q1"); assert.equal(row.reason, "wrong");
  assert.ok(!db.calls.some(c => String(c.init.body || "").includes(IP) || c.url.includes(IP)), "raw IP never sent to the database");
  assert.ok(!db.calls.some(c => c.url.endsWith("/auth/v1/user")), "no token, no auth check");
  const post = db.calls.find(c => c.method === "POST");
  assert.equal(post.init.headers.apikey, "sb_secret_svc");
});

test("report: a valid bearer token stores the user's id", async () => {
  const { res, db } = await call({ headers: { authorization: "Bearer user-token" } });
  assert.equal(res.statusCode, 200);
  assert.equal(db.rows[0].user_id, UID);
});

test("report: a bad or unverifiable token is treated as anonymous", async () => {
  for (const user of [401, 500]) {
    const { res, db } = await call({ db: fakeDb({ user }), headers: { authorization: "Bearer stale" } });
    assert.equal(res.statusCode, 200);
    assert.equal(db.rows[0].user_id, null);
  }
});

test("report: invalid ids, a bad reason and a long note are rejected before touching the database", async () => {
  for (const body of [{ ...BODY, lessonId: "lesson1" }, { ...BODY, questionId: "u9l9q1" }, { ...BODY, reason: "nope" }, { ...BODY, note: "n".repeat(501) }]) {
    const { res, data, db } = await call({ body });
    assert.equal(res.statusCode, 400);
    assert.equal(data.ok, false);
    assert.equal(db.calls.length, 0);
  }
});

test("report: 20 a day per IP hash for anonymous reports, then 429", async () => {
  const hash = core.hashIp(IP, ENV.REPORT_SALT);
  const now = Date.parse("2026-10-22T12:00:00Z");
  const db = fakeDb({ rows: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, user_id: null, reporter_hash: hash })) });
  const { res } = await call({ db, now: () => now });
  assert.equal(res.statusCode, 429);
  assert.equal(db.rows.length, 20);
  const get = db.calls.find(c => c.method === "GET");
  assert.ok(get.url.includes(`created_at=gte.${encodeURIComponent(new Date(now - 864e5).toISOString())}`), "counts the last 24 hours");
  const other = await call({ db, headers: { "x-forwarded-for": "198.51.100.1" } });
  assert.equal(other.res.statusCode, 200, "another IP is still fine");
});

test("report: a signed-in user's limit counts their own reports, not the IP's", async () => {
  const hash = core.hashIp(IP, ENV.REPORT_SALT);
  const anonRows = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, user_id: null, reporter_hash: hash }));
  const ok = await call({ db: fakeDb({ rows: anonRows }), headers: { authorization: "Bearer t" } });
  assert.equal(ok.res.statusCode, 200);
  const mine = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, user_id: UID, reporter_hash: "other" }));
  const limited = await call({ db: fakeDb({ rows: mine }), headers: { authorization: "Bearer t", "x-forwarded-for": "198.51.100.9" } });
  assert.equal(limited.res.statusCode, 429);
});

test("report: 503 when Supabase or the salt is not configured, or the database fails", async () => {
  for (const env of [{}, { ...ENV, SUPABASE_URL: "" }, { ...ENV, SUPABASE_SERVICE_ROLE_KEY: "" }, { ...ENV, REPORT_SALT: "" }]) {
    const { res, data, db } = await call({ env });
    assert.equal(res.statusCode, 503);
    assert.equal(data.ok, false);
    assert.equal(db.calls.length, 0);
  }
  const salted = await call({ env: { ...ENV, REPORT_SALT: "", CRON_SECRET: "c".repeat(40) } });
  assert.equal(salted.res.statusCode, 200, "CRON_SECRET is the fallback salt");
  const down = await call({ db: fakeDb({ dbDown: true }) });
  assert.equal(down.res.statusCode, 503);
  assert.ok(down.logs.some(l => l.includes("database error")));
});

test("report: POST only, same origin, JSON only", async () => {
  const get = await call({ method: "GET" });
  assert.equal(get.res.statusCode, 405);
  assert.equal(get.res.headers.allow, "POST, OPTIONS");
  assert.equal((await call({ method: "OPTIONS" })).res.statusCode, 204);
  assert.equal((await call({ headers: { origin: "https://evil.example" } })).res.statusCode, 403);
  assert.equal((await call({ headers: { "sec-fetch-site": "cross-site" } })).res.statusCode, 403);
  assert.equal((await call({ headers: { "content-type": "text/plain" } })).res.statusCode, 415);
});
