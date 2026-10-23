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
/* Same order as the <script> tags in index.html. */
const CONTENT_FILES = ["../content.js", "../content-code.js", "../content-sd.js", "../content-ml-deep.js", "../content-extra.js"];
const ML_ONLY = loadCurriculum(["../content.js"]);
const FULL = loadCurriculum(CONTENT_FILES);
const UNITS = L.buildUnits(FULL);
const SNAPSHOT = require("./fixtures/content-ids-0bc9f56.json");
const quiet = fn => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };

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

test("subjects: units 16 and 17 are System Design, then coding, SD and ML deep-dive units come from tr", () => {
  assert.equal(UNITS[16].tr, "sd"); assert.equal(UNITS[17].tr, "sd");
  assert.ok(UNITS.slice(0, 16).every(u => u.tr === "ml"));
  assert.ok(UNITS.slice(18, 22).every(u => u.tr === "code"));
  assert.ok(UNITS.slice(22, 38).every(u => u.tr === "sd"));
  assert.ok(UNITS.slice(38).every(u => u.tr === "ml" && u.title.startsWith("Deep Dive:")));
  assert.equal(L.subjectOf({ tr: "nonsense" }, 2), "ml");
});

test("unitsFor filters by subject and numbers units within the subject in display order", () => {
  const sd = L.unitsFor(UNITS, "sd"), code = L.unitsFor(UNITS, "code"), ml = L.unitsFor(UNITS, "ml");
  assert.deepEqual(sd.map(u => u.ui), [16, 17, ...Array.from({ length: 16 }, (_, i) => 22 + i)]);
  assert.deepEqual(sd.map(u => u.num), Array.from({ length: 18 }, (_, i) => i + 1));
  assert.deepEqual(code.map(u => u.num), [1, 2, 3, 4]);
  assert.equal(code[0].ui, 18);
  assert.deepEqual(ml.map(u => u.num), Array.from({ length: 31 }, (_, i) => i + 1));
  assert.equal(sd.length + code.length + ml.length, UNITS.length);
});

test("every content file loads and appends its units", () => {
  const expect = [["../content.js", 18], ["../content-code.js", 4], ["../content-sd.js", 16], ["../content-ml-deep.js", 15]];
  let n = 0;
  expect.forEach(([f, add], i) => {
    const c = loadCurriculum(CONTENT_FILES.slice(0, i + 1));
    assert.ok(Array.isArray(c), f);
    assert.equal(c.length - n, add, f);
    n = c.length;
  });
  assert.equal(FULL.length, 53);
});

test("unit and lesson totals per subject", () => {
  const totals = Object.fromEntries(L.SUBJECTS.map(([id]) => {
    const us = L.unitsFor(UNITS, id);
    return [id, [us.length, us.reduce((a, u) => a + u.lessons.length, 0)]];
  }));
  assert.deepEqual(totals, { ml: [16 + 15, 135 + 106], code: [4, 19], sd: [2 + 16, 22 + 116] });
  assert.equal(FULL.slice(22, 38).reduce((a, u) => a + u.ls.length, 0), 116);
  assert.equal(FULL.slice(38).reduce((a, u) => a + u.ls.length, 0), 106);
});

test("content.js lesson and question ids from commit 0bc9f56 are all still there", () => {
  assert.equal(SNAPSHOT.units.length, 18);
  SNAPSHOT.units.forEach(su => {
    const u = UNITS[su.ui];
    assert.equal(u.title, su.title, `unit ${su.ui}`);
    assert.ok(u.lessons.length >= su.lessons.length, `unit ${su.ui} lost lessons`);
    su.lessons.forEach((sl, li) => {
      const l = u.lessons[li];
      assert.equal(l.id, sl.id);
      assert.equal(l.title, sl.title, sl.id);
      const ids = new Set(l.qs.map(q => q.id));
      for (let qi = 0; qi < sl.questions; qi++) assert.ok(ids.has(`${sl.id}q${qi}`), `${sl.id}q${qi}`);
    });
  });
});

test("no lesson ends up with zero valid questions", () => {
  UNITS.forEach(u => u.lessons.forEach(l => assert.ok(l.qs.length > 0, `${l.id} ${u.title} / ${l.title}`)));
});

