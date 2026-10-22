// Mock interview logic (mock.js) and the prompt bank (mock-prompts.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const Mock = require("../mock.js");
const MP = require("../mock-prompts.js");

const T = 20748;
const RUBRIC = [{ name: "Definitions" }, { name: "Diagnosis" }, { name: "Remedies" }];
const result = (overall = 3) => ({ scores: [{ area: "Definitions", score: overall, note: "ok" }], overall, strengths: ["a"], gaps: ["b"], outline: ["c"] });
const att = (id, at, extra = {}) => ({ id, promptId: "ml-bias-variance", answer: "my answer text here", result: result(), day: T, updatedAt: at, ...extra });

/* ---------- prompt bank ---------- */
test("the prompt bank has at least 40 prompts across the 4 categories, each well formed", () => {
  assert.ok(MP.PROMPTS.length >= 40);
  assert.deepEqual(MP.CATEGORIES.map(c => c.id), ["ml", "sd", "code", "behav"]);
  MP.CATEGORIES.forEach(c => assert.ok(MP.inCategory(c.id).length >= 8, c.id));
  const ids = new Set();
  for (const p of MP.PROMPTS) {
    assert.match(p.id, /^[a-z0-9-]{3,64}$/);
    assert.ok(!ids.has(p.id), `duplicate ${p.id}`); ids.add(p.id);
    assert.ok(MP.CATEGORIES.some(c => c.id === p.cat));
    assert.ok(p.title && p.prompt.length > 20);
    assert.ok(p.rubric.length >= 3 && p.rubric.length <= 5, p.id);
    p.rubric.forEach(r => assert.ok(r.name && r.what_good_looks_like.length > 20, p.id));
    assert.ok(p.outline.length >= 3 && p.outline.length <= 6, p.id);
  }
});

test("the examples from the brief are in the bank", () => {
  const titles = MP.PROMPTS.map(p => p.title.toLowerCase()).join("\n");
  ["youtube recommender", "bias-variance", "rate limiter", "rag", "k most frequent"].forEach(t => assert.match(titles, new RegExp(t)));
});

test("byId only finds real prompts, and the bank is frozen", () => {
  assert.equal(MP.byId("ml-bias-variance").cat, "ml");
  for (const bad of ["nope", "__proto__", "constructor", "", null, 5, {}]) assert.equal(MP.byId(bad), null);
  assert.throws(() => { "use strict"; MP.PROMPTS[0].rubric[0].name = "x"; });
});

/* ---------- answers ---------- */
test("answers must be 20 to 6000 characters once trimmed", () => {
  assert.equal(Mock.checkAnswer("   short   ").ok, false);
  assert.equal(Mock.checkAnswer(42).ok, false);
  assert.equal(Mock.checkAnswer("x".repeat(19)).ok, false);
  assert.equal(Mock.checkAnswer("  " + "x".repeat(20) + "  ").text, "x".repeat(20));
  assert.equal(Mock.checkAnswer("x".repeat(6000)).ok, true);
  assert.equal(Mock.checkAnswer("x".repeat(6001)).ok, false);
});

test("word count", () => {
  assert.equal(Mock.wordCount(""), 0);
  assert.equal(Mock.wordCount("  one two\nthree\t four "), 4);
});

/* ---------- clamping a grade ---------- */
test("scores are clamped to integers 0..5 and overall is their mean", () => {
  const r = Mock.clampResult({ scores: [{ area: "Definitions", score: 9 }, { area: "Diagnosis", score: -2 }, { area: "Remedies", score: "3.6" }], overall: 5 }, RUBRIC);
  assert.deepEqual(r.scores.map(s => s.score), [5, 0, 4]);
  assert.equal(r.overall, 3);
});

test("areas match the rubric by name in any order, else by position, and use the rubric's names", () => {
  const r = Mock.clampResult({ scores: [{ area: "remedies", score: 1 }, { area: "something else", score: 2 }, { area: "DEFINITIONS!", score: 3 }] }, RUBRIC);
  assert.deepEqual(r.scores.map(s => [s.area, s.score]), [["Definitions", 3], ["Diagnosis", 2], ["Remedies", 1]]);
});

test("a grade missing an area or with a non-numeric score is unusable", () => {
  assert.equal(Mock.clampResult({ scores: [{ area: "Definitions", score: 3 }] }, RUBRIC), null);
  assert.equal(Mock.clampResult({ scores: [{ area: "Definitions", score: 3 }, { area: "Diagnosis", score: "high" }, { area: "Remedies", score: 2 }] }, RUBRIC), null);
  for (const bad of [null, "x", [], {}, { scores: "no" }, { scores: [null, 1] }]) assert.equal(Mock.clampResult(bad, RUBRIC), null);
});

