// Interactive question formats: schemas (normQ), answer checks, normalisation, and the content in content-interactive.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../logic.js");

const quiet = fn => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };
const nq = (raw, id = "x") => L.normQ(raw, id);
/* Each malformed variant of a valid question must normalise to null. */
function rejects(valid, patches) {
  assert.ok(nq(valid), `valid ${valid.type}`);
  patches.forEach((p, i) => assert.equal(nq({ ...valid, ...p }), null, `${valid.type} patch ${i}: ${JSON.stringify(p)}`));
}

/* ---------- the shared code field ---------- */
test("any object question can carry a code snippet; array questions are unchanged", () => {
  const mc = nq({ type: "mc", p: "What prints?", opts: ["1", "2"], why: "w", code: "\nprint(1)\n\n" });
  assert.deepEqual(mc, { id: "x", type: "mc", p: "What prints?", why: "w", code: "print(1)", opts: ["1", "2"], ok: "1" });
  assert.equal("code" in nq(["p", ["a", "b"]]), false);
  assert.equal(nq({ type: "gap", p: "a ___", opts: ["x", "y"], code: "x = 1" }).code, "x = 1");
  assert.equal("code" in nq({ type: "order", p: "o", items: ["a", "b"] }), false);
  assert.equal(nq({ type: "mc", p: "p", opts: ["a", "b"], code: 5 }), null);
  assert.equal(nq({ type: "mc", p: "p", opts: ["a"] }), null);
});

test("every type is known and unknown types still drop safely", () => {
  assert.deepEqual(L.TYPES, ["mc", "gap", "order", "match", "num", "est", "type", "output", "bug", "blanks", "bigo", "dims", "derive", "rank", "bucket", "tf", "compare", "cm"]);
  assert.equal(nq({ type: "toString" }), null);
  assert.equal(nq({ type: "__proto__" }), null);
  assert.equal(nq({ type: "py", p: "x" }), null);
});

/* ---------- num ---------- */
test("num: schema and validation", () => {
  const q = nq({ type: "num", p: "2 + 2", answer: 4, why: "w" });
  assert.deepEqual(q, { id: "x", type: "num", p: "2 + 2", why: "w", answer: 4, tol: 0, rel: 0, unit: "" });
  rejects({ type: "num", p: "p", answer: 4, tol: 0.1, rel: 0.01, unit: "ms" },
    [{ answer: "4" }, { answer: NaN }, { answer: Infinity }, { tol: -1 }, { rel: "x" }, { unit: 3 }]);
});

test("parseNumber reads the ways people type numbers", () => {
  const cases = [["42", 42], [" 1,200 ", 1200], ["1_000_000", 1e6], ["3.5k", 3500], ["2M", 2e6], ["1.5B", 1.5e9], ["2G", 2e9], ["1T", 1e12],
    ["1e-3", 0.001], ["2.5E3", 2500], ["3/4", 0.75], ["75%", 0.75], ["−2", -2], ["-0.5", -0.5], [".5", 0.5], ["5.", 5]];
  cases.forEach(([s, v]) => assert.equal(L.parseNumber(s), v, s));
  ["", "abc", "1/0", "1,2,3x", "4 apples", "1e", "--1", null, undefined].forEach(s => assert.ok(Number.isNaN(L.parseNumber(s)), String(s)));
  assert.equal(L.parseNumber("20 ms", "ms"), 20);
  assert.equal(L.parseNumber("20MS", "ms"), 20);
  assert.equal(L.parseNumber("75%", "%"), 75, "the question's own % unit is stripped, not divided");
  assert.equal(L.parseNumber("128 KiB", "KiB"), 128);
});

