// Run with: node --test test/plan.test.js test/content.test.js test/srs.test.js test/jobs.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../logic.js");

/* Load the shipped content files the way index.html does, in a fake window. */
function loadCurriculum(files) {
  const prev = global.window;
  global.window = { CURRICULUM: undefined };
  for (const f of files) { delete require.cache[require.resolve(f)]; require(f); }
  const c = global.window.CURRICULUM;
  global.window = prev;
  return c;
}
const ML_ONLY = loadCurriculum(["../content.js"]);
const FULL = loadCurriculum(["../content.js", "../content-code.js", "../content-extra.js"]);
const UNITS = L.buildUnits(FULL);

test("old array questions normalise to multiple choice with the first option correct", () => {
  const q = L.normQ(["Pick one", ["right", "wrong"], "because"], "u0l0q0");
  assert.deepEqual(q, { id: "u0l0q0", type: "mc", p: "Pick one", opts: ["right", "wrong"], ok: "right", why: "because" });
  assert.equal(L.normQ(["No why", ["a", "b"]], "x").why, "");
});

test("gap, order and match objects normalise", () => {
  const gap = L.normQ({ type: "gap", p: "Use a ___ here", opts: ["set", "list"], why: "w" }, "g");
  assert.equal(gap.type, "gap"); assert.equal(gap.ok, "set");
  const ord = L.normQ({ type: "order", p: "Order", items: ["a", "b", "c"] }, "o");
  assert.deepEqual(ord.items, ["a", "b", "c"]); assert.equal(ord.why, "");
  const four = [["t1", "d1"], ["t2", "d2"], ["t3", "d3"], ["t4", "d4"]];
  const m = L.normQ({ type: "match", p: "M", pairs: four }, "m");
  assert.deepEqual(m.pairs, four);
});

test("malformed questions become null instead of crashing", () => {
  assert.equal(L.normQ({ type: "gap", p: "no blank", opts: ["a", "b"] }, "x"), null);
  assert.equal(L.normQ({ type: "gap", p: "two ___ blanks ___", opts: ["a", "b"] }, "x"), null);
  assert.equal(L.normQ({ type: "order", p: "x", items: ["only"] }, "x"), null);
  assert.equal(L.normQ({ type: "match", p: "x", pairs: [["a"]] }, "x"), null);
  assert.equal(L.normQ({ type: "mystery" }, "x"), null);
  assert.equal(L.normQ(null, "x"), null);
  assert.equal(L.normQ(["p", []], "x"), null);
});

test("a dropped question doesn't shift the ids after it", () => {
  const l = L.normLesson(["T", "teach", [["a", ["1", "2"]], { type: "bogus" }, ["c", ["1", "2"]]]], 3, 4);
  assert.deepEqual(l.qs.map(q => q.id), ["u3l4q0", "u3l4q2"]);
  assert.deepEqual(l.problems, []);
});

test("lesson problems come from the optional 4th element", () => {
  const l = L.normLesson(["T", "t", [["q", ["a", "b"]]], { problems: ["Two Sum", "3Sum"] }], 18, 1);
  assert.deepEqual(l.problems, ["Two Sum", "3Sum"]);
});

test("every shipped question normalises, none are dropped", () => {
  FULL.forEach((u, ui) => u.ls.forEach((l, li) => {
    assert.equal(L.normLesson(l, ui, li).qs.length, l[2].length, `${u.t} / ${l[0]}`);
  }));
});

test("existing ML units, lessons and question ids are unchanged", () => {
  ML_ONLY.forEach((u, ui) => {
    assert.equal(UNITS[ui].title, u.t);
    u.ls.forEach((l, li) => {
      const now = UNITS[ui].lessons[li];
      assert.equal(now.id, `u${ui}l${li}`);
      assert.equal(now.title, l[0]);
      l[2].forEach((q, qi) => assert.equal(now.qs[qi].p, q[0], now.qs[qi].id));
    });
  });
});

test("extra SD questions are appended with new ids, one of each type per SD unit", () => {
  for (const ui of [16, 17]) {
    const extra = UNITS[ui].lessons.flatMap(l => l.qs.slice(ML_ONLY[ui].ls[l.li][2].length));
    assert.deepEqual(extra.map(q => q.type).sort(), ["gap", "match", "order"]);
  }
  assert.equal(UNITS[16].lessons[0].qs[3].id, "u16l0q3");
  assert.equal(UNITS[16].lessons[0].qs[3].type, "order");
});

test("subjects: units 16 and 17 are System Design, coding units come from tr, the rest are ML", () => {
  assert.equal(UNITS[16].tr, "sd"); assert.equal(UNITS[17].tr, "sd");
  assert.ok(UNITS.slice(0, 16).every(u => u.tr === "ml"));
  assert.ok(UNITS.slice(18).every(u => u.tr === "code"));
  assert.equal(L.subjectOf({ tr: "nonsense" }, 2), "ml");
});

