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

test("ties follow the app's display order", () => {
  // Python Refresher is shown before Math Primer, which Foundations needs.
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
  assert.deepEqual(f, { goals: ["cnn", "rag", "dp"], known: ["Python Refresher"], deep: true, track: null, updatedAt: 7 });
  assert.deepEqual(P.cleanFocus({ updatedAt: -1 }), { goals: [], known: [], deep: true, track: null, updatedAt: 0 });
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
  // Without a path the plan keeps display order, which puts Deep Dive: Probability & Stats before Architectures.
  const plain = Plan.planOrder(UNITS, []);
  assert.ok(plain.indexOf(UNITS[uiOf("Deep Dive: Probability & Stats")].lessons[0].id) < plain.indexOf(UNITS[uiOf("Architectures")].lessons[0].id));
  // Skip still applies on top of a path, and junk indices are ignored.
  assert.ok(!Plan.planOrder(UNITS, [uiOf("Start Here")], [...order, 999, -1]).includes(UNITS[uiOf("Start Here")].lessons[0].id));
});

test("makeFocus and goalsLabel", () => {
  const f = P.makeFocus(["cnn", "rag"], ["Start Here"], 5);
  assert.deepEqual(f, { goals: ["cnn", "rag"], known: ["Start Here"], deep: true, track: null, updatedAt: 5 });
  assert.equal(P.goalsLabel(f), "CNNs & computer vision + RAG systems");
  assert.equal(P.goalsLabel(null), "");
});

/* ---------- display order vs the prerequisite graph ---------- */
const L = require("../logic.js");

test("each subject's display order is a valid topological order of the prerequisite graph", () => {
  for (const [sub] of L.SUBJECTS) {
    const order = L.unitsFor(UNITS, sub).map(u => u.title), at = new Map(order.map((t, i) => [t, i]));
    for (const t of order) {
      // Cross-subject prerequisites (Coding needs Python, ML System Design needs Foundations) live in another tab.
      (P.PREREQS[t] || []).filter(r => at.has(r)).forEach(r => assert.ok(at.get(r) < at.get(t), `${sub}: ${r} is shown before ${t}`));
    }
  }
});

/* Key concepts and the lesson that teaches each. No lesson in the same subject may use one earlier in display order. */
const CONCEPTS = [
  ["chain rule", /chain rule/i, "ml", "The Chain Rule"],
  ["derivative", /\bderivative/i, "ml", "Derivative as Slope"],
  ["ReLU", /\bReLU\b/, "ml", "Activation Functions"],
  ["softmax", /softmax/i, "ml", "From Line to Probability"],
  ["PPO", /\bPPO\b/, "ml", "Policy Gradients & PPO"]
];
const textOf = l => [l.title, l.teach, JSON.stringify(l.qs)].join(" ");
test("no lesson uses a key concept before the lesson that teaches it", () => {
  for (const [name, re, sub, teacher] of CONCEPTS) {
    const lessons = L.unitsFor(UNITS, sub).flatMap(u => u.lessons);
    const teach = lessons.findIndex(l => l.title === teacher);
    assert.ok(teach >= 0, `teaching lesson for ${name} exists`);
    const first = lessons.findIndex(l => re.test(textOf(l)));
    assert.ok(first >= teach, `${name} is used in "${lessons[first] && lessons[first].title}" before "${teacher}" teaches it`);
  }
});
/* Concepts the content uses but never teaches yet (content work, listed in the teaching audit). */
test.todo("logits are defined before Calibration (Deep Dive: Evaluation Metrics) uses them");
test.todo("recursion and memoisation get a lesson before Trees with DFS");

/* ---------- Go deeper: core-only paths ---------- */
const isDeepT = t => t.startsWith("Deep Dive:");
const coreGoals = P.GOALS.filter(g => !g.deepGoal);