test("checkNum: exact, absolute and relative tolerance", () => {
  const exact = nq({ type: "num", p: "p", answer: 8 });
  assert.equal(L.checkNum(exact, "8"), true);
  assert.equal(L.checkNum(exact, "8.0"), true);
  assert.equal(L.checkNum(exact, "8.01"), false);
  assert.equal(L.checkNum(exact, ""), false);
  assert.equal(L.checkNum(exact, "eight"), false);
  const third = nq({ type: "num", p: "p", answer: 1 / 3 });
  assert.equal(L.checkNum(third, String(1 / 3)), true, "float noise is tolerated");
  const tol = nq({ type: "num", p: "p", answer: 1.667, tol: 0.01 });
  assert.equal(L.checkNum(tol, "1.67"), true);
  assert.equal(L.checkNum(tol, "1.66"), true);
  assert.equal(L.checkNum(tol, "1.6"), false);
  const rel = nq({ type: "num", p: "p", answer: 112, rel: 0.05, unit: "GB" });
  assert.equal(L.checkNum(rel, "110 GB"), true);
  assert.equal(L.checkNum(rel, "117"), true);
  assert.equal(L.checkNum(rel, "100"), false);
  assert.equal(L.checkNum(nq({ type: "num", p: "p", answer: -3 }), "−3"), true);
  assert.equal(L.checkNum(nq({ type: "num", p: "p", answer: 0.75 }), "75%"), true);
  assert.equal(L.checkNum(nq({ type: "num", p: "p", answer: 11574 }), "11.574k"), true);
});

/* ---------- est ---------- */
test("est: schema, defaults and validation", () => {
  const q = nq({ type: "est", p: "QPS?", answer: 1000, unit: "QPS" });
  assert.equal(q.within, 2); assert.equal(q.min, 1); assert.equal(q.max, 1e6); assert.equal(q.unit, "QPS");
  rejects({ type: "est", p: "p", answer: 100, within: 3, min: 1, max: 1e5 },
    [{ answer: 0 }, { answer: -5 }, { within: 1 }, { within: 0.5 }, { min: 0 }, { min: 50 }, { max: 200 }, { unit: 1 }]);
});

test("checkEst accepts within the factor either way", () => {
  const q = nq({ type: "est", p: "p", answer: 1000, within: 2 });
  assert.deepEqual(L.estBand(q), [500, 2000]);
  [500, 501, 1000, 1999, 2000, "1.5k"].forEach(v => assert.equal(L.checkEst(q, v), true, String(v)));
  [499, 2001, 0, -1000, NaN, "lots"].forEach(v => assert.equal(L.checkEst(q, v), false, String(v)));
});

/* ---------- type ---------- */
test("type: schema and validation", () => {
  const q = nq({ type: "type", p: "Fill it", code: "dp[i] = ___", answers: ["a", "b"] });
  assert.equal(q.norm, "text"); assert.deepEqual(q.answers, ["a", "b"]);
  assert.equal(nq({ type: "type", p: "p", answers: ["x"], norm: "code" }).norm, "code");
  rejects({ type: "type", p: "p", answers: ["x"], norm: "exact" },
    [{ answers: [] }, { answers: "x" }, { answers: ["x", "x"] }, { answers: [" "] }, { norm: "fuzzy" }, { code: "___ and ___" }]);
});

test("normAnswer: text, code, py and exact rules", () => {
  assert.equal(L.normAnswer("  GROUP   By. ", "text"), "group by");
  assert.equal(L.normAnswer("‘hi’", "text"), "\"hi\"");
  assert.equal(L.normAnswer("max( dp[i-1],\n dp[i-2] + x );", "code"), "max(dp[i-1],dp[i-2]+x)");
  assert.equal(L.normAnswer("f('a')", "code"), L.normAnswer("f(\"a\")", "code"));
  assert.notEqual(L.normAnswer("X", "code"), L.normAnswer("x", "code"), "code is case-sensitive");
  assert.equal(L.normAnswer("[1,  2]\n\n{'a' : 1}\r\n", "py"), "[1,2]\n{\"a\":1}");
  assert.equal(L.normAnswer("  7 5  ", "py"), "7 5");
  assert.notEqual(L.normAnswer("True", "py"), L.normAnswer("true", "py"), "py output is case-sensitive");
  assert.notEqual(L.normAnswer("1\n3", "py"), L.normAnswer("1 3", "py"), "line breaks matter");
  assert.equal(L.normAnswer("\n  a  \nb  \n\n", "exact"), "  a\nb");
  assert.equal(L.normAnswer(undefined, "text"), "");
});

