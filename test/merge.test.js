const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../merge.js");
const St = require("../state.js");

const T = 20748, NOW = 1700000000000;
const job = (id, at, extra = {}) => ({ id, company: id.toUpperCase(), role: "", link: "", day: T, status: "applied", updatedAt: at, ...extra });
const plan = (id, at, extra = {}) => ({ id, start: T - 10, days: 30, knownUnits: 50, startRemaining: 100, targets: {}, updatedAt: at, ...extra });
const byId = l => l.slice().sort((x, y) => x.id.localeCompare(y.id));
/* Everything but device-only fields and job order should agree whichever side is "local". */
function sym(a, b) {
  const x = M.merge(a, b), y = M.merge(b, a);
  delete x.open; delete y.open;
  x.jobs = byId(x.jobs); y.jobs = byId(y.jobs);
  assert.deepEqual(x, y);
  return M.merge(a, b);
}

test("finished lessons are a union and keep the earliest day", () => {
  const a = { done: { u0l0: true, u0l1: true }, doneOn: { u0l0: T - 5, u0l1: T } };
  const b = { done: { u0l1: true, u2l0: true }, doneOn: { u0l1: T - 2, u2l0: T - 1 } };
  const m = sym(a, b);
  assert.deepEqual(m.done, { u0l0: true, u0l1: true, u2l0: true });
  assert.deepEqual(m.doneOn, { u0l0: T - 5, u0l1: T - 2, u2l0: T - 1 });
});

test("xp takes the max and missed counts take the max per question", () => {
  const m = sym({ xp: 40, miss: { a: 2, b: 0 } }, { xp: 55, miss: { a: 1, c: 3 } });
  assert.equal(m.xp, 55);
  assert.deepEqual(m.miss, { a: 2, b: 0, c: 3 });
});

test("streak comes as a pair from the side that studied most recently", () => {
  assert.deepEqual(pick(sym({ streak: 9, last: T - 1 }, { streak: 2, last: T })), { streak: 2, last: T });
  assert.deepEqual(pick(sym({ streak: 3, last: T }, { streak: 5, last: T })), { streak: 5, last: T });
  function pick(m) { return { streak: m.streak, last: m.last }; }
});

test("review schedule: newer entry per lesson wins", () => {
  const a = { srs: { x: { step: 3, due: T + 21, updatedAt: 5 }, y: { step: 0, due: T + 1, updatedAt: 9 } } };
  const b = { srs: { x: { step: 0, due: T + 1, updatedAt: 7 }, z: { step: 1, due: T + 3, updatedAt: 1 } } };
  const m = sym(a, b);
  assert.deepEqual(m.srs, { x: b.srs.x, y: a.srs.y, z: b.srs.z });
});

test("jobs merge per id by updatedAt, with tombstones, and nothing is dropped", () => {
  const a = { jobs: [job("a", 5, { status: "oa" }), job("b", 5), { id: "c", deleted: true, updatedAt: 9 }, job("d", 1)] };
  const b = { jobs: [job("a", 3, { status: "offer" }), job("b", 8, { status: "phone" }), job("c", 4), job("e", 2), { id: "d", deleted: true, updatedAt: 1 }] };
  const m = sym(a, b);
  const got = Object.fromEntries(m.jobs.map(j => [j.id, j]));
  assert.equal(got.a.status, "oa");        // local newer
  assert.equal(got.b.status, "phone");     // remote newer
  assert.equal(got.c.deleted, true);       // the delete is newer than the edit
  assert.equal(got.d.deleted, true);       // same time: the delete wins
  assert.ok(got.e);                        // remote-only job kept
  assert.deepEqual(m.jobs.map(j => j.id), ["a", "b", "c", "d", "e"]); // local order, then new ones
});

test("an edit made after a delete on another device brings the job back", () => {
  const m = sym({ jobs: [{ id: "a", deleted: true, updatedAt: 5 }] }, { jobs: [job("a", 6, { status: "onsite" })] });
  assert.equal(m.jobs[0].status, "onsite");
});

