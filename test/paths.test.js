// Run with: node --test test/paths.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../paths.js");
const Plan = require("../plan.js");
const { loadUnits } = require("../api/_lib/curriculum.js");

const UNITS = loadUnits();
const TITLES = new Set(UNITS.map(u => u.title));
const titlesOf = p => p.steps.map(s => s.title);
const uiOf = t => UNITS.find(u => u.title === t).ui;

test("every unit has an entry in the prerequisite map, and every title in it exists", () => {
  assert.equal(UNITS.length, 53);
  for (const u of UNITS) assert.ok(u.title in P.PREREQS, `missing from PREREQS: ${u.title}`);
  for (const [t, reqs] of Object.entries(P.PREREQS)) {
    assert.ok(TITLES.has(t), `unknown unit: ${t}`);
    reqs.forEach(r => assert.ok(TITLES.has(r), `unknown prerequisite of ${t}: ${r}`));
    assert.ok(!reqs.includes(t), `${t} requires itself`);
  }
});

test("the prerequisite graph has no cycles and orders every unit after what it builds on", () => {
  const order = P.topoOrder(new Set(TITLES), UNITS);
  assert.equal(order.length, UNITS.length);
  const at = new Map(order.map((t, i) => [t, i]));
  for (const [t, reqs] of Object.entries(P.PREREQS)) reqs.forEach(r => assert.ok(at.get(r) < at.get(t), `${r} before ${t}`));
  assert.throws(() => P.topoOrder(new Set(["Start Here", "Python Refresher"]), UNITS,
    { "Start Here": ["Python Refresher"], "Python Refresher": ["Start Here"] }), /cycle/);
});

