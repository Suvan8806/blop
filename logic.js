/* Pure content logic: builds units from window.CURRICULUM, normalises questions, checks answers,
   and filters units by subject. No DOM, so it runs under node for the tests. */
(function (root) {
const HUES = ["#2A9D8F","#6A5AE0","#E0724F","#3A7FD5","#C98A12","#D0507F"];
const SUBJECTS = [["ml","ML"],["code","Coding"],["sd","System Design"]];
const SUBJECT_IDS = SUBJECTS.map(s => s[0]);
const MATCH_PAIRS = 4;            // keyboard letters A-D and digits 1-4 cover a match
const ORDER_MIN = 2, ORDER_MAX = 6;
// Units that already shipped in content.js but belong to another subject. Tagged here so content.js stays untouched.
const UNIT_SUBJECT = { 16: "sd", 17: "sd" };
/* Display order only: a unit listed here is shown right after the unit with that title (same subject), after any
   earlier units placed there and everything placed after those. Chains are allowed (a placed unit can be a base),
   so the order can follow the prerequisite graph in paths.js: Math Primer before Foundations, the backprop,
   optimizer and regularization deep dives after Architectures. Unit indices and ids never change. Unlisted units
   keep index order. test/content.test.js checks the order is a valid topological order of Paths.PREREQS. */
const UNIT_AFTER = {
  "Math Primer": "Python Refresher",
  "Deep Dive: Probability & Stats": "Foundations",
  "Deep Dive: Evaluation Metrics": "Foundations",
  // Classical ML needs nothing from neural nets; teach it before Architectures, as most courses do.
  "Classical ML Algorithms": "Deep Dive: Evaluation Metrics",
  "Deep Dive: CNN Internals": "Architectures",
  "Deep Dive: Backprop": "Deep Dive: CNN Internals",
  "Deep Dive: Optimizers": "Deep Dive: Backprop",
  "Deep Dive: Regularization": "Deep Dive: Optimizers",
  "Deep Dive: Attention & Transformers": "Transformers & LLMs",
  "Deep Dive: Embeddings & Contrastive": "Transformers & LLMs",
  "Deep Dive: LLM Systems & Efficiency": "Transformers & LLMs",
  "Deep Dive: Leakage & Skew": "MLOps",
  "Deep Dive: RAG Evaluation": "Retrieval-Augmented Generation",
  "Deep Dive: Agents in Practice": "AI Agents",
  "Deep Dive: RL Foundations": "Reinforcement Learning",
  // KL's uses (RLHF, PPO, distillation) are taught by then; Fine-tuning and Post-training follow it.
  "Deep Dive: Information Theory": "Deep Dive: RL Foundations",
  "Deep Dive: Post-training LLMs": "Fine-tuning in Practice",
  // Hands-on HuggingFace (load, tokenize, pipeline, LoRA project) before the post-training deep dive.
  // Children are placed in index order, so this yields Fine-tuning > Practical ML Eng (ui 15) > Post-training (ui 46).
  "Practical ML Engineering": "Fine-tuning in Practice"
};

const str = v => (typeof v === "string" ? v : "");
const strs = a => Array.isArray(a) && a.length && a.every(x => typeof x === "string");

/* One question in any content format -> a uniform object, or null if it's malformed.
   Old format: [prompt, [correct, wrong...], why]. New format: {type:"mc"|"gap"|"order"|"match"|..., ...}; every
   type is described in SHAPES below and in README.md. Any object question may carry `code`, a snippet shown as
   a code block above the prompt. */
function normQ(raw, id) {
  if (Array.isArray(raw)) {
    const [p, opts, why] = raw;
    return strs(opts) ? { id, type: "mc", p: str(p), opts: opts.slice(), ok: opts[0], why: str(why) } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  if (raw.code !== undefined && typeof raw.code !== "string") return null;
  const code = typeof raw.code === "string" ? raw.code.replace(/^\n+|\s+$/g, "") : "";
  const base = { id, type: raw.type, p: str(raw.p), why: str(raw.why), ...(code ? { code } : {}) };
  const shape = has(SHAPES, raw.type) ? SHAPES[raw.type] : null;
  return shape ? shape(raw, base) : null;
}

/* ---------- question shapes ---------- */
const CARD_MIN = 3, CARD_MAX = 8;          // bucket items and true/false cards
const BUCKET_MIN = 2, BUCKET_MAX = 4;       // keys 1-4 sort the next card
const CHIP_MAX = 9, DIMS_MAX = 6;           // digits 1-9 pick a chip
const BLANK_MAX = 4, CODE_LINES_MAX = 12, FIX_MAX = 4, DECOY_MAX = 3, LADDER_MAX = 8, THEN_MAX = 3;
const BIGO_LADDER = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(2^n)"];
const TF_PASS = 0.8, EST_WITHIN = 2, EST_SPAN = 1000, CM_TOL = 0.01;
const TYPE_NORMS = ["text", "code", "exact"], OUTPUT_NORMS = ["py", "exact"];
const CM_CELLS = ["tp", "fp", "fn", "tn"];
const CM_METRICS = { precision: "Precision", recall: "Recall", f1: "F1", accuracy: "Accuracy", fpr: "False positive rate", specificity: "Specificity" };

const isNum = v => typeof v === "number" && Number.isFinite(v);
const nonNeg = v => v === undefined || (isNum(v) && v >= 0);
const sized = (a, lo, hi) => Array.isArray(a) && a.length >= lo && a.length <= hi;
const uniq = a => new Set(a).size === a.length;
const choices = (a, lo, hi) => strs(a) && sized(a, lo, hi) && uniq(a) && a.every(x => x.trim());
const optStr = v => v === undefined || typeof v === "string";
const pickOne = (list, v, dflt) => (v === undefined ? dflt : list.includes(v) ? v : null);
function has(obj, k) { return !!obj && Object.prototype.hasOwnProperty.call(obj, k); }
/* An optional follow-up multiple choice ({opts:[correct, wrong...]}): absent -> null, malformed -> false. */
function subChoice(v) {
  if (v === undefined) return null;
  return v && choices(v.opts, 2, FIX_MAX) ? { opts: v.opts.slice(), ok: v.opts[0] } : false;
}
const trimCode = c => str(c).replace(/^\n+|\s+$/g, "");

const SHAPES = {
  mc(r, b) { return strs(r.opts) && r.opts.length >= 2 ? { ...b, opts: r.opts.slice(), ok: r.opts[0] } : null; },
  gap(r, b) {
    const ok = strs(r.opts) && r.opts.length >= 2 && b.p.split("___").length === 2;
    return ok ? { ...b, opts: r.opts.slice(), ok: r.opts[0] } : null;
  },
  order(r, b) { return strs(r.items) && sized(r.items, ORDER_MIN, ORDER_MAX) ? { ...b, items: r.items.slice() } : null; },
  match(r, b) {
    const ok = Array.isArray(r.pairs) && r.pairs.length === MATCH_PAIRS && r.pairs.every(x => Array.isArray(x) && x.length === 2 && strs(x));
    return ok ? { ...b, pairs: r.pairs.map(x => x.slice()), ...(r.mono === true ? { mono: true } : {}) } : null;
  },
  /* Typed number: right within max(tol, rel * |answer|). */
  num(r, b) {
    if (!isNum(r.answer) || !nonNeg(r.tol) || !nonNeg(r.rel) || !optStr(r.unit)) return null;
    return { ...b, answer: r.answer, tol: r.tol || 0, rel: r.rel || 0, unit: str(r.unit) };
  },
  /* Estimate on a log slider: right within a factor of `within` either way. */
  est(r, b) {
    if (!isNum(r.answer) || r.answer <= 0 || !optStr(r.unit)) return null;
    const within = r.within === undefined ? EST_WITHIN : r.within;
    const min = r.min === undefined ? r.answer / EST_SPAN : r.min, max = r.max === undefined ? r.answer * EST_SPAN : r.max;
    const ok = isNum(within) && within > 1 && isNum(min) && isNum(max) && min > 0 && min < r.answer / within && r.answer * within < max;
    return ok ? { ...b, answer: r.answer, within, min, max, unit: str(r.unit) } : null;
  },
  /* Typed answer, e.g. the missing piece of code: any of `answers`, compared after normalising with `norm`. */
  type(r, b) {
    const norm = pickOne(TYPE_NORMS, r.norm, "text");
    const ok = !!norm && choices(r.answers, 1, 8) && (b.code || "").split("___").length <= 2;
    return ok ? { ...b, answers: r.answers.slice(), norm } : null;
  },
  /* Predict the output of `code`: typed (answer: a string or a list of accepted strings) or picked (opts). */
  output(r, b) {
    if (!b.code) return null;
    if (r.opts !== undefined) return choices(r.opts, 2, FIX_MAX) ? { ...b, mode: "mc", opts: r.opts.slice(), ok: r.opts[0] } : null;
    const answers = typeof r.answer === "string" ? [r.answer] : r.answer;
    const norm = pickOne(OUTPUT_NORMS, r.norm, "py");
    return norm && strs(answers) && answers.every(a => a.trim()) ? { ...b, mode: "type", answers: answers.slice(), norm } : null;
  },
  /* Tap the buggy line of `code` (1-based `line`), then optionally pick the fix. */
  bug(r, b) {
    const lines = (b.code || "").split("\n"), fix = subChoice(r.fix);
    const ok = sized(lines, 2, CODE_LINES_MAX) && Number.isInteger(r.line) && r.line >= 1 && r.line <= lines.length
      && !!lines[r.line - 1].trim() && fix !== false;
    return ok ? { ...b, line: r.line, fix } : null;
  },
  /* `code` holds {0}..{n-1}, each exactly once; blanks[i] lists the options for {i}, correct first. */
  blanks(r, b) {
    const code = b.code || "";
    if (!sized(r.blanks, 1, BLANK_MAX) || !r.blanks.every(x => choices(x, 2, 6))) return null;
    const marks = code.match(/\{\d\}/g) || [];
    const ok = marks.length === r.blanks.length && r.blanks.every((_, i) => code.split(`{${i}}`).length === 2);
    return ok ? { ...b, blanks: r.blanks.map(x => x.slice()) } : null;
  },
  /* Time (and optionally space) complexity, picked from a ladder. */
  bigo(r, b) {
    const ladder = r.ladder === undefined ? BIGO_LADDER : r.ladder;
    const ok = choices(ladder, 3, LADDER_MAX) && ladder.includes(r.time) && (r.space === undefined || ladder.includes(r.space));
    return ok ? { ...b, ladder: ladder.slice(), time: r.time, space: r.space === undefined ? null : r.space } : null;
  },
  /* Build a shape tuple from chips; a chip can be used more than once. */
  dims(r, b) {
    const ok = strs(r.answer) && sized(r.answer, 1, DIMS_MAX) && choices(r.chips, 2, CHIP_MAX) && r.answer.every(x => r.chips.includes(x));
    return ok ? { ...b, answer: r.answer.slice(), chips: r.chips.slice() } : null;
  },
  /* Order the steps of a derivation; decoy steps (classic mistakes) must be left out. */
  derive(r, b) {
    const ok = choices(r.items, ORDER_MIN, ORDER_MAX) && choices(r.decoys, 1, DECOY_MAX) && uniq([...r.items, ...r.decoys]);
    return ok ? { ...b, items: r.items.slice(), decoys: r.decoys.slice(), pool: [...r.items, ...r.decoys] } : null;
  },
  /* Order by a criterion; axis names the two ends, e.g. ["fastest", "slowest"]. */
  rank(r, b) {
    const ok = choices(r.items, ORDER_MIN, ORDER_MAX) && choices(r.axis, 2, 2);
    return ok ? { ...b, items: r.items.slice(), axis: r.axis.slice() } : null;
  },
  /* Sort cards into labelled buckets: items are [text, bucket]. */
  bucket(r, b) {
    const ok = choices(r.buckets, BUCKET_MIN, BUCKET_MAX) && sized(r.items, CARD_MIN, CARD_MAX)
      && r.items.every(x => Array.isArray(x) && x.length === 2 && strs(x) && r.buckets.includes(x[1]))
      && uniq(r.items.map(x => x[0]));
    return ok ? { ...b, buckets: r.buckets.slice(), items: r.items.map(x => x.slice()) } : null;
  },
  /* A deck of true/false statements: cards are [statement, true|false, why?]. Right when >= pass of them are. */
  tf(r, b) {
    const pass = r.pass === undefined ? TF_PASS : r.pass;
    const ok = isNum(pass) && pass > 0 && pass <= 1 && sized(r.cards, CARD_MIN, CARD_MAX)
      && r.cards.every(c => Array.isArray(c) && typeof c[0] === "string" && !!c[0].trim() && typeof c[1] === "boolean" && optStr(c[2]));
    return ok ? { ...b, pass, cards: r.cards.map(c => ({ s: c[0], ok: c[1], why: str(c[2]) })) } : null;
  },
  /* Two variants (code or text): pick the better one, then optionally why. */
  compare(r, b) {
    const side = x => !!x && typeof x === "object" && optStr(x.label) && optStr(x.code) && optStr(x.text) && !!(trimCode(x.code) || str(x.text).trim());
    const reason = subChoice(r.reason);
    if (!side(r.a) || !side(r.b) || !["a", "b"].includes(r.answer) || reason === false) return null;
    const clean = x => ({ label: str(x.label), code: trimCode(x.code), text: str(x.text) });
    return { ...b, a: clean(r.a), b: clean(r.b), answer: r.answer, reason };
  },
  /* Fill a 2x2 confusion matrix, then optionally compute metrics from it. */
  cm(r, b) {
    const a = r.answer;
    if (!a || typeof a !== "object" || !CM_CELLS.every(k => Number.isInteger(a[k]) && a[k] >= 0) || !CM_CELLS.some(k => a[k] > 0)) return null;
    const then = r.then === undefined ? [] : r.then;
    const thenOk = Array.isArray(then) && then.length <= THEN_MAX
      && then.every(m => !!m && has(CM_METRICS, m.metric) && isNum(m.answer) && nonNeg(m.tol));
    const labels = r.labels === undefined ? ["positive", "negative"] : r.labels;
    if (!thenOk || !choices(labels, 2, 2)) return null;
    return { ...b, cells: Object.fromEntries(CM_CELLS.map(k => [k, a[k]])), labels: labels.slice(),
      then: then.map(m => ({ metric: m.metric, answer: m.answer, tol: m.tol === undefined ? CM_TOL : m.tol })) };
  }
};
const TYPES = Object.keys(SHAPES);

/* Lesson tuple [title, teach, questions, {problems}?] -> lesson object. Question ids come from the
   original position, so a malformed question never shifts the ids after it. */
function normLesson(raw, ui, li) {
  const [title, teach, qs, extra] = raw;
  const id = `u${ui}l${li}`;
  const problems = extra && strs(extra.problems) ? extra.problems.slice() : [];
  const list = (Array.isArray(qs) ? qs : []).map((q, qi) => {
    const n = normQ(q, `${id}q${qi}`);
    if (!n) warn(`blop: dropped malformed question ${id}q${qi}`);
    return n;
  }).filter(Boolean);
  if (!list.length) warn(`blop: lesson ${id} has no valid questions`);
  return { id, ui, li, title: str(title), teach: str(teach), problems, qs: list };
}

function warn(msg) { if (typeof console !== "undefined") console.warn(msg); }

function subjectOf(rawUnit, ui) {
  const tr = UNIT_SUBJECT[ui] || (rawUnit && rawUnit.tr);
  return SUBJECT_IDS.includes(tr) ? tr : "ml";
}

/* Units (each with ui, title, tr) in display order: a unit named in `after` follows its base unit and everything
   already placed after that base. A unit whose base is missing, in another subject, itself, or part of a cycle stays
   in index order. */
function displayOrder(units, after = UNIT_AFTER) {
  const byTitle = new Map();
  units.forEach(u => { if (!byTitle.has(u.title)) byTitle.set(u.title, u); });
  const link = u => {
    const b = byTitle.get(after[u.title]);
    return b && b !== u && b.tr === u.tr ? b : null;
  };
  const inCycle = u => {
    const seen = new Set([u]);
    for (let b = link(u); b; b = link(b)) { if (seen.has(b)) return true; seen.add(b); }
    return false;
  };
  const baseOf = u => (link(u) && !inCycle(u) ? link(u) : null);
  const kids = new Map();
  units.forEach(u => { const b = baseOf(u); if (b) kids.set(b, [...(kids.get(b) || []), u]); });
  const out = [];
  const visit = u => { out.push(u); (kids.get(u) || []).forEach(visit); };
  units.filter(u => !baseOf(u)).forEach(visit);
  return out;
}

/* CURRICULUM -> units, indexed by ui, with a hue (by global index, so colours never change), a subject,
   a display position `pos` (see displayOrder) and a 1-based number within the subject in display order. */
function buildUnits(curriculum) {
  const units = curriculum.map((u, ui) => ({ ui, title: str(u.t), hue: HUES[ui % HUES.length], tr: subjectOf(u, ui),
    lessons: u.ls.map((l, li) => normLesson(l, ui, li)) }));
  const count = {};
  const placed = displayOrder(units).map((u, pos) => {
    count[u.tr] = (count[u.tr] || 0) + 1;
    return { ...u, pos, num: count[u.tr] };
  });
  return placed.sort((a, b) => a.ui - b.ui);
}

/* A subject's units in display order. */
function unitsFor(units, subject) {
  return units.filter(u => u.tr === subject).sort((a, b) => (a.pos ?? a.ui) - (b.pos ?? b.ui));
}
function subjectName(id) { const s = SUBJECTS.find(x => x[0] === id); return s ? s[1] : SUBJECTS[0][1]; }
function validSubject(id) { return SUBJECT_IDS.includes(id) ? id : "ml"; }

/* ---------- answer checks ---------- */
function checkChoice(q, choice) { return choice === q.ok; }
/* seq: indexes into q.pool (derive: the steps plus decoys) or q.items, in the order the user placed them.
   Compared by text, so duplicate items can swap. orderMarks says which placed positions are right. */
function orderMarks(q, seq) { const src = q.pool || q.items; return seq.map((i, pos) => src[i] === q.items[pos]); }
function checkOrder(q, seq) { return seq.length === q.items.length && orderMarks(q, seq).every(Boolean); }
/* term and def are indexes into q.pairs. Compared by text, so a repeated term or definition can't be marked wrong. */
function checkPair(q, term, def) {
  if (!q.pairs[term] || !q.pairs[def]) return false;
  const t = q.pairs[term][0], d = q.pairs[def][1];
  return q.pairs.some(p => p[0] === t && p[1] === d);
}

/* Reads a typed number: "1,200", "1_200", "1.2k", "3.5M", "2B", "1e-3", "3/4", "75%" (= 0.75) and "−2" all work.
   The question's own unit may follow ("20 ms" when the unit is "ms"). NaN if it can't be read. */
const SCALE = { k: 1e3, m: 1e6, b: 1e9, g: 1e9, t: 1e12, "%": 0.01 };
function parseNumber(input, unit) {
  let s = String(input === undefined || input === null ? "" : input).trim().replace(/[−–—]/g, "-");
  const u = String(unit || "").trim().toLowerCase();
  if (u && s.toLowerCase().endsWith(u)) s = s.slice(0, s.length - u.length).trim();
  s = s.replace(/(\d)[,_](?=\d)/g, "$1");
  const frac = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*\/\s*(\d+\.?\d*|\.\d+)$/);
  if (frac) return +frac[2] ? +frac[1] / +frac[2] : NaN;
  const m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([kmbgt%])?$/i);
  return m ? +m[1] * (m[2] ? SCALE[m[2].toLowerCase()] : 1) : NaN;
}
function checkNum(q, input) {
  const x = parseNumber(input, q.unit);
  if (!Number.isFinite(x)) return false;
  const allowed = Math.max(q.tol, q.rel * Math.abs(q.answer), 1e-9 * Math.max(1, Math.abs(q.answer)));
  return Math.abs(x - q.answer) <= allowed;
}
/* The accepted range of an estimate, [low, high]. */
function estBand(q) { return [q.answer / q.within, q.answer * q.within]; }
function checkEst(q, value) {
  const x = typeof value === "number" ? value : parseNumber(value, q.unit);
  if (!Number.isFinite(x) || x <= 0) return false;
  return Math.max(x / q.answer, q.answer / x) <= q.within * (1 + 1e-9);
}

/* Normalises a typed answer before comparing:
   text  - case, spacing and a trailing full stop don't matter;
   code  - spacing, quote style and a trailing semicolon don't matter (case does);
   py    - printed output: blank lines, spacing and quote style don't matter (line breaks and case do);
   exact - only trailing spaces and blank lines at either end are ignored. */
function normAnswer(s, mode) {
  const t = String(s === undefined || s === null ? "" : s).replace(/\r\n?/g, "\n")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  if (mode === "exact") return t.split("\n").map(x => x.replace(/\s+$/, "")).join("\n").replace(/^\n+|\n+$/g, "");
  if (mode === "code") return t.replace(/\s+/g, "").replace(/'/g, '"').replace(/;+$/, "");
  if (mode === "py") {
    return t.split("\n").map(x => x.trim().replace(/\s+/g, " ").replace(/ ?([,:()[\]{}]) ?/g, "$1").replace(/'/g, '"'))
      .filter(Boolean).join("\n");
  }
  return t.trim().toLowerCase().replace(/\s+/g, " ").replace(/'/g, '"').replace(/[.!]+$/, "");
}
/* type, and output in typed mode. */
function checkTyped(q, input) {
  const got = normAnswer(input, q.norm);
  return !!got && q.answers.some(a => normAnswer(a, q.norm) === got);
}
function checkBug(q, line, fix) { return line === q.line && (!q.fix || fix === q.fix.ok); }
/* picks[i]: the option chosen for blank i. */
function blankMarks(q, picks) { return q.blanks.map((b, i) => picks[i] === b[0]); }
function checkBlanks(q, picks) { return blankMarks(q, picks).every(Boolean); }
function checkBigO(q, time, space) { return time === q.time && (q.space === null || space === q.space); }
function dimsMarks(q, seq) { return q.answer.map((x, i) => seq[i] === x); }
function checkDims(q, seq) { return seq.length === q.answer.length && dimsMarks(q, seq).every(Boolean); }
/* picks[i]: the bucket chosen for q.items[i]. */
function bucketMarks(q, picks) { return q.items.map((it, i) => picks[i] === it[1]); }
function checkBucket(q, picks) { return bucketMarks(q, picks).every(Boolean); }
/* picks[i]: true or false for q.cards[i]; an unanswered card counts as wrong. */
function tfMarks(q, picks) { return q.cards.map((c, i) => picks[i] === c.ok); }
function checkTF(q, picks) { return tfMarks(q, picks).filter(Boolean).length / q.cards.length >= q.pass - 1e-9; }
function checkCompare(q, side, reason) { return side === q.answer && (!q.reason || reason === q.reason.ok); }
/* A metric from confusion-matrix counts; NaN when its denominator is zero. */
function cmMetric(name, c) {
  const div = (a, b) => (b ? a / b : NaN);
  switch (name) {
    case "precision": return div(c.tp, c.tp + c.fp);
    case "recall": return div(c.tp, c.tp + c.fn);
    case "f1": return div(2 * c.tp, 2 * c.tp + c.fp + c.fn);
    case "accuracy": return div(c.tp + c.tn, c.tp + c.fp + c.fn + c.tn);
    case "fpr": return div(c.fp, c.fp + c.tn);
    case "specificity": return div(c.tn, c.tn + c.fp);
    default: return NaN;
  }
}
/* cells: typed {tp, fp, fn, tn}; metrics: typed values for q.then, in order. -> {cells:{tp: bool, ...}, metrics:[bool], ok} */
function cmMarks(q, cells, metrics) {
  const cm = Object.fromEntries(CM_CELLS.map(k => [k, parseNumber(cells && cells[k]) === q.cells[k]]));
  const ms = q.then.map((m, i) => {
    const x = parseNumber(metrics && metrics[i]);
    return Number.isFinite(x) && Math.abs(x - m.answer) <= m.tol + 1e-12;
  });
  return { cells: cm, metrics: ms, ok: CM_CELLS.every(k => cm[k]) && ms.every(Boolean) };
}
function checkCM(q, cells, metrics) { return cmMarks(q, cells, metrics).ok; }

/* Numbers for display: full ("11,574.07") and short ("11.6k"). */
function fullNum(x) { return Number.isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: 6 }) : String(x); }
function shortNum(x) {
  if (!Number.isFinite(x)) return String(x);
  const sig = v => String(+v.toPrecision(3)), a = Math.abs(x);
  if (a >= 1e15 || (a > 0 && a < 1e-4)) return x.toExponential(2).replace(/\.?0+e/, "e").replace("e+", "e");
  for (const [v, s] of [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "k"]]) if (a >= v) return sig(x / v) + s;
  return sig(x);
}
const withUnit = (v, u) => (u ? `${v} ${u}` : v);

/* Plain-text correct answer, shown in the feedback footer. */
function answerText(q) {
  const list = items => items.map((x, i) => `${i + 1}. ${x}`).join("\n");
  switch (q.type) {
    case "order": case "derive": case "rank": return list(q.items);
    case "match": return q.pairs.map(([t, d]) => `${t}: ${d}`).join("\n");
    case "num": return withUnit(fullNum(q.answer), q.unit);
    case "est": { const [lo, hi] = estBand(q); return `about ${withUnit(shortNum(q.answer), q.unit)} (${shortNum(lo)} to ${shortNum(hi)} counts)`; }
    case "type": return q.answers[0];
    case "output": return q.mode === "mc" ? q.ok : q.answers[0];
    case "bug": return `Line ${q.line}: ${q.code.split("\n")[q.line - 1].trim()}` + (q.fix ? `\nFix: ${q.fix.ok}` : "");
    case "blanks": return q.blanks.map((b, i) => `Blank ${i + 1}: ${b[0]}`).join("\n");
    case "bigo": return `Time ${q.time}` + (q.space ? `, space ${q.space}` : "");
    case "dims": return `(${q.answer.join(", ")})`;
    case "bucket": return q.buckets.map(b => `${b}: ${q.items.filter(x => x[1] === b).map(x => x[0]).join("; ") || "none"}`).join("\n");
    case "tf": return q.cards.map(c => `${c.ok ? "True" : "False"}: ${c.s}`).join("\n");
    case "compare": {
      const s = q[q.answer];
      return `${q.answer.toUpperCase()}${s.label ? ` (${s.label})` : ""}` + (q.reason ? `\nWhy: ${q.reason.ok}` : "");
    }
    case "cm": return `TP ${q.cells.tp}, FP ${q.cells.fp}, FN ${q.cells.fn}, TN ${q.cells.tn}`
      + q.then.map(m => `\n${CM_METRICS[m.metric]}: ${+m.answer.toFixed(4)}`).join("");
    default: return q.ok;
  }
}

const Logic = { MATCH_PAIRS, ORDER_MIN, ORDER_MAX, HUES, SUBJECTS, UNIT_SUBJECT, UNIT_AFTER, normQ, normLesson, subjectOf, displayOrder, buildUnits, unitsFor, subjectName,
  validSubject, checkChoice, checkOrder, orderMarks, checkPair, answerText,
  TYPES, BIGO_LADDER, CM_CELLS, CM_METRICS, TF_PASS, EST_WITHIN, CARD_MAX, BUCKET_MAX, CHIP_MAX, BLANK_MAX, CODE_LINES_MAX,
  parseNumber, checkNum, estBand, checkEst, normAnswer, checkTyped, checkBug, blankMarks, checkBlanks, checkBigO, dimsMarks, checkDims,
  bucketMarks, checkBucket, tfMarks, checkTF, checkCompare, cmMetric, cmMarks, checkCM, fullNum, shortNum };
if (typeof module !== "undefined" && module.exports) module.exports = Logic;
else (root.Blop = root.Blop || {}).logic = Logic;
})(typeof window !== "undefined" ? window : globalThis);
