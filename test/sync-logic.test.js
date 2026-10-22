const test = require("node:test");
const assert = require("node:assert/strict");
const SL = require("../sync-logic.js");

test("sync is configured only with an https URL and a key", () => {
  assert.equal(SL.isConfigured({ supabaseUrl: "", supabaseAnonKey: "" }), false);
  assert.equal(SL.isConfigured(undefined), false);
  assert.equal(SL.isConfigured({ supabaseUrl: "https://abc.supabase.co", supabaseAnonKey: "" }), false);
  assert.equal(SL.isConfigured({ supabaseUrl: "https://abc.supabase.co", supabaseAnonKey: "k" }), true);
  assert.equal(SL.isConfigured({ supabaseUrl: "http://abc.supabase.co", supabaseAnonKey: "k" }), false);
  assert.equal(SL.isConfigured({ supabaseUrl: "http://127.0.0.1:54321", supabaseAnonKey: "k" }), true);
  assert.equal(SL.isConfigured({ supabaseUrl: "not a url", supabaseAnonKey: "k" }), false);
});

test("a secret or service-role key is refused", () => {
  const jwt = role => `x.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.y`;
  assert.equal(SL.isSecretKey(jwt("service_role")), true);
  assert.equal(SL.isSecretKey(jwt("anon")), false);
  assert.equal(SL.isSecretKey("sb_secret_abc"), true);
  assert.equal(SL.isSecretKey("sb_publishable_abc"), false);
  assert.equal(SL.isConfigured({ supabaseUrl: "https://abc.supabase.co", supabaseAnonKey: jwt("service_role") }), false);
  assert.equal(SL.isConfigured({ supabaseUrl: "https://abc.supabase.co", supabaseAnonKey: jwt("anon") }), true);
});

test("emails and codes are checked before anything is sent", () => {
  assert.equal(SL.cleanEmail("  me@example.com "), "me@example.com");
  assert.equal(SL.cleanEmail("me@example"), "");
  assert.equal(SL.cleanEmail("a b@example.com"), "");
  assert.equal(SL.cleanCode(" 123 456 "), "123456");
  assert.equal(SL.cleanCode("12345"), "");
  assert.equal(SL.cleanCode("12345a"), "");
});

test("sign-in redirects are recognised and cleaned from the address", () => {
  assert.equal(SL.hasAuthParams("https://blop.app/?code=abc"), true);
  assert.equal(SL.hasAuthParams("https://blop.app/#access_token=x&refresh_token=y"), true);
  assert.equal(SL.hasAuthParams("https://blop.app/?error=access_denied&error_description=Nope"), true);
  assert.equal(SL.hasAuthParams("https://blop.app/"), false);
  assert.equal(SL.hasAuthParams("https://blop.app/?tab=jobs"), false);
  assert.equal(SL.cleanUrl("https://blop.app/?code=abc"), "/");
  assert.equal(SL.cleanUrl("https://blop.app/?keep=1&code=abc#access_token=x&type=bearer"), "/?keep=1");
  assert.equal(SL.authError("https://blop.app/?error=access_denied&error_description=User+cancelled"), "User cancelled");
  assert.equal(SL.authError("https://blop.app/"), "");
});

test("errors become friendly messages", () => {
  assert.match(SL.friendlyError(new TypeError("Failed to fetch")), /reach the sync server/);
  assert.match(SL.friendlyError({ message: "Token has expired or is invalid", status: 403 }), /code didn’t work/);
  assert.match(SL.friendlyError({ message: "Email rate limit exceeded", status: 429 }), /Too many tries/);
  assert.match(SL.friendlyError({ message: "Invalid API key" }), /key was rejected/);
  assert.match(SL.friendlyError({ message: 'relation "public.progress" does not exist' }), /table is missing/);
  assert.match(SL.friendlyError(new Error("offline")), /offline/);
  assert.match(SL.friendlyError(new Error("Couldn't load sign-in")), /load sign-in/);
  assert.match(SL.friendlyError({ message: "Unsupported provider: provider is not enabled" }), /Google sign-in isn’t switched on/);
  assert.match(SL.friendlyError(null), /Something went wrong/);
});

/* Fake timers: setTimer returns an id; tick() fires everything due. */
function fakeTimers() {
  let now = 0, id = 0;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => { timers.set(++id, { fn, at: now + ms }); return id; },
    clearTimer: t => timers.delete(t),
    async advance(ms) {
      now += ms;
      for (const [k, t] of [...timers]) if (t.at <= now) { timers.delete(k); t.fn(); }
      await new Promise(r => setImmediate(r));
    }
  };
}