test("plan: newer wins, an ended plan beats an older active one, and null never wins", () => {
  const p = plan("p1", 10, { days: 45 });
  assert.deepEqual(sym({ plan: p }, { plan: { ended: true, updatedAt: 20 } }).plan, { ended: true, updatedAt: 20 });
  assert.deepEqual(sym({ plan: p }, { plan: { ended: true, updatedAt: 5 } }).plan, p);
  assert.deepEqual(sym({ plan: p }, { plan: null }).plan, p);
  assert.deepEqual(sym({ plan: null }, {}).plan, null);
  const q = plan("p2", 12);
  assert.deepEqual(sym({ plan: p }, { plan: q }).plan, q);
});

test("same plan: targets merge per day with max; settings of the plan follow the newer copy", () => {
  const a = { plan: plan("p1", 10, { days: 30, targets: { [T - 2]: 3, [T - 1]: 4 } }) };
  const b = { plan: plan("p1", 11, { days: 45, targets: { [T - 1]: 6, [T]: 5 } }) };
  const m = sym(a, b);
  assert.equal(m.plan.days, 45);
  assert.deepEqual(m.plan.targets, { [T - 2]: 3, [T - 1]: 6, [T]: 5 });
  // different plans don't mix targets
  const c = { plan: plan("p9", 12, { targets: { [T]: 1 } }) };
  assert.deepEqual(sym(a, c).plan.targets, { [T]: 1 });
});

test("lesson times: union without double counting, newest side's order, last 20", () => {
  assert.deepEqual(M.mergeTimes([60, 90, 120], [60, 90, 45]), [60, 90, 120, 45]);
  assert.deepEqual(M.mergeTimes([60, 60], [60]), [60, 60]);
  const long = Array.from({ length: 18 }, (_, i) => 100 + i);
  assert.equal(M.mergeTimes(long, [1, 2, 3, 4]).length, 20);
  assert.deepEqual(M.mergeTimes(long, [1, 2, 3, 4]).slice(-4), [1, 2, 3, 4]);
  const m = sym({ times: [60, 90], updatedAt: 2 }, { times: [90, 30], updatedAt: 1 });
  assert.deepEqual(m.times, [60, 90, 30]);
});

test("settings move together by settingsUpdatedAt", () => {
  const a = { goal: 3, jobTarget: 20, subject: "sd", remind: "08:00", skip: [1], settingsUpdatedAt: 50 };
  const b = { goal: 1, jobTarget: 15, subject: "ml", remind: "19:00", skip: [], settingsUpdatedAt: 40 };
  const m = sym(a, b);
  assert.deepEqual([m.goal, m.jobTarget, m.subject, m.remind, m.skip, m.settingsUpdatedAt], [3, 20, "sd", "08:00", [1], 50]);
  const m2 = sym({ ...a, settingsUpdatedAt: 10 }, b);
  assert.equal(m2.goal, 1);
});

test("day counters: same day takes the max, otherwise the later day", () => {
  const m = sym({ day: T, dayLessons: 2, dayXp: 25 }, { day: T, dayLessons: 3, dayXp: 15 });
  assert.deepEqual([m.day, m.dayLessons, m.dayXp], [T, 3, 25]);
  const m2 = sym({ day: T - 1, dayLessons: 9, dayXp: 90 }, { day: T, dayLessons: 1, dayXp: 10 });
  assert.deepEqual([m2.day, m2.dayLessons, m2.dayXp], [T, 1, 10]);
});

test("unknown top-level fields are dropped from both sides", () => {
  const m = sym({ future: ["old"], extra: 1, updatedAt: 5 }, { future: ["new"], other: 2, updatedAt: 9 });
  assert.equal("future" in m, false);
  assert.equal("extra" in m, false);
  assert.equal("other" in m, false);
  assert.equal(m.updatedAt, 9);
  assert.ok(Object.keys(m).every(k => St.KNOWN_KEYS.includes(k)));
});

test("device-only fields stay local", () => {
  assert.equal(M.merge({ open: 3 }, { open: 7 }).open, 3);
  assert.equal("open" in M.merge({}, { open: 7 }), false);
});

