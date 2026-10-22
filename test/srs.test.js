const test = require("node:test");
const assert = require("node:assert/strict");
const SRS = require("../srs.js");

const T = 20000, NOW = 1700000000000;
const qs = (id, n) => Array.from({ length: n }, (_, i) => `${id}q${i}`);

test("a lesson enters the schedule due tomorrow, only once", () => {
  const a = SRS.enter({}, "u0l0", T, NOW);
  assert.deepEqual(a.u0l0, { step: 0, due: T + 1, updatedAt: NOW });
  const b = SRS.enter(a, "u0l0", T + 5, NOW + 1);
  assert.equal(b, a);
});

test("old finished lessons migrate to due tomorrow; existing entries are kept", () => {
  const keep = { u1l0: { step: 3, due: T + 9, updatedAt: 1 } };
  const m = SRS.migrate(keep, { u0l0: true, u1l0: true, u2l0: false }, T, NOW);
  assert.deepEqual(m.u0l0, { step: 0, due: T + 1, updatedAt: NOW });
  assert.deepEqual(m.u1l0, keep.u1l0);
  assert.equal(m.u2l0, undefined);
  assert.notEqual(m, keep);
  assert.deepEqual(SRS.migrate(undefined, {}, T, NOW), {});
});

test("due lessons come most overdue first and future ones are left out", () => {
  const srs = { u0l1: { step: 0, due: T }, u0l0: { step: 0, due: T - 3 }, u2l0: { step: 1, due: T + 1 }, u0l2: { step: 0, due: T } };
  assert.deepEqual(SRS.dueIds(srs, T), ["u0l0", "u0l1", "u0l2"]);
  assert.deepEqual(SRS.dueIds(srs, T, id => id !== "u0l1"), ["u0l0", "u0l2"]);
});

test("all right first try moves one step up the ladder 1 -> 3 -> 7 -> 21 -> 60", () => {
  let srs = { u0l0: { step: 0, due: T, updatedAt: 0 } };
  const days = [];
  for (let i = 0; i < 6; i++) {
    srs = SRS.grade(srs, { u0l0q0: true, u0l0q1: true }, T, NOW);
    days.push(srs.u0l0.due - T);
  }
  assert.deepEqual(days, [3, 7, 21, 60, 60, 60]);
  assert.equal(srs.u0l0.updatedAt, NOW);
});

test("any wrong answer resets that lesson to 1 day and leaves other lessons alone", () => {
  const srs = { u0l0: { step: 3, due: T, updatedAt: 0 }, u0l1: { step: 2, due: T, updatedAt: 0 }, u5l0: { step: 1, due: T + 2, updatedAt: 0 } };
  const out = SRS.grade(srs, { u0l0q0: true, u0l0q1: false, u0l1q0: true, u0l1q1: true }, T, NOW);
  assert.deepEqual(out.u0l0, { step: 0, due: T + 1, updatedAt: NOW });
  assert.deepEqual(out.u0l1, { step: 3, due: T + 21, updatedAt: NOW });
  assert.equal(out.u5l0, srs.u5l0);
  assert.equal(srs.u0l0.step, 3); // input untouched
});

test("grading ignores questions from lessons that aren't scheduled", () => {
  const out = SRS.grade({}, { u9l9q0: false, junk: true }, T, NOW);
  assert.deepEqual(out, {});
});

test("review puts missed questions first, caps at 15 and spreads across due lessons", () => {
  const srs = {};
  ["u0l0", "u0l1", "u0l2", "u1l0"].forEach((id, i) => { srs[id] = { step: 0, due: T - i }; });
  srs.u3l0 = { step: 0, due: T + 2 }; // not due
  const bank = { u0l0: qs("u0l0", 8), u0l1: qs("u0l1", 8), u0l2: qs("u0l2", 8), u1l0: qs("u1l0", 8), u3l0: qs("u3l0", 8) };
  const r = SRS.pickReview({ srs, today: T, qsOf: id => bank[id], miss: { u0l1q5: 1, u3l0q0: 4, u0l0q0: 0 } });
  assert.equal(r.qids.length, 15);
  assert.equal(r.qids[0], "u0l1q5");
  assert.ok(!r.qids.some(q => q.startsWith("u3l0")));
  assert.deepEqual(r.qids.slice(1, 5), ["u1l0q0", "u0l2q0", "u0l1q0", "u0l0q0"]); // most overdue first, round robin
  assert.deepEqual(r.lessons, ["u1l0", "u0l2", "u0l1", "u0l0"]);
});