test("isDeep and shortTitle know the 15 deep dives", () => {
  assert.equal(UNITS.filter(u => P.isDeep(u.title)).length, 15);
  assert.equal(P.isDeep("Architectures"), false);
  assert.equal(P.shortTitle("Deep Dive: Backprop"), "Backprop");
  assert.equal(P.shortTitle("Foundations"), "Foundations");
});

test("core-only paths (deep: false) never hold a deep dive, and keep every core unit of the full path", () => {
  for (const g of coreGoals) {
    const full = P.pathFor(UNITS, [g.id]), core = P.pathFor(UNITS, [g.id], { deep: false });
    assert.deepEqual(titlesOf(core).filter(isDeepT), [], g.id);
    // Core units in the same order as the full path, every core target kept; a core unit only a deep dive needs
    // (Reinforcement Learning, for Post-training) leaves with it.
    const fullTitles = titlesOf(full);
    assert.deepEqual(titlesOf(core), fullTitles.filter(t => titlesOf(core).includes(t)), `${g.id}: same order`);
    g.targets.filter(t => !isDeepT(t)).forEach(t => assert.ok(titlesOf(core).includes(t), `${g.id} keeps ${t}`));
    assert.deepEqual(core.deepExtra.map(x => x.title), fullTitles.filter(t => !titlesOf(core).includes(t)), `${g.id}: deepExtra is what Go deeper adds`);
    assert.ok(core.deepExtra.filter(x => !isDeepT(x.title)).every(x => fullTitles.some(t => isDeepT(t) && (P.PREREQS[t] || []).includes(x.title))), g.id);
    assert.equal(core.deep, false);
    assert.equal(full.deep, true);
  }
  // Everything, core only: all 38 core units.
  assert.equal(P.pathFor(UNITS, [P.ALL_GOAL], { deep: false }).steps.length, 38);
});

test("measured core-only sizes (UX_SIMPLIFY 2.5, with the curriculum review's prerequisite map)", () => {
  const size = (id, deep) => P.pathFor(UNITS, [id], { deep }).lessons;
  const expect = { nn: [81, 65], cnn: [70, 65], transformers: [98, 84], classical: [73, 59], rl: [60, 52], mlops: [60, 55], all: [398, 292] };
  for (const [id, [full, core]] of Object.entries(expect)) {
    assert.equal(size(id, true), full, `${id} full`);
    assert.equal(size(id, false), core, `${id} core`);
  }
  // Coding and system design have no deep dives, so nothing changes and Go deeper has nothing to add.
  for (const id of ["leetcode", "dp", "sd-round", "distsys"]) {
    assert.equal(size(id, false), size(id, true), id);
    assert.deepEqual(P.pathFor(UNITS, [id], { deep: false }).deepExtra, [], id);
  }
});

test("deep-only goals (probstats, llm-efficiency) keep their own units with Go deeper off", () => {
  const deepGoals = P.GOALS.filter(g => g.deepGoal).map(g => g.id).sort();
  assert.deepEqual(deepGoals, ["llm-efficiency", "probstats"]);
  assert.deepEqual([...P.DEEP_TOPICS].sort(), deepGoals);
  for (const id of deepGoals) {
    const g = P.goalById(id), core = P.pathFor(UNITS, [id], { deep: false });
    assert.ok(core.steps.length > 0, id);
    g.targets.forEach(t => assert.ok(titlesOf(core).includes(t), `${id} keeps ${t}`));
    assert.deepEqual(titlesOf(core), titlesOf(P.pathFor(UNITS, [id])), `${id}: same path either way`);
  }
  // Combined with a core goal, only the deep-only goal's deep dives come along.
  const mix = titlesOf(P.pathFor(UNITS, ["probstats", "transformers"], { deep: false }));
  assert.ok(mix.includes("Deep Dive: Information Theory"));
  assert.ok(!mix.includes("Deep Dive: Attention & Transformers"));
});