test("every typed question passes normQ", () => {
  let typed = 0;
  FULL.forEach((u, ui) => u.ls.forEach((l, li) => l[2].forEach((q, qi) => {
    if (Array.isArray(q)) return;
    typed++;
    assert.ok(quiet(() => L.normQ(q, `u${ui}l${li}q${qi}`)), `u${ui}l${li}q${qi} (${u.t} / ${l[0]})`);
  })));
  assert.ok(typed > 40, `only ${typed} typed questions`);
});

test("display order: each placed unit follows its base, with only units placed after that base in between", () => {
  const ml = L.unitsFor(UNITS, "ml").map(u => u.title);
  const descends = (t, base) => { for (let b = L.UNIT_AFTER[t]; b; b = L.UNIT_AFTER[b]) if (b === base) return true; return false; };
  const after = (deep, base) => {
    const i = ml.indexOf(deep), b = ml.indexOf(base);
    assert.ok(b >= 0 && i > b, `${deep} after ${base}`);
    assert.ok(ml.slice(b + 1, i).every(t => descends(t, base)), `${deep} directly after ${base} and what follows it`);
  };
  after("Deep Dive: Backprop", "Deep Dive: CNN Internals");
  after("Deep Dive: Attention & Transformers", "Transformers & LLMs");
  after("Deep Dive: RL Foundations", "Reinforcement Learning");
  Object.entries(L.UNIT_AFTER).forEach(([deep, base]) => after(deep, base));
  assert.deepEqual(ml.slice(0, 11), ["Start Here", "Python Refresher", "Math Primer", "Foundations", "Deep Dive: Probability & Stats",
    "Deep Dive: Evaluation Metrics", "Architectures", "Deep Dive: CNN Internals", "Deep Dive: Backprop", "Deep Dive: Optimizers",
    "Deep Dive: Regularization"]);
  assert.equal(ml[ml.length - 1], "Practical ML Engineering");
  assert.equal(ml.filter(t => t.startsWith("Deep Dive:")).length, 15);
});

test("display order never changes unit indices or ids", () => {
  UNITS.forEach((u, ui) => {
    assert.equal(u.ui, ui);
    assert.equal(u.title, FULL[ui].t);
    u.lessons.forEach((l, li) => assert.equal(l.id, `u${ui}l${li}`));
  });
  assert.deepEqual(UNITS.map(u => u.pos).sort((a, b) => a - b), UNITS.map((_, i) => i));
});

test("displayOrder keeps index order without a mapping and ignores bad mappings", () => {
  const us = [["A", "ml"], ["B", "ml"], ["C", "sd"], ["D", "ml"], ["E", "ml"]].map(([title, tr], ui) => ({ ui, title, tr }));
  assert.deepEqual(L.displayOrder(us, {}).map(u => u.title), ["A", "B", "C", "D", "E"]);
  assert.deepEqual(L.displayOrder(us, { E: "A", D: "A" }).map(u => u.title), ["A", "D", "E", "B", "C"]);
  // a missing base, a base in another subject and a unit naming itself all keep index order
  assert.deepEqual(L.displayOrder(us, { E: "Nope", D: "C", B: "B" }).map(u => u.title), ["A", "B", "C", "D", "E"]);
  // chains: E follows D, which follows A
  assert.deepEqual(L.displayOrder(us, { E: "D", D: "A" }).map(u => u.title), ["A", "D", "E", "B", "C"]);
  // a cycle keeps index order for the units in it
  assert.deepEqual(L.displayOrder(us, { E: "D", D: "E", B: "A" }).map(u => u.title), ["A", "B", "C", "D", "E"]);
});

test("the study plan follows display order", () => {
  const Plan = require("../plan.js");
  const order = Plan.planOrder(UNITS, []);
  const byPos = UNITS.slice().sort((a, b) => a.pos - b.pos).flatMap(u => u.lessons.map(l => l.id));
  assert.deepEqual(order, byPos);
  assert.equal(order.indexOf("u39l0"), order.indexOf("u43l4") + 1, "Deep Dive: Backprop starts right after Deep Dive: CNN Internals");
  assert.equal(order.indexOf("u3l0"), order.indexOf("u1l19") + 1, "Math Primer starts right after Python Refresher");
  assert.ok(!Plan.planOrder(UNITS, [39]).includes("u39l0"));
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