test("checkTyped accepts any listed answer after normalising", () => {
  const q = nq({ type: "type", p: "p", norm: "code", answers: ["max(dp[i-1], dp[i-2] + x)", "max(dp[i-2] + x, dp[i-1])"] });
  assert.equal(L.checkTyped(q, "max(dp[i-1],dp[i-2]+x)"), true);
  assert.equal(L.checkTyped(q, " max( dp[i-2] + x , dp[i-1] ) "), true);
  assert.equal(L.checkTyped(q, "max(dp[i-1], dp[i-2])"), false);
  assert.equal(L.checkTyped(q, "   "), false, "blank never matches");
  const t = nq({ type: "type", p: "p", answers: ["GROUP BY"] });
  assert.equal(L.checkTyped(t, "group by"), true);
});

/* ---------- output ---------- */
test("output: typed and multiple-choice modes", () => {
  const typed = nq({ type: "output", p: "What prints?", code: "print(1)", answer: "1" });
  assert.equal(typed.mode, "type"); assert.deepEqual(typed.answers, ["1"]); assert.equal(typed.norm, "py");
  const many = nq({ type: "output", p: "p", code: "print(1)", answer: ["1", "1.0"], norm: "exact" });
  assert.deepEqual(many.answers, ["1", "1.0"]);
  const mc = nq({ type: "output", p: "p", code: "print(None)", opts: ["None", "0"] });
  assert.equal(mc.mode, "mc"); assert.equal(mc.ok, "None"); assert.equal(L.checkChoice(mc, "None"), true);
  rejects({ type: "output", p: "p", code: "print(1)", answer: "1" },
    [{ code: undefined }, { code: "" }, { answer: "" }, { answer: [] }, { answer: 1 }, { norm: "text" }, { opts: ["only"] }, { opts: ["a", "a"] }]);
});

test("checkTyped for output ignores spacing and quote style but not line breaks", () => {
  const q = nq({ type: "output", p: "p", code: "x", answer: "['ab', 'a']\n3" });
  assert.equal(L.checkTyped(q, "[\"ab\",\"a\"]\n3"), true);
  assert.equal(L.checkTyped(q, "['ab', 'a']\n\n3\n"), true);
  assert.equal(L.checkTyped(q, "['ab', 'a'] 3"), false);
});

/* ---------- bug ---------- */
test("bug: schema and validation", () => {
  const code = "a = 1\nb = a +\nprint(b)";
  const q = nq({ type: "bug", p: "p", code, line: 2, fix: { opts: ["b = a + 1", "b = a"] } });
  assert.equal(q.line, 2); assert.deepEqual(q.fix, { opts: ["b = a + 1", "b = a"], ok: "b = a + 1" });
  assert.equal(nq({ type: "bug", p: "p", code, line: 2 }).fix, null);
  const long = Array.from({ length: L.CODE_LINES_MAX + 1 }, (_, i) => `x${i} = ${i}`).join("\n");
  rejects({ type: "bug", p: "p", code, line: 2 },
    [{ line: 0 }, { line: 4 }, { line: 1.5 }, { line: "2" }, { code: "one line" }, { code: long }, { fix: { opts: ["only"] } }, { fix: "x" },
      { code: "a\n\nb", line: 2 }]);
});

