const test = require("node:test");
const assert = require("node:assert/strict");
const St = require("../state.js");

const full = () => ({
  done: { u0l0: true }, doneOn: { u0l0: 5 }, xp: 120, streak: 4, last: 9, miss: { u0l0q1: 2 }, srs: { u0l0: { step: 1, due: 12, updatedAt: 1 } },
  times: [60, 90], day: 9, dayLessons: 2, dayXp: 20, open: 3,
  plan: { id: "p1", start: 1, days: 30, knownUnits: 5, startRemaining: 10, targets: {}, updatedAt: 2 },
  jobs: [{ id: "a", company: "Acme", role: "", link: "", day: 9, status: "oa", updatedAt: 3 }], jobTarget: 20,
  goal: 3, subject: "sd", remind: "08:30", skip: [2], settingsUpdatedAt: 4, updatedAt: 5
});

test("reset clears study progress and ends the plan, keeping jobs and settings", () => {
  const s = full();
  const r = St.resetProgress(s, 1000);
  assert.deepEqual(r.done, {});
  assert.deepEqual(r.doneOn, {});
  assert.equal(r.xp, 0);
  assert.equal(r.streak, 0);
  assert.equal(r.last, -1);
  assert.deepEqual(r.miss, {});
  assert.deepEqual(r.srs, {});
  assert.deepEqual(r.times, []);
  assert.deepEqual([r.day, r.dayLessons, r.dayXp], [-1, 0, 0]);
  assert.deepEqual(r.plan, { ended: true, updatedAt: 1000 });
  assert.deepEqual(r.jobs, s.jobs);
  assert.deepEqual([r.jobTarget, r.goal, r.subject, r.remind, r.skip, r.settingsUpdatedAt], [20, 3, "sd", "08:30", [2], 4]);
  assert.equal(s.xp, 120); // input untouched
  assert.equal(St.resetProgress({ ...s, plan: null }, 1).plan, null);
});

test("settings changes are stamped and only touch settings", () => {
  const s = full();
  const r = St.withSettings(s, { goal: 5, xp: 999 }, 77);
  assert.equal(r.goal, 5);
  assert.equal(r.xp, 120);
  assert.equal(r.settingsUpdatedAt, 77);
  assert.equal(s.goal, 3);
});

test("reminder times are validated", () => {
  assert.equal(St.validTime("08:30"), "08:30");
  assert.equal(St.validTime("25:00"), St.DEFAULT_REMIND);
  assert.equal(St.validTime(undefined), "19:00");
});

test("reset keeps mock interview history", () => {
  const mock = [{ id: "m1", promptId: "ml-bias-variance", answer: "a", result: {}, day: 1, updatedAt: 1 }];
  const out = St.resetProgress({ done: { a: true }, xp: 9, mock }, 5);
  assert.deepEqual(out.mock, mock);
  assert.deepEqual(out.done, {});
});

test("reset stamps resetAt and progressUpdatedAt and clears per-device XP", () => {
  const r = St.resetProgress({ ...full(), xpLog: { dA: 100 } }, 1000);
  assert.equal(r.resetAt, 1000);
  assert.equal(r.progressUpdatedAt, 1000);
  assert.deepEqual(r.xpLog, {});
});

test("clean keeps only known fields and bounds every progress number", () => {
  const c = St.clean({ ...full(), evil: 1, constructor: "x", xp: 1e15, streak: 1e12, last: -50, day: 3.6, dayLessons: -1, dayXp: Infinity,
    miss: { q: 1e9, ["k".repeat(65)]: 1, n: "3" }, done: { a: true, b: false, c: 1 }, doneOn: { a: 20000, b: -1, c: 1.5, d: 1e9 },
    times: [3, 2000, "60", 120], updatedAt: -9, settingsUpdatedAt: NaN, resetAt: "1", progressUpdatedAt: 5 });
  assert.ok(Object.keys(c).every(k => St.KNOWN_KEYS.includes(k)));
  assert.equal("evil" in c, false);
  assert.equal(c.xp, St.LIMITS.XP);
  assert.deepEqual(c.xpLog, { [St.BASE_XP_KEY]: St.LIMITS.XP });
  assert.equal(c.streak, St.LIMITS.COUNT);
  assert.equal(c.last, -1);
  assert.equal(c.day, 4);
  assert.equal(c.dayLessons, 0);
  assert.equal(c.dayXp, 0);
  assert.deepEqual(c.miss, { q: St.LIMITS.COUNT });
  assert.deepEqual(c.done, { a: true, c: true });
  assert.deepEqual(c.doneOn, { a: 20000 });
  assert.deepEqual(c.times, [15, 900, 120]);
  assert.deepEqual([c.updatedAt, c.settingsUpdatedAt, c.resetAt, c.progressUpdatedAt], [0, 0, 0, 5]);
  assert.deepEqual(St.clean(null).done, {});
  assert.deepEqual(St.clean("x").times, []);
});

test("clean caps the number of entries", () => {
  const many = Object.fromEntries(Array.from({ length: St.LIMITS.ENTRIES + 50 }, (_, i) => [`u${i}l0`, true]));
  assert.equal(Object.keys(St.clean({ done: many }).done).length, St.LIMITS.ENTRIES);
  const devices = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`d${i}`, 1]));
  assert.equal(Object.keys(St.clean({ xpLog: devices }).xpLog).length, St.LIMITS.DEVICES);
});

test("XP is a per-device counter; the total is the sum", () => {
  let s = { xp: 40 };
  s = { ...s, ...St.addXp(s, "dA", 10) };
  assert.deepEqual(s.xpLog, { [St.BASE_XP_KEY]: 40, dA: 10 });
  assert.equal(s.xp, 50);
  s = { ...s, ...St.addXp(s, "dB", 5) };
  assert.equal(s.xp, 55);
  assert.equal(St.sumXp({ a: 1, b: 2 }), 3);
  assert.deepEqual(St.xpLogOf({ xp: 0 }), {});
  assert.deepEqual(St.xpLogOf({ xpLog: { a: -5, b: 2.4, c: "x" } }), { a: 0, b: 2 });
});