test("lessons that don't make the cut stay out of the graded list", () => {
  const srs = { u0l0: { step: 0, due: T - 1 }, u0l1: { step: 0, due: T } };
  const r = SRS.pickReview({ srs, today: T, qsOf: id => qs(id, 5), miss: {}, cap: 3 });
  assert.deepEqual(r.qids, ["u0l0q0", "u0l1q0", "u0l0q1"]);
  assert.deepEqual(r.lessons, ["u0l0", "u0l1"]);
  const r2 = SRS.pickReview({ srs, today: T, qsOf: id => qs(id, 5), miss: { u0l0q3: 1, u0l0q4: 1 }, cap: 2 });
  assert.deepEqual(r2.lessons, ["u0l0"]);
});

test("nothing due gives an empty review", () => {
  const r = SRS.pickReview({ srs: { u0l0: { step: 0, due: T + 1 } }, today: T, qsOf: id => qs(id, 3), miss: {} });
  assert.deepEqual(r, { qids: [], lessons: [] });
});

test("lessonOf reads the lesson id from a question id", () => {
  assert.equal(SRS.lessonOf("u12l3q10"), "u12l3");
  assert.equal(SRS.lessonOf("bad"), null);
});

test("a lesson moves up only when at least min(2, its question count) were asked, all right", () => {
  const srs = { u0l0: { step: 1, due: T, updatedAt: 0 }, u0l1: { step: 1, due: T, updatedAt: 0 }, u0l2: { step: 2, due: T - 1, updatedAt: 0 } };
  const count = { u0l0: 5, u0l1: 1, u0l2: 2 };
  const r = SRS.gradeDetail(srs, { u0l0q3: true, u0l1q0: true, u0l2q0: true, u0l2q1: true }, T, NOW, id => count[id]);
  assert.deepEqual(r.kept, ["u0l0"]);                 // 1 of 5 asked: not enough evidence
  assert.equal(r.srs.u0l0, srs.u0l0);                 // step, due date and updatedAt unchanged
  assert.deepEqual(r.up.sort(), ["u0l1", "u0l2"]);    // a one-question lesson needs just that one
  assert.deepEqual(r.srs.u0l1, { step: 2, due: T + 7, updatedAt: NOW });
  assert.deepEqual(r.srs.u0l2, { step: 3, due: T + 21, updatedAt: NOW });
  assert.deepEqual(r.back, []);
});

test("a single wrong answer still resets, however few questions were asked", () => {
  const srs = { u0l0: { step: 3, due: T, updatedAt: 0 } };
  const r = SRS.gradeDetail(srs, { u0l0q2: false }, T, NOW, () => 8);
  assert.deepEqual(r.back, ["u0l0"]);
  assert.deepEqual(r.srs.u0l0, { step: 0, due: T + 1, updatedAt: NOW });
});

test("without a question count a lesson needs two questions asked", () => {
  const srs = { u0l0: { step: 0, due: T, updatedAt: 0 } };
  assert.equal(SRS.grade(srs, { u0l0q0: true }, T, NOW).u0l0, srs.u0l0);
  assert.equal(SRS.grade(srs, { u0l0q0: true, u0l0q1: true }, T, NOW).u0l0.step, 1);
  assert.equal(SRS.grade(srs, { u0l0q0: true }, T, NOW, () => 0).u0l0.step, 1); // a count of 0 still needs one
});

test("clean keeps only sane schedule entries", () => {
  const c = SRS.clean({ a: { step: 99, due: 20000, updatedAt: 5 }, b: { step: -2, due: 20001 }, c: { step: 1.5, due: 1 },
    d: { step: 1, due: 1e12 }, e: { step: 1, due: -1 }, f: null, g: 5, ["x".repeat(65)]: { step: 0, due: 1 } });
  assert.deepEqual(c, { a: { step: SRS.LADDER.length - 1, due: 20000, updatedAt: 5 }, b: { step: 0, due: 20001, updatedAt: 0 } });
  assert.deepEqual(SRS.clean([1]), {});
  assert.deepEqual(SRS.clean(null), {});
});
