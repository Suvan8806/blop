/* Loads the browser scripts (content, logic, state, plan, srs, jobs, mock, core) in a sandbox the way index.html
   does, with a fake localStorage, to check that bad saved or synced data can't crash the app. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const FILES = ["content.js", "content-code.js", "content-sd.js", "content-ml-deep.js", "content-extra.js", "plan.js", "srs.js",
  "jobs.js", "mock-prompts.js", "mock.js", "state.js", "merge.js", "sync-logic.js", "logic.js", "paths.js", "core.js"];

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

/* ---------- learning focus ---------- */
const titles = (B, ids) => [...new Set(ids.map(id => B.UNITS[B.BY_ID[id].ui].title))];

test("an old save has no focus; a focus loads cleaned against this build", () => {
  assert.equal(boot({ done: { u0l0: true } }).B.S.focus, null);
  assert.equal(boot(undefined).B.S.focus, null);
  const { B } = boot({ focus: { goals: ["cnn", "bogus", "cnn"], known: ["Python Refresher", "No Such Unit", 7], updatedAt: 9, extra: 1 } });
  eq(B.S.focus, { goals: ["cnn"], known: ["Python Refresher"], deep: true, track: null, updatedAt: 9 });
  assert.equal(B.hasFocus(), true);
  assert.equal(boot({ focus: "x" }).B.S.focus, null);
  assert.equal(boot({ focus: { goals: [] , updatedAt: 3 } }).B.hasFocus(), false);
});

test("without a focus the plan covers every unit in display order, exactly as before", () => {
  const { B } = boot({ skip: [2] });
  assert.equal(B.pathUnits(), null);
  assert.equal(B.pathNext(), null);
  eq(B.planSkip(), [2]);
  assert.equal(B.planIds().length, B.ALL.length - B.UNITS[2].lessons.length);
});

test("with a focus the plan, today's lessons and next-up follow the path, known units left out", () => {
  const { B } = boot({ focus: { goals: ["cnn"], known: ["Python Refresher"], updatedAt: 1 },
    plan: { id: "p", start: todayNum(), days: 14, knownUnits: 53, targets: {}, updatedAt: 1 } });
  eq(titles(B, B.planIds()), ["Start Here", "Math Primer", "Foundations", "Architectures", "Deep Dive: CNN Internals"]);
  const s = B.sched();
  assert.equal(s.total, B.planIds().length);
  assert.equal(s.plan[0].ids[0], "u0l0");
  assert.equal(B.BY_ID[s.plan[0].ids[1]].ui, B.UNITS.findIndex(u => u.title === "Math Primer"));
  assert.equal(B.nextUp().id, "u0l0");
  // startRemaining is estimated over the path for a plan saved without it.
  assert.equal(B.S.plan.startRemaining, B.planIds().length);
});

test("with a focus and no plan, next-up is the first unfinished lesson on the path", () => {
  const { B } = boot({ done: { u0l0: true }, focus: { goals: ["leetcode"], known: ["Python Refresher"], updatedAt: 1 } });
  assert.equal(B.sched(), null);
  const cf = B.UNITS.find(u => u.title === "Coding Foundations");
  assert.equal(B.pathNext().id, cf.lessons[0].id);
  assert.equal(B.nextUp().id, cf.lessons[0].id);
});

test("a synced focus merges by updatedAt and survives a reset", () => {
  const { B } = boot({ focus: { goals: ["cnn"], known: [], updatedAt: 5 } });
  B.replaceState(require("../merge.js").merge(JSON.parse(JSON.stringify(B.S)), { focus: { goals: ["rag"], known: ["Start Here"], updatedAt: 9 } }));
  eq(B.S.focus, { goals: ["rag"], known: ["Start Here"], deep: true, track: null, updatedAt: 9 });
  B.reset();
  eq(B.S.focus.goals, ["rag"]);
});

