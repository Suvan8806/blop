// Per-lesson time estimates (estimate.js), the pace samples kept in S.pace (state.js, merge.js) and path totals (paths.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../estimate.js");
const St = require("../state.js");
const Merge = require("../merge.js");
const Paths = require("../paths.js");
const { loadUnits } = require("../api/_lib/curriculum.js");

const words = n => Array.from({ length: n }, () => "word").join(" ");
const lesson = (n, types) => ({ teach: words(n), qs: types.map(type => ({ type })) });

test("reading at 200 wpm plus a time per question type plus 10 s overhead", () => {
  assert.equal(E.lessonSecs(lesson(200, [])), 70);                         // 60 s reading + 10
  assert.equal(E.lessonSecs(lesson(100, ["mc", "gap"])), 30 + 15 + 15 + 10);
  assert.equal(E.lessonSecs(lesson(0, ["order", "match"])), 30 + 40 + 10);
  assert.equal(E.lessonSecs(lesson(0, ["typed", undefined])), 30 + 30 + 10, "other and typed types take 30 s");
  assert.equal(E.lessonSecs({}), 10);
  assert.equal(E.lessonSecs(null), 10);
});

test("the pace ratio scales the estimate, clamped to 0.5x-2.5x", () => {
  const l = lesson(200, ["mc", "mc"]); // 100 s
  assert.equal(E.lessonSecs(l, 1.5), 150);
  assert.equal(E.lessonSecs(l, 0.1), 50);
  assert.equal(E.lessonSecs(l, 9), 250);
  assert.equal(E.lessonSecs(l, NaN), 100);
  assert.equal(E.lessonSecs(l, 0), 100);
});

test("paceRatio needs 5 samples, then takes the median, clamped", () => {
  assert.equal(E.paceRatio([]), 1);
  assert.equal(E.paceRatio([200, 200, 200, 200]), 1);
  assert.equal(E.paceRatio([100, 120, 150, 300, 90]), 1.2);
  assert.equal(E.paceRatio([100, 120, 150, 300, 90, 160]), 1.35);
  assert.equal(E.paceRatio([900, 900, 900, 900, 900]), 2.5);
  assert.equal(E.paceRatio([10, 10, 10, 10, 10]), 0.5);
  assert.equal(E.paceRatio(null), 1);
  assert.equal(E.paceRatio([100, "x", -5, 100, 100, 100]), 1, "bad entries are ignored");
});

test("a pace sample is actual / unscaled estimate in whole percent, bounded", () => {
  const l = lesson(200, ["mc", "mc"]); // 100 s
  assert.equal(E.paceSample(150, l), 150);
  assert.equal(E.paceSample(1, l), 10);
  assert.equal(E.paceSample(100000, l), 1000);
  assert.deepEqual(E.addSample([1, 2], 3), [1, 2, 3]);
  assert.equal(E.addSample(Array(20).fill(100), 50).length, 20);
  assert.equal(E.addSample(Array(20).fill(100), 50).at(-1), 50);
  assert.deepEqual(E.addSample(undefined, 80), [80]);
});

test("labels round to whole minutes, at least ~1 min, hours past an hour", () => {
  assert.equal(E.label(20), "~1 min");
  assert.equal(E.label(89), "~1 min");
  assert.equal(E.label(90), "~2 min");
  assert.equal(E.label(150), "~3 min");
  assert.equal(E.label(59 * 60), "~59 min");
  assert.equal(E.label(90 * 60), "~1.5 h");
  assert.equal(E.totalSecs([lesson(200, []), lesson(0, ["mc"])]), 70 + 25);
});

test("every real lesson estimates between ~1 and ~6 minutes", () => {
  const all = loadUnits().flatMap(u => u.lessons);
  assert.ok(all.length > 300);
  for (const l of all) {
    const s = E.lessonSecs(l);
    assert.ok(s >= 30 && s <= 360, `${l.id}: ${s}s`);
  }
});

test("S.pace is a known, cleaned, reset and merged progress field", () => {
  assert.ok(St.KNOWN_KEYS.includes("pace"));
  assert.deepEqual(St.clean({ pace: [100, 5, 5000, "x", 123.4] }).pace, [100, 10, 1000, 123]);
  assert.deepEqual(St.clean({}).pace, []);
  assert.equal(St.clean({ pace: Array(30).fill(100) }).pace.length, 20);
  assert.deepEqual(St.resetProgress({ pace: [100] }, 5).pace, []);
  const m = Merge.merge({ pace: [100, 120], updatedAt: 2 }, { pace: [100, 150], updatedAt: 1 }, 10);
  assert.deepEqual(m.pace, [100, 120, 150]);
});

test("path totals add up each lesson's own estimate when given secsOf", () => {
  const units = loadUnits();
  const goal = Paths.GOALS[0].id;
  const flat = Paths.pathFor(units, [goal], { secs: 120 });
  assert.equal(flat.minutes, Math.round(flat.remaining * 2));
  const est = Paths.pathFor(units, [goal], { secsOf: l => E.lessonSecs(l) });
  const lessons = est.included.flatMap(ui => units[ui].lessons);
  assert.equal(est.secs, E.totalSecs(lessons));
  assert.equal(est.minutes, Math.round(est.secs / 60));
  const scaled = Paths.pathFor(units, [goal], { secsOf: l => E.lessonSecs(l, 2) });
  assert.ok(scaled.minutes > est.minutes);
});