test("goals are well formed: unique ids, known groups, targets that exist, about 20 of them", () => {
  const ids = P.GOALS.map(g => g.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(P.GOALS.length >= 15 && P.GOALS.length <= 25);
  const groups = new Set(P.GROUPS.map(g => g[0]));
  for (const g of P.GOALS) {
    assert.ok(groups.has(g.subject), g.id);
    assert.ok(g.title && g.blurb && g.targets.length, g.id);
    g.targets.forEach(t => assert.ok(TITLES.has(t), `${g.id}: ${t}`));
  }
});

test("every unit is on the path of at least one goal other than full prep", () => {
  const reached = new Set(P.GOALS.filter(g => g.id !== P.ALL_GOAL).flatMap(g => titlesOf(P.pathFor(UNITS, [g.id]))));
  const missing = [...TITLES].filter(t => !reached.has(t));
  assert.deepEqual(missing, []);
  assert.equal(P.pathFor(UNITS, [P.ALL_GOAL]).steps.length, UNITS.length);
});

test("the CNN goal starts with the basics of Python and ends with the CNN units", () => {
  const p = P.pathFor(UNITS, ["cnn"]);
  assert.deepEqual(titlesOf(p), ["Start Here", "Python Refresher", "Math Primer", "Foundations", "Architectures", "Deep Dive: CNN Internals"]);
  assert.deepEqual(p.steps.filter(s => s.target).map(s => s.title), ["Architectures", "Deep Dive: CNN Internals"]);
  const lessons = p.steps.reduce((a, s) => a + UNITS[s.ui].lessons.length, 0);
  assert.equal(p.lessons, lessons);
  assert.equal(p.remaining, lessons);
  assert.equal(p.minutes, Math.round(lessons * 120 / 60));
  assert.deepEqual(p.included, p.steps.map(s => s.ui));
});

test("ties follow the app's display order, and dependencies beat display order", () => {
  // Python Refresher is shown before Math Primer; Foundations is shown before Math Primer but needs it.
  const t = titlesOf(P.pathFor(UNITS, ["cnn"]));
  assert.ok(t.indexOf("Python Refresher") < t.indexOf("Math Primer"));
  assert.ok(t.indexOf("Math Primer") < t.indexOf("Foundations"));
  const lc = titlesOf(P.pathFor(UNITS, ["leetcode"]));
  assert.deepEqual(lc, ["Start Here", "Python Refresher", "Coding Foundations", "Search and Linked Structures", "Graphs and Backtracking"]);
});

test("skipKnown leaves known units out of the plan but keeps them flagged in the steps", () => {
  const p = P.pathFor(UNITS, ["cnn"], { known: ["Python Refresher", "Start Here"] });
  assert.equal(p.steps.length, 6);
  assert.deepEqual(p.steps.filter(s => s.known).map(s => s.title), ["Start Here", "Python Refresher"]);
  assert.ok(!p.included.includes(uiOf("Python Refresher")));
  assert.equal(p.included[0], uiOf("Math Primer"));
  const all = P.pathFor(UNITS, ["cnn"], { known: ["Python Refresher"], skipKnown: false });
  assert.ok(all.included.includes(uiOf("Python Refresher")));
  assert.equal(all.lessons - p.lessons, UNITS[uiOf("Python Refresher")].lessons.length + 1);
});

test("finished lessons count toward remaining, not toward the path's size", () => {
  const py = UNITS[uiOf("Python Refresher")];
  const done = Object.fromEntries(py.lessons.slice(0, 5).map(l => [l.id, true]));
  const p = P.pathFor(UNITS, ["cnn"], { done, secs: 60 });
  assert.equal(p.lessons - p.remaining, 5);
  assert.equal(p.minutes, p.remaining);
  assert.equal(p.steps.find(s => s.title === "Python Refresher").left, py.lessons.length - 5);
});

test("goals combine without duplicates, in one dependency order", () => {
  const p = P.pathFor(UNITS, ["cnn", "rag", "cnn"]);
  const t = titlesOf(p);
  assert.equal(new Set(t).size, t.length);
  assert.deepEqual(p.goals, ["cnn", "rag"]);
  for (const x of titlesOf(P.pathFor(UNITS, ["cnn"])).concat(titlesOf(P.pathFor(UNITS, ["rag"])))) assert.ok(t.includes(x), x);
  assert.ok(t.indexOf("Architectures") < t.indexOf("Transformers & LLMs"));
  assert.equal(P.pathFor(UNITS, ["mlsd-round", "sd-round"]).steps.filter(s => s.title === "System Design").length, 1);
  assert.deepEqual(P.pathFor(UNITS, ["nope"]).steps, []);
});

test("cleanFocus keeps known goals and titles, caps lengths, and rejects junk", () => {
  assert.equal(P.cleanFocus(null), null);
  assert.equal(P.cleanFocus([1]), null);
  const f = P.cleanFocus({ goals: ["cnn", "cnn", "bogus", 4, "rag", "dp", "rl"], known: ["Python Refresher", "Nope", 3, "Python Refresher"], updatedAt: 7 }, UNITS);
  assert.deepEqual(f, { goals: ["cnn", "rag", "dp"], known: ["Python Refresher"], updatedAt: 7 });
  assert.deepEqual(P.cleanFocus({ updatedAt: -1 }), { goals: [], known: [], updatedAt: 0 });
  assert.equal(P.isActive(P.cleanFocus({ goals: [] })), false);
  assert.equal(P.isActive(f), true);
});

test("focusOrder and focusSkip split the units into the path and the rest", () => {
  const focus = { goals: ["cnn"], known: ["Python Refresher"], updatedAt: 1 };
  const order = P.focusOrder(UNITS, focus);
  assert.deepEqual(order.map(ui => UNITS[ui].title), ["Start Here", "Math Primer", "Foundations", "Architectures", "Deep Dive: CNN Internals"]);
  const skip = P.focusSkip(UNITS, focus);
  assert.equal(skip.length + order.length, UNITS.length);
  assert.ok(order.every(ui => !skip.includes(ui)));
  assert.equal(P.focusOrder(UNITS, { goals: [] }), null);
  assert.equal(P.focusOrder(UNITS, "garbage"), null);
  assert.equal(P.focusSkip(UNITS, null), null);
});

test("a plan over a path covers the path's lessons in path order", () => {
  const order = P.focusOrder(UNITS, { goals: ["cnn"], known: [] });
  const ids = Plan.planOrder(UNITS, [], order);
  assert.equal(ids[0], UNITS[uiOf("Start Here")].lessons[0].id);
  assert.equal(ids[1], UNITS[uiOf("Python Refresher")].lessons[0].id);
  const mathAt = ids.indexOf(UNITS[uiOf("Math Primer")].lessons[0].id), foundAt = ids.indexOf(UNITS[uiOf("Foundations")].lessons[0].id);
  assert.ok(mathAt < foundAt);
  assert.equal(ids.at(-1), UNITS[uiOf("Deep Dive: CNN Internals")].lessons.at(-1).id);
  // Without a path the plan keeps its display order, so Foundations comes before Math Primer as before.
  const plain = Plan.planOrder(UNITS, []);
  assert.ok(plain.indexOf(UNITS[uiOf("Foundations")].lessons[0].id) < plain.indexOf(UNITS[uiOf("Math Primer")].lessons[0].id));
  // Skip still applies on top of a path, and junk indices are ignored.
  assert.ok(!Plan.planOrder(UNITS, [uiOf("Start Here")], [...order, 999, -1]).includes(UNITS[uiOf("Start Here")].lessons[0].id));
});

test("makeFocus and goalsLabel", () => {
  const f = P.makeFocus(["cnn", "rag"], ["Start Here"], 5);
  assert.deepEqual(f, { goals: ["cnn", "rag"], known: ["Start Here"], updatedAt: 5 });
  assert.equal(P.goalsLabel(f), "CNNs & computer vision + RAG systems");
  assert.equal(P.goalsLabel(null), "");
});
