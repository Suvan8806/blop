/* Loads the browser scripts (content, logic, state, plan, srs, jobs, mock, core) in a sandbox the way index.html
   does, with a fake localStorage, to check that bad saved or synced data can't crash the app. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const FILES = ["content.js", "content-code.js", "content-sd.js", "content-ml-deep.js", "content-extra.js", "content-interactive.js", "plan.js", "srs.js",
  "jobs.js", "mock-prompts.js", "mock.js", "state.js", "merge.js", "sync-logic.js", "logic.js", "core.js"];

function boot(saved) {
  const store = new Map(saved === undefined ? [] : [["mlepath-v1", JSON.stringify(saved)]]);
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k), key: i => [...store.keys()][i] ?? null, get length() { return store.size; }
  };
  const ctx = { localStorage, console, crypto: require("node:crypto").webcrypto, Date, Math, JSON };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx, { filename: f });
  return { B: ctx.Blop, store };
}
/* Objects from the sandbox have its own prototypes, so compare them as plain JSON. */
const eq = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
const todayNum = () => { const d = new Date(); return Math.floor((d - d.getTimezoneOffset() * 60000) / 864e5); };

test("isTyping spots text fields, so session shortcuts leave typing alone", () => {
  const { B } = boot();
  assert.equal(B.isTyping({ tagName: "INPUT" }), true);
  assert.equal(B.isTyping({ tagName: "TEXTAREA" }), true);
  assert.equal(B.isTyping({ tagName: "SELECT" }), true);
  assert.equal(B.isTyping({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(B.isTyping({ tagName: "BUTTON" }), false);
  assert.equal(B.isTyping(null), false);
});

test("a saved plan with days: 3e8 loads as no plan, and today's schedule doesn't crash", () => {
  const { B } = boot({ plan: { id: "p", start: todayNum() - 3, days: 3e8, knownUnits: 5, startRemaining: 9, targets: {}, updatedAt: 5 } });
  assert.equal(B.S.plan, null);
  assert.equal(B.sched(), null);
  assert.equal(B.dayGoal().plan, false);
});

test("a synced plan with days: 3e8 merged in through replaceState is dropped too", () => {
  const { B } = boot({ done: { u0l0: true }, doneOn: { u0l0: todayNum() } });
  const remote = { plan: { id: "evil", start: todayNum(), days: 3e8, knownUnits: 1e9, startRemaining: 1e9, targets: {}, updatedAt: Date.now() } };
  B.replaceState(B.Merge ? B.Merge.merge(B.S, remote) : require("../merge.js").merge(JSON.parse(JSON.stringify(B.S)), remote));
  assert.equal(B.S.plan, null);
  assert.equal(B.sched(), null);
});

test("a valid plan is kept with fields clamped to this build", () => {
  const { B } = boot({ plan: { id: "p", start: todayNum() - 3, days: 30, knownUnits: 1e6, startRemaining: 1e9, targets: {}, updatedAt: 5 } });
  assert.equal(B.S.plan.knownUnits, B.UNITS.length);
  assert.equal(B.S.plan.startRemaining, B.ALL.length);
  const s = B.sched();
  assert.ok(s && s.plan.length <= 30);
});

test("sched() falls back to no plan if scheduling throws", () => {
  const { B } = boot({ plan: { id: "p", start: todayNum() - 3, days: 30, knownUnits: 5, startRemaining: 9, targets: {}, updatedAt: 5 } });
  B.S.plan = { ...B.S.plan, days: 3e8 }; // bypassing normalize, as a bug elsewhere might
  assert.equal(B.sched(), null);
});

test("bad numbers, srs entries, mock entries, jobs and unknown fields are cleaned on load", () => {
  const { B } = boot({
    xp: "lots", streak: -4, last: 1e12, day: NaN, dayLessons: 1e12, dayXp: -1, miss: { q1: 1e12, q2: -3, q3: "x" },
    times: [1, 5000, NaN, 60], srs: { a: { step: 99, due: 20000, updatedAt: -5 }, b: { step: 1.5, due: 1 }, c: { step: 1, due: 1e12 } },
    jobs: [{ id: "x".repeat(65), day: 20000 }, { id: "ok", day: 20000, company: "c".repeat(500), updatedAt: -1 }],
    mock: [{ id: "m", promptId: "p", answer: "a", day: 20000, result: { scores: [] } }],
    hack: { a: 1 }, __proto__: null, skip: [1, 1, -1, 1e9, "2"], open: 1e9
  });
  const S = B.S;
  assert.equal(S.xp, 0);
  assert.equal(S.streak, 0);
  assert.equal(S.last, 200000);
  assert.equal(S.day, -1);
  assert.equal(S.dayLessons, 100000);
  assert.equal(S.dayXp, 0);
  eq(S.miss, { q1: 100000, q2: 0 });
  eq(S.times, [15, 900, 60]);
  eq(S.srs, { a: { step: 4, due: 20000, updatedAt: 0 } });
  eq(S.jobs.map(j => j.id), ["ok"]);
  assert.equal(S.jobs[0].company.length, 120);
  eq(S.mock, []);
  assert.equal("hack" in S, false);
  eq(S.skip, [1]);
  assert.equal(S.open, null);
});

test("XP is counted per device, and legacy xp becomes the base", () => {
  const { B, store } = boot({ xp: 40 });
  assert.equal(B.S.xp, 40);
  eq(B.S.xpLog, { _base: 40 });
  B.award(10, true);
  assert.equal(B.S.xp, 50);
  assert.equal(B.S.xpLog[B.DEVICE_ID], 10);
  assert.match(store.get("blop-device-id"), /^d[0-9a-f]{16}$/);
  assert.ok(B.S.progressUpdatedAt > 0);
});

test("reset stamps resetAt and progressUpdatedAt; wipe clears everything", () => {
  const { B, store } = boot({ done: { u0l0: true }, xp: 10, jobs: [{ id: "j", day: 20000, updatedAt: 1 }] });
  B.reset();
  assert.ok(B.S.resetAt > 0);
  assert.equal(B.S.progressUpdatedAt, B.S.resetAt);
  eq(B.S.done, {});
  assert.equal(B.S.jobs.length, 1);
  store.set("blop-mock-drafts", "{}");
  B.wipe();
  assert.equal(B.S.jobs.length, 0);
  assert.equal(store.has("blop-mock-drafts"), false);
});