test("checkBug needs the line, and the fix when there is one", () => {
  const q = nq({ type: "bug", p: "p", code: "a\nb\nc", line: 3, fix: { opts: ["good", "bad"] } });
  assert.equal(L.checkBug(q, 3, "good"), true);
  assert.equal(L.checkBug(q, 3, "bad"), false);
  assert.equal(L.checkBug(q, 2, "good"), false);
  const noFix = nq({ type: "bug", p: "p", code: "a\nb", line: 1 });
  assert.equal(L.checkBug(noFix, 1, null), true);
  assert.match(L.answerText(q), /^Line 3: c\nFix: good$/);
});

/* ---------- blanks ---------- */
test("blanks: schema and validation", () => {
  const q = nq({ type: "blanks", p: "p", code: "for x in {0}(a, b):\n    print({1})", blanks: [["zip", "map"], ["x", "y", "z"]] });
  assert.deepEqual(q.blanks, [["zip", "map"], ["x", "y", "z"]]);
  rejects({ type: "blanks", p: "p", code: "{0} = {1}", blanks: [["a", "b"], ["c", "d"]] },
    [{ code: "{0} = 1" }, { code: "{0} = {0}" }, { code: "{0} = {2}" }, { blanks: [["a", "b"]] }, { blanks: [["a"], ["c", "d"]] },
      { blanks: [["a", "a"], ["c", "d"]] }, { code: undefined }, { blanks: [] }]);
  assert.ok(nq({ type: "blanks", p: "p", code: "d = {'k': {0}}", blanks: [["1", "2"]] }), "other braces are fine");
});

test("checkBlanks and blankMarks compare each blank with its first option", () => {
  const q = nq({ type: "blanks", p: "p", code: "{0} {1}", blanks: [["a", "b"], ["c", "d"]] });
  assert.equal(L.checkBlanks(q, ["a", "c"]), true);
  assert.deepEqual(L.blankMarks(q, ["a", "d"]), [true, false]);
  assert.equal(L.checkBlanks(q, ["a"]), false);
});

/* ---------- bigo ---------- */
test("bigo: schema, default ladder and validation", () => {
  const q = nq({ type: "bigo", p: "p", time: "O(n)", space: "O(1)" });
  assert.deepEqual(q.ladder, L.BIGO_LADDER); assert.equal(q.space, "O(1)");
  assert.equal(nq({ type: "bigo", p: "p", time: "O(n)" }).space, null);
  rejects({ type: "bigo", p: "p", time: "O(V + E)", ladder: ["O(V)", "O(E)", "O(V + E)"] },
    [{ time: "O(n)" }, { space: "O(1)" }, { ladder: ["O(V)", "O(V + E)"] }, { ladder: ["O(V)", "O(V)", "O(V + E)"] }, { time: undefined }]);
});

test("checkBigO", () => {
  const q = nq({ type: "bigo", p: "p", time: "O(n)", space: "O(1)" });
  assert.equal(L.checkBigO(q, "O(n)", "O(1)"), true);
  assert.equal(L.checkBigO(q, "O(n)", "O(n)"), false);
  assert.equal(L.checkBigO(q, "O(1)", "O(1)"), false);
  assert.equal(L.checkBigO(nq({ type: "bigo", p: "p", time: "O(n)" }), "O(n)", null), true);
});

/* ---------- dims ---------- */
test("dims: schema, validation and check", () => {
  const q = nq({ type: "dims", p: "p", answer: ["B", "8", "8"], chips: ["B", "8", "64"] });
  assert.deepEqual(q.answer, ["B", "8", "8"]);
  rejects({ type: "dims", p: "p", answer: ["B", "n"], chips: ["B", "n", "d"] },
    [{ answer: ["B", "x"] }, { answer: [] }, { chips: ["B"] }, { chips: ["B", "n", "n"] },
      { chips: Array.from({ length: 10 }, (_, i) => `c${i}`).concat(["B", "n"]) }, { answer: Array(7).fill("B") }]);
  assert.equal(L.checkDims(q, ["B", "8", "8"]), true);
  assert.equal(L.checkDims(q, ["B", "8"]), false);
  assert.deepEqual(L.dimsMarks(q, ["8", "8", "8"]), [false, true, true]);
  assert.equal(L.answerText(q), "(B, 8, 8)");
});