test("unitsFor filters by subject and numbers units within the subject", () => {
  const sd = L.unitsFor(UNITS, "sd"), code = L.unitsFor(UNITS, "code"), ml = L.unitsFor(UNITS, "ml");
  assert.deepEqual(sd.map(u => [u.ui, u.num]), [[16, 1], [17, 2]]);
  assert.deepEqual(code.map(u => u.num), [1, 2, 3, 4]);
  assert.equal(code[0].ui, 18);
  assert.equal(ml.length, 16);
  assert.equal(ml[15].num, 16);
  assert.equal(sd.length + code.length + ml.length, UNITS.length);
});

test("unit hues still follow the global unit index", () => {
  UNITS.forEach((u, ui) => assert.equal(u.hue, L.HUES[ui % L.HUES.length]));
});

test("validSubject falls back to ML for old or bad saved values", () => {
  assert.equal(L.validSubject(undefined), "ml");
  assert.equal(L.validSubject("code"), "code");
  assert.equal(L.validSubject("track"), "ml");
  assert.equal(L.subjectName("sd"), "System Design");
});

test("checkChoice compares against the correct option", () => {
  const q = L.normQ({ type: "gap", p: "a ___ b", opts: ["yes", "no"] }, "x");
  assert.equal(L.checkChoice(q, "yes"), true);
  assert.equal(L.checkChoice(q, "no"), false);
});

test("checkOrder needs every item in the given order", () => {
  const q = L.normQ({ type: "order", p: "x", items: ["a", "b", "c"] }, "x");
  assert.equal(L.checkOrder(q, [0, 1, 2]), true);
  assert.equal(L.checkOrder(q, [1, 0, 2]), false);
  assert.equal(L.checkOrder(q, [0, 1]), false);
  assert.deepEqual(L.orderMarks(q, [1, 0, 2]), [false, false, true]);
});

test("checkOrder accepts swapped duplicates", () => {
  const q = L.normQ({ type: "order", p: "x", items: ["push", "push", "pop"] }, "x");
  assert.equal(L.checkOrder(q, [1, 0, 2]), true);
});

test("checkPair matches a term to its own definition", () => {
  const q = L.normQ({ type: "match", p: "x", pairs: [["t0", "d0"], ["t1", "d1"], ["t2", "d2"], ["t3", "d3"]] }, "x");
  assert.equal(L.checkPair(q, 2, 2), true);
  assert.equal(L.checkPair(q, 2, 3), false);
  assert.equal(L.checkPair(q, 9, 9), false);
});

test("answerText lists the correct answer for every type", () => {
  assert.equal(L.answerText(L.normQ(["p", ["ok", "no"]], "x")), "ok");
  assert.equal(L.answerText(L.normQ({ type: "order", p: "x", items: ["a", "b"] }, "x")), "1. a\n2. b");
  assert.equal(L.answerText(L.normQ({ type: "match", p: "x", pairs: [["t", "d"], ["u", "e"], ["v", "f"], ["w", "g"]] }, "x")), "t: d\nu: e\nv: f\nw: g");
});

test("match needs exactly 4 pairs and order 2-6 items, so keys always cover them", () => {
  const pairs = n => Array.from({ length: n }, (_, i) => [`t${i}`, `d${i}`]);
  assert.equal(L.normQ({ type: "match", p: "M", pairs: pairs(3) }, "m"), null);
  assert.equal(L.normQ({ type: "match", p: "M", pairs: pairs(5) }, "m"), null);
  assert.ok(L.normQ({ type: "match", p: "M", pairs: pairs(4) }, "m"));
  const items = n => Array.from({ length: n }, (_, i) => `s${i}`);
  assert.equal(L.normQ({ type: "order", p: "O", items: items(7) }, "o"), null);
  assert.ok(L.normQ({ type: "order", p: "O", items: items(6) }, "o"));
  assert.ok(L.normQ({ type: "order", p: "O", items: items(2) }, "o"));
});

test("checkPair compares text, so a repeated term matches either of its definitions", () => {
  const q = L.normQ({ type: "match", p: "M", pairs: [["A", "1"], ["A", "2"], ["B", "3"], ["C", "4"]] }, "m");
  assert.equal(L.checkPair(q, 0, 1), true);  // term "A" with definition "2"
  assert.equal(L.checkPair(q, 1, 0), true);
  assert.equal(L.checkPair(q, 2, 0), false);
  assert.equal(L.checkPair(q, 9, 0), false);
});

test("a lesson whose questions are all malformed has no questions and is reported", () => {
  const warn = console.warn, seen = [];
  console.warn = m => seen.push(m);
  try {
    const l = L.normLesson(["T", "teach", [{ type: "match", p: "x", pairs: [["a", "b"]] }]], 0, 0);
    assert.equal(l.qs.length, 0);
    assert.ok(seen.some(m => /u0l0q0/.test(m)) && seen.some(m => /no valid questions/.test(m)));
  } finally { console.warn = warn; }
});