test("a focus saved before Go deeper reads as deep: its path, plan order and skip list are unchanged", () => {
  const old = { goals: ["transformers", "rag"], known: ["Python Refresher"], updatedAt: 3 };
  assert.equal(P.cleanFocus(old, UNITS).deep, true);
  assert.deepEqual(P.focusOrder(UNITS, old), P.focusOrder(UNITS, { ...old, deep: true }));
  assert.deepEqual(P.focusOrder(UNITS, old), P.pathFor(UNITS, old.goals, { known: old.known }).included);
  const off = P.focusOrder(UNITS, { ...old, deep: false });
  assert.ok(off.length < P.focusOrder(UNITS, old).length);
  assert.ok(off.every(ui => !P.isDeep(UNITS[ui].title)));
  assert.equal(P.focusSkip(UNITS, { ...old, deep: false }).length, UNITS.length - off.length);
});

test("makeFocus, withFocus and cleanFocus handle deep and track", () => {
  assert.deepEqual(P.makeFocus(["rag"], [], 5, { deep: false, track: "llm" }), { goals: ["rag"], known: [], deep: false, track: "llm", updatedAt: 5 });
  assert.equal(P.makeFocus(["rag"], [], 5, { track: "bogus" }).track, null);
  assert.equal(P.cleanFocus({ goals: ["rag"], deep: "yes" }).deep, true);
  const f = P.makeFocus(["rag"], ["Start Here"], 5, { deep: false, track: "llm" });
  const g = P.withFocus(f, { deep: true }, 9);
  assert.deepEqual(g, { ...f, deep: true, updatedAt: 9 });
  assert.equal(f.deep, false, "withFocus returns a new object");
  assert.deepEqual(P.withFocus(null, { goals: ["dp"] }, 4), { goals: ["dp"], known: [], deep: false, track: null, updatedAt: 4 });
});

test("tracks: presets and topics are real goals, presets fit MAX_GOALS, labels and lookups work", () => {
  assert.deepEqual(P.TRACKS.map(t => t.id), ["ml", "llm", "code", "sd", "essentials"]);
  assert.deepEqual(require("../state.js").FOCUS_TRACKS, P.TRACKS.map(t => t.id));
  for (const t of P.TRACKS) {
    assert.ok(t.title && t.blurb, t.id);
    assert.ok(t.preset.length >= 1 && t.preset.length <= P.MAX_GOALS, t.id);
    [...t.preset, ...t.topics].forEach(id => assert.ok(P.goalById(id), `${t.id}: ${id}`));
    t.preset.filter(id => id !== "essentials").forEach(id => assert.ok(t.topics.includes(id), `${t.id} offers its preset ${id}`));
    assert.ok(P.pathFor(UNITS, t.preset, { deep: false }).included.length > 0, t.id);
  }
  assert.equal(P.focusLabel({ goals: ["transformers", "rag"], track: "llm" }), "AI / LLM engineer");
  assert.equal(P.focusLabel({ goals: ["transformers"], track: "llm" }), "Transformers & LLMs");
  assert.equal(P.focusLabel({ goals: ["essentials"], track: "essentials" }), "The essentials");
  assert.equal(P.trackFor(["leetcode", "dp"]), "code");
  assert.equal(P.trackFor(["cnn", "rag"]), null);
  assert.equal(P.trackFor([]), null);
  const ess = titlesOf(P.pathFor(UNITS, ["essentials"], { deep: false }));
  ["Foundations", "Coding Foundations", "System Design"].forEach(t => assert.ok(ess.includes(t), t));
});

test("skip chips: basics units on the path only, at most 3; a chip marks a unit known", () => {
  const llm = P.pathFor(UNITS, ["transformers", "rag"], { deep: false });
  assert.deepEqual(P.basicsChips(llm).map(c => c[0]), ["Python", "Math basics", "ML basics"]);
  assert.deepEqual(P.basicsChips(P.pathFor(UNITS, ["sd-round"])).map(c => c[0]), ["System design basics"]);
  assert.deepEqual(P.basicsChips(null), []);
  const skipped = P.pathFor(UNITS, ["transformers", "rag"], { deep: false, known: ["Python Refresher"] });
  assert.equal(llm.lessons - skipped.lessons, UNITS[uiOf("Python Refresher")].lessons.length);
  assert.ok(P.basicsChips(skipped).some(c => c[1] === "Python Refresher"), "a pressed chip stays visible");
});