test("first login with progress on both sides merges everything and loses nothing", () => {
  const phone = {
    done: { u0l0: true, u0l1: true, u1l0: true }, doneOn: { u0l0: T - 3, u0l1: T - 2, u1l0: T }, xp: 45, streak: 3, last: T,
    miss: { u0l0q1: 1 }, srs: { u0l0: { step: 1, due: T + 2, updatedAt: NOW - 100 }, u0l1: { step: 0, due: T + 1, updatedAt: NOW - 50 } },
    times: [80, 95], goal: 2, subject: "ml", jobTarget: 15, remind: "19:00", skip: [], settingsUpdatedAt: 0,
    jobs: [job("p1", NOW - 10), job("p2", NOW - 5, { status: "oa" })], plan: plan("pa", NOW - 1000),
    day: T, dayLessons: 1, dayXp: 10, open: 0, updatedAt: NOW
  };
  const laptop = {
    done: { u0l0: true, u5l0: true, u5l1: true }, doneOn: { u0l0: T - 6, u5l0: T - 1, u5l1: T - 1 }, xp: 60, streak: 5, last: T - 1,
    miss: { u0l0q1: 3, u5l0q0: 1 }, srs: { u0l0: { step: 2, due: T + 4, updatedAt: NOW - 200 }, u5l0: { step: 0, due: T, updatedAt: NOW - 300 } },
    times: [120], goal: 3, subject: "sd", jobTarget: 25, remind: "07:30", skip: [4], settingsUpdatedAt: NOW - 400,
    jobs: [job("l1", NOW - 20)], plan: null,
    day: T - 1, dayLessons: 4, dayXp: 40, open: 5, updatedAt: NOW - 400
  };
  const m = sym(phone, laptop);
  assert.deepEqual(Object.keys(m.done).sort(), ["u0l0", "u0l1", "u1l0", "u5l0", "u5l1"]);
  assert.equal(m.doneOn.u0l0, T - 6);
  assert.equal(m.xp, 60);
  assert.deepEqual([m.streak, m.last], [3, T]);
  assert.deepEqual(m.miss, { u0l0q1: 3, u5l0q0: 1 });
  assert.deepEqual(Object.keys(m.srs).sort(), ["u0l0", "u0l1", "u5l0"]);
  assert.equal(m.srs.u0l0.step, 1); // the phone's entry is newer
  assert.deepEqual(m.jobs.map(j => j.id).sort(), ["l1", "p1", "p2"]);
  assert.equal(m.plan.id, "pa");
  assert.deepEqual([m.goal, m.subject, m.jobTarget, m.remind], [3, "sd", 25, "07:30"]); // the laptop changed settings, the phone never did
  assert.deepEqual(m.times.slice().sort(), [120, 80, 95].sort());
  assert.deepEqual([m.day, m.dayLessons], [T, 1]);
  assert.equal(M.merge(phone, laptop).open, 0);
});

test("merging is idempotent and tolerates missing or malformed remote data", () => {
  const a = { done: { x: true }, xp: 5, jobs: [job("a", 1)], srs: { x: { step: 0, due: T, updatedAt: 1 } }, plan: plan("p", 1), updatedAt: 3 };
  const once = M.merge(a, a);
  assert.deepEqual(M.merge(once, a), once);
  for (const bad of [null, undefined, "x", 42, [], { done: "nope", jobs: "nope", srs: [1], miss: null, times: "x", plan: 5 }]) {
    const m = M.merge(a, bad);
    assert.deepEqual(m.done, { x: true });
    assert.deepEqual(m.jobs, a.jobs);
    assert.deepEqual(m.srs, a.srs);
    assert.deepEqual(m.plan, a.plan);
  }
  assert.deepEqual(M.merge(a, { jobs: [null, { id: "" }, { id: 5 }] }).jobs, a.jobs);
});

test("merge doesn't modify its inputs", () => {
  const a = { done: { x: true }, jobs: [job("a", 1)], plan: plan("p", 1, { targets: { 1: 2 } }), times: [1] };
  const b = { done: { y: true }, jobs: [job("a", 2)], plan: plan("p", 2, { targets: { 1: 3 } }), times: [2] };
  const before = JSON.stringify([a, b]);
  M.merge(a, b);
  assert.equal(JSON.stringify([a, b]), before);
});

/* ---------- mock interview attempts ---------- */
const attempt = (id, at, extra = {}) => ({ id, promptId: "ml-bias-variance", answer: "an answer", day: T,
  result: { scores: [{ area: "Definitions", score: 3, note: "" }], overall: 3, strengths: [], gaps: [], outline: [] }, updatedAt: at, ...extra });