/* ---------- derive and rank (both use the order UI) ---------- */
test("derive: decoys sit in the pool and must be left out", () => {
  const q = nq({ type: "derive", p: "p", items: ["s1", "s2", "s3"], decoys: ["trap"] });
  assert.deepEqual(q.pool, ["s1", "s2", "s3", "trap"]);
  assert.equal(L.checkOrder(q, [0, 1, 2]), true);
  assert.equal(L.checkOrder(q, [0, 3, 2]), false);
  assert.deepEqual(L.orderMarks(q, [0, 3, 2]), [true, false, true]);
  assert.equal(L.checkOrder(q, [0, 1]), false);
  rejects({ type: "derive", p: "p", items: ["a", "b"], decoys: ["c"] },
    [{ decoys: [] }, { decoys: ["a"] }, { items: ["a"] }, { decoys: ["c", "d", "e", "f"] }, { items: ["a", "a"] }]);
});

test("rank: needs two axis labels and checks like order", () => {
  const q = nq({ type: "rank", p: "p", items: ["fast", "mid", "slow"], axis: ["fastest", "slowest"] });
  assert.deepEqual(q.axis, ["fastest", "slowest"]);
  assert.equal(L.checkOrder(q, [0, 1, 2]), true);
  assert.equal(L.checkOrder(q, [2, 1, 0]), false);
  assert.equal(L.answerText(q), "1. fast\n2. mid\n3. slow");
  rejects({ type: "rank", p: "p", items: ["a", "b"], axis: ["lo", "hi"] }, [{ axis: ["lo"] }, { axis: ["x", "x"] }, { axis: undefined }]);
});

/* ---------- bucket ---------- */
test("bucket: schema, validation and per-card marks", () => {
  const items = [["a", "X"], ["b", "Y"], ["c", "X"]];
  const q = nq({ type: "bucket", p: "p", buckets: ["X", "Y"], items });
  assert.equal(L.checkBucket(q, ["X", "Y", "X"]), true);
  assert.deepEqual(L.bucketMarks(q, ["X", "X", "X"]), [true, false, true]);
  assert.equal(L.checkBucket(q, ["X", "Y"]), false, "an unsorted card is wrong");
  assert.equal(L.answerText(q), "X: a; c\nY: b");
  rejects({ type: "bucket", p: "p", buckets: ["X", "Y"], items },
    [{ buckets: ["X"] }, { buckets: ["X", "Y", "Z", "W", "V"] }, { items: items.slice(0, 2) }, { items: [...items, ["d", "Z"]] },
      { items: [...items, ["a", "Y"]] }, { items: Array.from({ length: 9 }, (_, i) => [`t${i}`, "X"]) }]);
});

/* ---------- tf ---------- */
test("tf: schema, pass mark and marks", () => {
  const cards = [["s1", true, "w1"], ["s2", false], ["s3", true], ["s4", false], ["s5", true]];
  const q = nq({ type: "tf", p: "p", cards });
  assert.equal(q.pass, L.TF_PASS);
  assert.deepEqual(q.cards[0], { s: "s1", ok: true, why: "w1" });
  assert.equal(q.cards[1].why, "");
  assert.equal(L.checkTF(q, [true, false, true, false, true]), true);
  assert.equal(L.checkTF(q, [true, false, true, false, false]), true, "4 of 5 passes at 80%");
  assert.equal(L.checkTF(q, [true, false, true, true, false]), false, "3 of 5 fails");
  assert.equal(L.checkTF(q, [true]), false, "unanswered cards count as wrong");
  assert.deepEqual(L.tfMarks(q, [false, false, true, false, true]), [false, true, true, true, true]);
  assert.equal(L.checkTF(nq({ type: "tf", p: "p", cards, pass: 1 }), [true, false, true, false, false]), false);
  rejects({ type: "tf", p: "p", cards },
    [{ cards: cards.slice(0, 2) }, { cards: [...cards, ["s", true], ["s", true], ["s", true], ["s", true]] }, { cards: [["s", "true"], ...cards.slice(1)] },
      { cards: [["", true], ...cards.slice(1)] }, { pass: 0 }, { pass: 1.5 }, { cards: [["s", true, 5], ...cards.slice(1)] }]);
});