/* ---------- Go deeper and the reworked path order ---------- */
test("an existing user's old focus and plan don't shrink: deep reads as on, same lessons and the same target today", () => {
  const plan = { id: "p", start: todayNum() - 2, days: 30, knownUnits: 53, startRemaining: 98, targets: {}, updatedAt: 1 };
  const old = boot({ focus: { goals: ["transformers"], known: [], updatedAt: 1 }, plan });
  const deepOn = boot({ focus: { goals: ["transformers"], known: [], deep: true, updatedAt: 1 }, plan });
  assert.equal(old.B.S.focus.deep, true);
  eq(old.B.planIds(), [...deepOn.B.planIds()]);
  assert.equal(old.B.sched().todayTarget, deepOn.B.sched().todayTarget);
  assert.ok(old.B.planIds().some(id => old.B.UNITS[old.B.BY_ID[id].ui].title === "Deep Dive: Attention & Transformers"));
  // The saved copy keeps the focus; on the next save it carries deep: true explicitly.
  old.B.save();
  assert.equal(JSON.parse(old.store.get("mlepath-v1")).focus.deep, true);
});

test("a new goal with Go deeper off plans the core units only; turning it on adds the deep dives", () => {
  const off = boot({ focus: { goals: ["transformers"], known: [], deep: false, track: "llm", updatedAt: 1 } });
  const on = boot({ focus: { goals: ["transformers"], known: [], deep: true, track: "llm", updatedAt: 1 } });
  const deepIn = B => B.planIds().filter(id => B.UNITS[B.BY_ID[id].ui].title.startsWith("Deep Dive:")).length;
  assert.equal(deepIn(off.B), 0);
  assert.ok(deepIn(on.B) > 0);
  assert.equal(on.B.planIds().length - off.B.planIds().length, deepIn(on.B));
  eq(off.B.S.focus, { goals: ["transformers"], known: [], deep: false, track: "llm", updatedAt: 1 });
});

test("a multi-subject goal interleaves: next-up, the path's unit order and the plan agree", () => {
  const { B } = boot({ done: { u0l0: true }, focus: { goals: ["essentials"], known: [], deep: false, updatedAt: 1 } });
  const ids = B.pathIds();
  assert.equal(B.pathNext().id, ids.find(id => !B.S.done[id]));
  assert.equal(B.UNITS[B.pathNext().ui].title, "System Design", "after Start Here comes a system design chunk");
  assert.equal(B.nextUp().id, B.pathNext().id);
  eq(B.planIds(), [...ids]);
  const order = B.pathUnits().map(ui => B.UNITS[ui].title);
  eq(order.slice(0, 3), ["Start Here", "System Design", "Python Refresher"]);
});

test("labels: a unit is named by its title, the lesson kicker counts lessons, the header has no XP pill", () => {
  const { B } = boot({ done: { u0l0: true }, xp: 50 });
  const bp = B.UNITS.find(u => u.title === "Deep Dive: Backprop");
  assert.equal(B.unitLabel(bp.ui), "Backprop");
  assert.equal(B.lessonKicker(B.UNITS[0].lessons[0]), `Start Here · Lesson 1 of ${B.UNITS[0].lessons.length}`);
  const row = B.statsRow();
  assert.ok(!/XP/.test(row));
  assert.ok(/0 of 2 today/.test(row));
  assert.ok(!/streak/.test(row), "no streak pill before day 2");
  const two = boot({ last: todayNum(), streak: 2, done: { u0l0: true } }).B.statsRow();
  assert.ok(/2-day streak/.test(two));
});

test("without a goal, next-up is the next core lesson in the chosen subject, skipping deep dives", () => {
  const ml = boot({}).B;
  const done = {};
  ml.UNITS.filter(u => ["Start Here", "Python Refresher", "Math Primer", "Foundations"].includes(u.title)).forEach(u => u.lessons.forEach(l => { done[l.id] = true; }));
  const { B } = boot({ done });
  // Display order puts Deep Dive: Probability & Stats right after Foundations; the core next-up skips it.
  assert.equal(B.UNITS[B.nextUp().ui].title, "Classical ML Algorithms");
  const code = boot({ subject: "code" }).B;
  assert.equal(code.UNITS[code.nextCore().ui].tr, "code");
});