test("mock attempts merge per id by updatedAt, union of both sides, newest first", () => {
  const a = { mock: [attempt("a", 5), attempt("b", 7)] };
  const b = { mock: [attempt("b", 3, { answer: "older copy" }), attempt("c", 9)] };
  const m = sym(a, b);
  assert.deepEqual(m.mock.map(x => x.id), ["c", "b", "a"]);
  assert.equal(m.mock.find(x => x.id === "b").answer, "an answer");
});

test("a deleted attempt stays deleted unless the other side changed it later", () => {
  const m = sym({ mock: [{ id: "a", deleted: true, updatedAt: 8 }, { id: "t", deleted: true, updatedAt: 4 }] },
    { mock: [attempt("a", 6), attempt("t", 4)] });
  assert.equal(m.mock.find(x => x.id === "a").deleted, true); // delete is newer
  assert.equal(m.mock.find(x => x.id === "t").deleted, true); // exact tie: the tombstone wins
  const n = sym({ mock: [{ id: "a", deleted: true, updatedAt: 5 }] }, { mock: [attempt("a", 6)] });
  assert.equal(n.mock[0].deleted, undefined);
});

test("mock history is capped at the newest 100 after a merge, the same either way round", () => {
  const a = { mock: Array.from({ length: 80 }, (_, i) => attempt(`a${i}`, 1000 + i * 2)) };
  const b = { mock: Array.from({ length: 80 }, (_, i) => attempt(`b${i}`, 1001 + i * 2)) };
  const m = sym(a, b);
  assert.equal(m.mock.length, M.KEEP_MOCK);
  assert.equal(m.mock[0].updatedAt, 1001 + 79 * 2);
  assert.ok(m.mock.every(x => x.updatedAt >= 1000 + 60)); // the 60 oldest dropped
});

test("missing or malformed mock lists merge to what's valid", () => {
  assert.deepEqual(M.merge({}, {}).mock, []);
  assert.deepEqual(M.merge({ mock: "x" }, { mock: [null, 5, { id: "" }, attempt("ok", 1)] }).mock.map(x => x.id), ["ok"]);
});

/* ---------- reset ---------- */
const studied = (at, extra = {}) => ({
  done: { u0l0: true, u0l1: true }, doneOn: { u0l0: T - 2, u0l1: T - 1 }, xp: 30, xpLog: { dA: 30 }, streak: 4, last: T - 1,
  miss: { u0l0q1: 2 }, srs: { u0l0: { step: 2, due: T + 3, updatedAt: at } }, times: [60, 90], day: T - 1, dayLessons: 2, dayXp: 20,
  jobs: [job("j1", at)], goal: 3, settingsUpdatedAt: at, progressUpdatedAt: at, updatedAt: at, ...extra
});

test("a reset sticks: progress from a copy last changed before the reset is ignored", () => {
  const remote = studied(NOW - 1000);
  const local = St.resetProgress(studied(NOW - 1000), NOW);
  const m = sym(local, remote);
  assert.deepEqual(m.done, {});
  assert.deepEqual(m.doneOn, {});
  assert.equal(m.xp, 0);
  assert.deepEqual(m.xpLog, {});
  assert.deepEqual([m.streak, m.last], [0, -1]);
  assert.deepEqual(m.miss, {});
  assert.deepEqual(m.srs, {});
  assert.deepEqual(m.times, []);
  assert.deepEqual([m.day, m.dayLessons, m.dayXp], [-1, 0, 0]);
  assert.equal(m.resetAt, NOW);
  assert.equal(m.progressUpdatedAt, NOW);
  // jobs and settings are unaffected
  assert.deepEqual(m.jobs.map(j => j.id), ["j1"]);
  assert.equal(m.goal, 3);
  // the merged copy keeps winning against a third device that is still stale
  const m2 = sym(studied(NOW - 500, { done: { u9l9: true } }), m);
  assert.deepEqual(m2.done, {});
});

test("progress made after a reset is kept, on either side", () => {
  const reset = St.resetProgress(studied(NOW - 1000), NOW);
  const later = studied(NOW + 50, { done: { u3l0: true }, doneOn: { u3l0: T }, xpLog: { dB: 15 } });
  const m = sym(reset, later);
  assert.deepEqual(m.done, { u3l0: true });
  assert.equal(m.xp, 15);
  assert.equal(m.progressUpdatedAt, NOW + 50);
  const after = { ...reset, done: { u1l0: true }, xpLog: { dA: 10 }, progressUpdatedAt: NOW + 10 };
  const m2 = sym(after, later);
  assert.deepEqual(Object.keys(m2.done).sort(), ["u1l0", "u3l0"]);
  assert.equal(m2.xp, 25);
});