/* ---------- compare ---------- */
test("compare: schema, validation and check", () => {
  const q = nq({ type: "compare", p: "p", a: { label: "A", code: "\nx = 1\n" }, b: { text: "do B" }, answer: "a", reason: { opts: ["r1", "r2"] } });
  assert.deepEqual(q.a, { label: "A", code: "x = 1", text: "" });
  assert.deepEqual(q.b, { label: "", code: "", text: "do B" });
  assert.equal(L.checkCompare(q, "a", "r1"), true);
  assert.equal(L.checkCompare(q, "a", "r2"), false);
  assert.equal(L.checkCompare(q, "b", "r1"), false);
  assert.equal(L.checkCompare(nq({ type: "compare", p: "p", a: { text: "x" }, b: { text: "y" }, answer: "b" }), "b", null), true);
  assert.equal(L.answerText(q), "A (A)\nWhy: r1");
  rejects({ type: "compare", p: "p", a: { text: "x" }, b: { code: "y" }, answer: "b" },
    [{ answer: "c" }, { answer: "A" }, { a: {} }, { a: { text: " " } }, { b: "y" }, { a: { text: "x", label: 3 } }, { reason: { opts: ["one"] } }]);
});

/* ---------- cm ---------- */
test("cmMetric computes the usual metrics and NaN for empty denominators", () => {
  const c = { tp: 30, fp: 10, fn: 20, tn: 140 };
  assert.equal(L.cmMetric("precision", c), 0.75);
  assert.equal(L.cmMetric("recall", c), 0.6);
  assert.ok(Math.abs(L.cmMetric("f1", c) - 2 / 3) < 1e-12);
  assert.equal(L.cmMetric("accuracy", c), 0.85);
  assert.equal(L.cmMetric("fpr", c), 10 / 150);
  assert.equal(L.cmMetric("specificity", c), 140 / 150);
  assert.ok(Number.isNaN(L.cmMetric("precision", { tp: 0, fp: 0, fn: 5, tn: 5 })));
  assert.ok(Number.isNaN(L.cmMetric("nope", c)));
});

test("cm: schema, validation, marks and percentages", () => {
  const q = nq({ type: "cm", p: "p", answer: { tp: 15, fp: 3, fn: 5, tn: 77 }, then: [{ metric: "precision", answer: 15 / 18 }, { metric: "recall", answer: 0.75, tol: 0.001 }] });
  assert.deepEqual(q.labels, ["positive", "negative"]);
  assert.equal(q.then[0].tol, 0.01);
  const cells = { tp: "15", fp: "3", fn: "5", tn: "77" };
  assert.equal(L.checkCM(q, cells, ["0.83", "75%"]), true);
  assert.equal(L.checkCM(q, cells, ["0.8", "0.75"]), false);
  const m = L.cmMarks(q, { ...cells, fn: "4" }, ["0.83", "0.752"]);
  assert.deepEqual(m.cells, { tp: true, fp: true, fn: false, tn: true });
  assert.deepEqual(m.metrics, [true, false]);
  assert.equal(m.ok, false);
  assert.equal(L.checkCM(nq({ type: "cm", p: "p", answer: { tp: 1, fp: 0, fn: 0, tn: 0 } }), { tp: "1", fp: "0", fn: "0", tn: "0" }, []), true);
  rejects({ type: "cm", p: "p", answer: { tp: 1, fp: 2, fn: 3, tn: 4 } },
    [{ answer: { tp: 1, fp: 2, fn: 3 } }, { answer: { tp: 1.5, fp: 2, fn: 3, tn: 4 } }, { answer: { tp: -1, fp: 2, fn: 3, tn: 4 } },
      { answer: { tp: 0, fp: 0, fn: 0, tn: 0 } }, { then: [{ metric: "auc", answer: 1 }] }, { then: [{ metric: "f1" }] },
      { then: Array(4).fill({ metric: "f1", answer: 0.5 }) }, { labels: ["only"] }, { then: {} }]);
});

