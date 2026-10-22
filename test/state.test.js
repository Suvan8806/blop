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