test("copies with no reset anywhere merge as before", () => {
  const m = sym(studied(NOW - 10), { done: { u5l0: true }, xp: 7 });
  assert.deepEqual(Object.keys(m.done).sort(), ["u0l0", "u0l1", "u5l0"]);
  assert.equal(m.resetAt, 0);
});

/* ---------- xp per device ---------- */
test("XP earned offline on two devices adds up", () => {
  assert.equal(sym({ xpLog: { dA: 100 } }, { xpLog: { dB: 80 } }).xp, 180); // A earns 100, B earns 80: 180
  const base = { [St.BASE_XP_KEY]: 500 };
  const a = { xpLog: { ...base, dA: 100 } }, b = { xpLog: { ...base, dB: 80 } };
  const m = sym(a, b);
  assert.equal(m.xp, 680);
  assert.deepEqual(m.xpLog, { [St.BASE_XP_KEY]: 500, dA: 100, dB: 80 });
  assert.equal(sym(m, b).xp, 680); // merging again doesn't double count
});

test("old copies without xpLog count their xp once, as the shared base", () => {
  assert.equal(sym({ xp: 100 }, { xp: 100 }).xp, 100); // two devices that already synced: 100, not 200
  assert.equal(sym({ xpLog: { [St.BASE_XP_KEY]: 100, dA: 20 } }, { xp: 100 }).xp, 120);
  assert.equal(sym({ xp: 9999, xpLog: { dA: 5 } }, {}).xp, 5); // xp is derived from xpLog when it exists
});

/* ---------- clock skew ---------- */
test("timestamps far in the future are capped at now + 1 day", () => {
  const now = NOW, cap = now + M.MAX_SKEW_MS;
  const future = { jobs: [job("a", now * 10, { status: "offer" })], srs: { x: { step: 4, due: T, updatedAt: now * 10 } },
    plan: plan("p1", now * 10), goal: 5, settingsUpdatedAt: now * 10, updatedAt: now * 10, progressUpdatedAt: now * 10, resetAt: now * 10 };
  const m = M.merge({}, future, now);
  assert.equal(m.jobs[0].updatedAt, cap);
  assert.equal(m.srs.x.updatedAt, cap);
  assert.equal(m.plan.updatedAt, cap);
  assert.equal(m.settingsUpdatedAt, cap);
  assert.equal(m.updatedAt, cap);
  assert.equal(m.resetAt, cap);
  // an edit made once the real clock passes the cap wins over the capped copy
  const edit = { jobs: [job("a", cap + 1, { status: "rejected" })], goal: 1, settingsUpdatedAt: cap + 1 };
  const m2 = M.merge(edit, m, cap + 1);
  assert.equal(m2.jobs[0].status, "rejected");
  assert.equal(m2.goal, 1);
  assert.equal(M.merge({ jobs: [job("b", now - 5)] }, {}, now).jobs[0].updatedAt, now - 5); // normal stamps untouched
});

test("focus: newer updatedAt wins as one piece, null never wins, future stamps are capped", () => {
  const f = (goals, at, known = []) => ({ goals, known, updatedAt: at });
  assert.deepEqual(sym({ focus: f(["cnn"], 5) }, { focus: f(["rag"], 9, ["Start Here"]) }).focus, f(["rag"], 9, ["Start Here"]));
  assert.deepEqual(sym({ focus: f(["cnn"], 5) }, { focus: null }).focus, f(["cnn"], 5));
  assert.deepEqual(sym({ focus: f([], 7) }, { focus: f(["cnn"], 5) }).focus, f([], 7)); // a later "no focus" wins
  assert.equal(M.merge({}, {}).focus, null);
  const ahead = M.merge({ focus: f(["cnn"], NOW) }, { focus: f(["dp"], NOW + 50 * 864e5) }, NOW);
  assert.equal(ahead.focus.updatedAt, NOW + M.MAX_SKEW_MS);
});