test("pushes are debounced and coalesced", async () => {
  const ft = fakeTimers();
  let runs = 0;
  const s = SL.createScheduler({ run: async () => { runs++; }, delay: 2000, ...ft });
  s.soon(); await ft.advance(1000);
  s.soon(); await ft.advance(1000);
  s.soon(); await ft.advance(1999);
  assert.equal(runs, 0);
  assert.equal(s.pending, true);
  await ft.advance(1);
  assert.equal(runs, 1);
  assert.equal(s.pending, false);
});

test("a request during a run causes exactly one more run afterwards", async () => {
  let release, runs = 0;
  const s = SL.createScheduler({ run: () => { runs++; return new Promise(r => { release = r; }); }, delay: 10 });
  const first = s.flush();
  s.flush(); s.flush();
  assert.equal(runs, 1);
  release(); await first;
  await new Promise(r => setImmediate(r));
  assert.equal(runs, 2);
  release(); await new Promise(r => setImmediate(r));
  assert.equal(s.busy, false);
});

test("a failed push stays pending until flushed again", async () => {
  let fail = true, runs = 0;
  const states = [];
  const s = SL.createScheduler({ run: async () => { runs++; if (fail) throw new Error("offline"); }, onState: st => states.push(st) });
  await s.flush();
  assert.equal(s.pending, true);
  assert.match(String(s.error), /offline/);
  fail = false;
  await s.flush();
  assert.equal(s.pending, false);
  assert.equal(s.error, null);
  assert.equal(runs, 2);
  assert.ok(states.some(x => x.busy) && states.at(-1).busy === false);
});

test("last-synced text", () => {
  const now = 1700000000000;
  assert.equal(SL.agoText(0, now), "Not yet");
  assert.equal(SL.agoText(now - 10e3, now), "Just now");
  assert.equal(SL.agoText(now - 5 * 60e3, now), "5 min ago");
  assert.equal(SL.agoText(now - 3 * 3600e3, now), "3 h ago");
});

test("payloads over 1.5 MB are refused with a clear message", () => {
  assert.equal(SL.checkPayload({ a: 1 }).ok, true);
  const big = { mock: ["x".repeat(SL.MAX_PUSH_BYTES)] };
  const r = SL.checkPayload(big);
  assert.equal(r.ok, false);
  assert.ok(r.bytes > SL.MAX_PUSH_BYTES);
  assert.equal(SL.checkPayload({ s: "é".repeat(SL.MAX_PUSH_BYTES / 2) }).ok, false); // counted in UTF-8 bytes
  assert.match(SL.friendlyError(new SL.PayloadTooLarge(r.bytes)), /too big to sync/);
  assert.match(SL.friendlyError({ message: 'new row violates check constraint "progress_data_size"' }), /too big to sync/);
});

test("signing in on a device with another account's data asks first", () => {
  const data = { done: { u0l0: true } };
  assert.equal(SL.hasLocalData(data), true);
  assert.equal(SL.hasLocalData({ done: {}, xp: 0, jobs: [{ id: "a", deleted: true }], mock: [], plan: { ended: true } }), false);
  assert.equal(SL.hasLocalData({ xp: 5 }), true);
  assert.equal(SL.hasLocalData({ jobs: [{ id: "a" }] }), true);
  assert.equal(SL.hasLocalData({ plan: { id: "p", start: 1, days: 2 } }), true);
  assert.equal(SL.hasLocalData(null), false);
  assert.equal(SL.ownerCheck({ owner: "A", userId: "B", hasData: true }), "ask");
  assert.equal(SL.ownerCheck({ owner: "A", userId: "A", hasData: true }), "adopt");
  assert.equal(SL.ownerCheck({ owner: "A", userId: "B", hasData: false }), "adopt");
  assert.equal(SL.ownerCheck({ owner: undefined, userId: "B", hasData: true }), "adopt"); // first sign-in merges local progress in
});

test("every supabase-js key for the storage key is recognised, nothing else", () => {
  for (const k of ["blop-auth", "blop-auth-code-verifier", "blop-auth-user", "blop-auth-flows-code-verifier", "blop-auth-flow-abc-code-verifier"])
    assert.equal(SL.isAuthKey(k, "blop-auth"), true, k);
  for (const k of ["blop-authx", "blop-sync-meta", "mlepath-v1", "blop-device-id", null])
    assert.equal(SL.isAuthKey(k, "blop-auth"), false, String(k));
});