/* ---------- match mono, display helpers and answers ---------- */
test("match keeps an optional mono flag", () => {
  const pairs = [["a", "1"], ["b", "2"], ["c", "3"], ["d", "4"]];
  assert.equal(nq({ type: "match", p: "p", pairs, mono: true }).mono, true);
  assert.equal("mono" in nq({ type: "match", p: "p", pairs }), false);
  assert.equal("mono" in nq({ type: "match", p: "p", pairs, mono: "yes" }), false);
});

test("number display helpers", () => {
  assert.equal(L.shortNum(11574.07), "11.6k");
  assert.equal(L.shortNum(5e12), "5T");
  assert.equal(L.shortNum(3.65e7), "36.5M");
  assert.equal(L.shortNum(0.222), "0.222");
  assert.equal(L.shortNum(8.4e22), "8.4e22");
  assert.equal(L.shortNum(-2500), "-2.5k");
  assert.equal(L.fullNum(100480), "100,480");
  assert.equal(L.fullNum(1 / 3), "0.333333");
});

test("answerText covers every interactive type", () => {
  const samples = [
    [{ type: "num", p: "p", answer: 43.2, unit: "min" }, "43.2 min"],
    [{ type: "est", p: "p", answer: 1000, unit: "QPS" }, "about 1k QPS (500 to 2k counts)"],
    [{ type: "type", p: "p", answers: ["GROUP BY", "group by"] }, "GROUP BY"],
    [{ type: "output", p: "p", code: "c", answer: "7 5" }, "7 5"],
    [{ type: "blanks", p: "p", code: "{0}", blanks: [["zip", "map"]] }, "Blank 1: zip"],
    [{ type: "bigo", p: "p", time: "O(n)", space: "O(1)" }, "Time O(n), space O(1)"],
    [{ type: "tf", p: "p", cards: [["a", true], ["b", false], ["c", true]] }, "True: a\nFalse: b\nTrue: c"],
    [{ type: "cm", p: "p", answer: { tp: 1, fp: 2, fn: 3, tn: 4 }, then: [{ metric: "recall", answer: 0.25 }] }, "TP 1, FP 2, FN 3, TN 4\nRecall: 0.25"]
  ];
  samples.forEach(([raw, text]) => assert.equal(L.answerText(nq(raw)), text, raw.type));
});

/* ---------- content-interactive.js ---------- */
function loadCurriculum(files) {
  const prev = global.window;
  global.window = { CURRICULUM: undefined };
  for (const f of files) { delete require.cache[require.resolve(f)]; require(f); }
  const c = global.window.CURRICULUM;
  global.window = prev;
  return c;
}
const BASE_FILES = ["../content.js", "../content-code.js", "../content-sd.js", "../content-ml-deep.js", "../content-extra.js"];
const BASE = loadCurriculum(BASE_FILES);
const FULL = loadCurriculum([...BASE_FILES, "../content-interactive.js"]);
/* Runs content-interactive.js against a recording curriculum: one entry per question, with the lesson it found. */
function captureEntries() {
  const entries = [];
  const fake = BASE.map((u, ui) => ({ t: u.t, ls: { find: pred => {
    const l = u.ls.find(pred);
    const e = { ui, title: l ? l[0] : null, qs: [] };
    entries.push(e);
    return l ? [l[0], l[1], { push: q => e.qs.push(q) }] : undefined;
  } } }));
  const prev = global.window;
  global.window = { CURRICULUM: fake };
  try { delete require.cache[require.resolve("../content-interactive.js")]; require("../content-interactive.js"); }
  finally { global.window = prev; }
  return entries;
}
const ENTRIES = captureEntries();