test("lists and strings are cut to size and non-strings dropped", () => {
  const long = "y".repeat(1000);
  const r = Mock.clampResult({ scores: [{ area: "Definitions", score: 2, note: long }, { area: "Diagnosis", score: 2 }, { area: "Remedies", score: 2 }],
    strengths: Array(20).fill("good"), gaps: [long, 5, null, { x: 1 }, "  ", "real gap"], outline: "not a list" }, RUBRIC);
  assert.equal(r.scores[0].note.length, Mock.MAX_NOTE);
  assert.equal(r.strengths.length, Mock.MAX_ITEMS);
  assert.deepEqual(r.gaps, ["y".repeat(Mock.MAX_ITEM), "real gap"]);
  assert.deepEqual(r.outline, []);
});

test("control characters are stripped; HTML stays as inert text for the UI to escape", () => {
  const r = Mock.clampResult({ scores: [{ area: "a", score: 1, note: "x\u0000y\u0007" }], strengths: ["<img src=x onerror=alert(1)>"] });
  assert.equal(r.scores[0].note, "xy");
  assert.equal(r.strengths[0], "<img src=x onerror=alert(1)>");
});

test("without a rubric (saved results) valid areas are kept as they are", () => {
  const r = Mock.clampResult({ scores: [{ area: "A", score: 4 }, { area: "", score: 3 }, { area: "B", score: "x" }, { area: "C", score: 2 }] });
  assert.deepEqual(r.scores.map(s => s.area), ["A", "C"]);
  assert.equal(r.overall, 3);
});

/* ---------- history ---------- */
test("add puts the attempt first and caps the history at 100, keeping the newest", () => {
  let list = [];
  for (let i = 0; i < 105; i++) list = Mock.add(list, { id: `m${i}`, promptId: "ml-bias-variance", answer: "answer text that is long enough", result: result(), day: T, now: 1000 + i });
  assert.equal(list.length, Mock.MAX_ATTEMPTS);
  assert.equal(list[0].id, "m104");
  assert.equal(list[list.length - 1].id, "m5");
});

test("add refuses an attempt with an unusable result and doesn't change the input", () => {
  const before = [att("a", 1)];
  const out = Mock.add(before, { id: "b", promptId: "ml-bias-variance", answer: "x", result: { scores: [] }, day: T, now: 2 });
  assert.deepEqual(out, before);
  assert.notEqual(out, before);
});

test("remove leaves a tombstone, and readers skip it", () => {
  const list = Mock.remove([att("a", 1), att("b", 2)], "a", 9);
  assert.deepEqual(list[0], { id: "a", deleted: true, updatedAt: 9 });
  assert.deepEqual(Mock.live(list).map(a => a.id), ["b"]);
  assert.deepEqual(Mock.forPrompt(list, "ml-bias-variance").map(a => a.id), ["b"]);
});

test("sanitize drops junk, keeps tombstones, dedupes by id (newer wins) and repairs results", () => {
  const out = Mock.sanitize([null, 5, { id: "" }, { id: "x", promptId: "p", result: null, day: T },
    att("a", 1), att("a", 3, { answer: "newer copy here" }), { id: "d", deleted: true, updatedAt: 2, answer: "gone" },
    att("bad-day", 1, { day: -4 }), att("big", 4, { answer: "z".repeat(7000), result: { scores: [{ area: "A", score: 12 }], overall: 99 } })]);
  assert.deepEqual(out.map(a => a.id), ["big", "a", "d"]);
  assert.equal(out[1].answer, "newer copy here");
  assert.deepEqual(out[2], { id: "d", deleted: true, updatedAt: 2 });
  assert.equal(out[0].answer.length, Mock.MAX_ANSWER);
  assert.equal(out[0].result.overall, 5);
  assert.deepEqual(Mock.sanitize("nope"), []);
});

test("trend and summary show improvement per prompt, oldest to newest", () => {
  const list = [att("a", 1, { result: result(2) }), att("b", 5, { result: result(4) }), att("c", 3, { result: result(3) }),
    att("o", 4, { promptId: "sd-rate-limiter", result: result(1) })];
  const t = Mock.trend(Mock.forPrompt(list, "ml-bias-variance"));
  assert.deepEqual(t.scores, [2, 3, 4]);
  assert.equal(t.change, 2);
  assert.equal(t.best, 4);
  assert.deepEqual(Mock.summary(list).map(r => [r.promptId, r.count]), [["ml-bias-variance", 3], ["sd-rate-limiter", 1]]);
  assert.equal(Mock.trend([]).count, 0);
});