test("relatedDeep: Go deeper's units first, then deep dives whose prerequisites are all on the core path", () => {
  const core = P.pathFor(UNITS, ["transformers"], { deep: false });
  const rel = P.relatedDeep(UNITS, core);
  assert.deepEqual(rel.slice(0, core.deepExtra.length).map(x => x.title), core.deepExtra.map(x => x.title));
  assert.ok(rel.every(x => P.isDeep(x.title) && !x.added));
  assert.ok(rel.some(x => x.title === "Deep Dive: Backprop"));
  assert.ok(!rel.some(x => x.title === "Deep Dive: Information Theory"), "needs Prob & Stats, which isn't core");
  const on = P.relatedDeep(UNITS, P.pathFor(UNITS, ["transformers"], { deep: true }));
  assert.deepEqual(on.filter(x => x.added).map(x => x.title), core.deepExtra.map(x => x.title));
  assert.deepEqual(P.relatedDeep(UNITS, P.pathFor(UNITS, ["sd-round"])), []);
});

test("time a day -> lessons a day, and the plan headline", () => {
  assert.equal(P.perDayFor(10, 120), 5);
  assert.equal(P.perDayFor(5, 120), 3); // 2.5 rounds up
  assert.equal(P.perDayFor(20, 120), 10);
  assert.equal(P.perDayFor(10, 70), 9);
  assert.equal(P.perDayFor(5, 900), 1, "never less than one");
  assert.equal(P.perDayFor(10, 0), 5, "bad seconds fall back to 2 min");
  const p = P.pathFor(UNITS, ["leetcode"], { secs: 120 });
  assert.deepEqual(P.summary(p, 5), { units: 5, minutes: 72, days: Math.ceil(36 / 5) });
  assert.equal(P.summary({ ...p, remaining: 0 }, 5).days, 0);
  assert.equal(P.hoursText(20), "~20 min");
  assert.equal(P.hoursText(60), "~1 hour");
  assert.equal(P.hoursText(152), "~2½ hours");
  assert.equal(P.hoursText(180), "~3 hours");
  assert.equal(P.durationText(1), "1 day");
  assert.equal(P.durationText(9), "9 days");
  assert.equal(P.durationText(18), "about 2½ weeks");
  assert.equal(P.durationText(28), "about 4 weeks");
  assert.equal(P.durationText(95), "about 3 months");
});

/* ---------- the curriculum review's prerequisite map (CURRICULUM_REVIEW 4.1) ---------- */
test("prerequisite fixes: no bloat in classical and distributed training, KL before post-training", () => {
  const t = id => titlesOf(P.pathFor(UNITS, [id]));
  assert.ok(!t("classical").includes("Architectures"));
  assert.ok(!t("dist-training").includes("System Design"));
  const ft = t("finetune");
  assert.ok(ft.indexOf("Deep Dive: Information Theory") >= 0 && ft.indexOf("Deep Dive: Information Theory") < ft.indexOf("Deep Dive: Post-training LLMs"));
  assert.ok(t("rag").includes("RAG Systems End to End"));
  assert.ok(t("agents").includes("Agents & Tool-Use Systems"));
  assert.ok(t("transformers").includes("RNNs & Sequence Models"));
  const dp = t("dp");
  assert.ok(dp.indexOf("Graphs and Backtracking") < dp.indexOf("DP, Greedy and Intervals"));
  // Path sizes after the change (section 4.6).
  const size = id => P.pathFor(UNITS, [id]).lessons;
  assert.deepEqual(["rag", "agents", "finetune", "classical", "responsible", "dist-training", "mlsd-round", "llm-systems"].map(size),
    [105, 109, 113, 73, 67, 118, 146, 157]);
});