test("every content-interactive entry targets an existing lesson by unit index and title", () => {
  assert.ok(ENTRIES.length >= 120, `only ${ENTRIES.length} entries`);
  ENTRIES.forEach((e, i) => {
    assert.ok(e.title, `entry ${i} (unit ${e.ui}) names a lesson that doesn't exist`);
    assert.equal(e.qs.length, 1, `entry ${i} appended ${e.qs.length} questions`);
  });
});

test("every interactive item passes normQ and has a why", () => {
  ENTRIES.forEach((e, i) => {
    const q = quiet(() => L.normQ(e.qs[0], `entry${i}`));
    assert.ok(q, `entry ${i}: ${e.ui} / ${e.title} (${e.qs[0].type}) is malformed`);
    assert.ok(q.why.length > 10, `entry ${i}: ${e.title} needs a why`);
    assert.ok(q.p.length > 3, `entry ${i}: ${e.title} needs a prompt`);
  });
});

test("at least 8 items of each interactive format", () => {
  const n = {};
  ENTRIES.forEach(e => { const q = L.normQ(e.qs[0], "x"); const k = q.type === "match" && q.mono ? "match-mono" : q.type; n[k] = (n[k] || 0) + 1; });
  ["num", "est", "type", "output", "bug", "blanks", "bigo", "dims", "derive", "rank", "bucket", "tf", "compare", "cm", "match-mono"]
    .forEach(t => assert.ok((n[t] || 0) >= 8, `${t}: ${n[t] || 0}`));
});

test("no lesson gets more than 2 interactive items, and they are spread widely", () => {
  const per = {};
  ENTRIES.forEach(e => { const k = `${e.ui}/${e.title}`; per[k] = (per[k] || 0) + 1; });
  Object.entries(per).forEach(([k, v]) => assert.ok(v <= 2, `${k} has ${v}`));
  assert.ok(Object.keys(per).length >= 100, `only ${Object.keys(per).length} lessons`);
});

test("interactive items are appended after every existing question, so old ids keep their questions", () => {
  BASE.forEach((u, ui) => u.ls.forEach((l, li) => {
    const now = FULL[ui].ls[li][2];
    assert.ok(now.length >= l[2].length);
    l[2].forEach((q, qi) => assert.deepEqual(now[qi], q, `u${ui}l${li}q${qi}`));
  }));
  const added = FULL.reduce((a, u, ui) => a + u.ls.reduce((b, l, li) => b + l[2].length - BASE[ui].ls[li][2].length, 0), 0);
  assert.equal(added, ENTRIES.length);
});

test("content checks: cm metrics match their matrix, estimates sit inside their slider, answers parse", () => {
  ENTRIES.forEach(e => {
    const q = L.normQ(e.qs[0], "x");
    if (q.type === "cm") q.then.forEach(m => assert.ok(Math.abs(L.cmMetric(m.metric, q.cells) - m.answer) < 1e-9, `${e.title}: ${m.metric}`));
    if (q.type === "est") assert.ok(q.min <= L.estBand(q)[0] && L.estBand(q)[1] <= q.max, e.title);
    if (q.type === "num") assert.equal(L.checkNum(q, String(q.answer)), true, e.title);
    if (q.type === "type") q.answers.forEach(a => assert.equal(L.checkTyped(q, a), true, e.title));
    if (q.type === "output" && q.mode === "type") assert.equal(L.checkTyped(q, q.answers[0]), true, e.title);
    if (q.type === "bigo") assert.ok(q.ladder.includes(q.time), e.title);
    if (["bug", "blanks"].includes(q.type)) assert.ok(!/\babove\b/.test(q.p), `${e.title}: prompt shouldn't point "above"`);
  });
});
