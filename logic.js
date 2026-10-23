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
  "Deep Dive: Post-training LLMs": "Fine-tuning in Practice"
};

const str = v => (typeof v === "string" ? v : "");
const strs = a => Array.isArray(a) && a.length && a.every(x => typeof x === "string");

/* One question in any content format -> a uniform object, or null if it's malformed.
   Old format: [prompt, [correct, wrong...], why]. New format: {type:"gap"|"order"|"match", ...}. */
function normQ(raw, id) {
  if (Array.isArray(raw)) {
    const [p, opts, why] = raw;
    return strs(opts) ? { id, type: "mc", p: str(p), opts: opts.slice(), ok: opts[0], why: str(why) } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const base = { id, type: raw.type, p: str(raw.p), why: str(raw.why) };
  if (raw.type === "gap") {
    const ok = strs(raw.opts) && raw.opts.length >= 2 && base.p.split("___").length === 2;
    return ok ? { ...base, opts: raw.opts.slice(), ok: raw.opts[0] } : null;
  }
  if (raw.type === "order") {
    const ok = strs(raw.items) && raw.items.length >= ORDER_MIN && raw.items.length <= ORDER_MAX;
    return ok ? { ...base, items: raw.items.slice() } : null;
  }
  if (raw.type === "match") {
    const ok = Array.isArray(raw.pairs) && raw.pairs.length === MATCH_PAIRS && raw.pairs.every(x => Array.isArray(x) && x.length === 2 && strs(x));
    return ok ? { ...base, pairs: raw.pairs.map(x => x.slice()) } : null;
  }
  return null;
}

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
/* seq: indexes into q.items in the order the user placed them. Compared by text, so duplicate items can swap. */
function checkOrder(q, seq) {
  return seq.length === q.items.length && seq.every((i, pos) => q.items[i] === q.items[pos]);
}
/* Which placed positions are wrong, for marking after a check. */
function orderMarks(q, seq) { return seq.map((i, pos) => q.items[i] === q.items[pos]); }
/* term and def are indexes into q.pairs. Compared by text, so a repeated term or definition can't be marked wrong. */
function checkPair(q, term, def) {
  if (!q.pairs[term] || !q.pairs[def]) return false;
  const t = q.pairs[term][0], d = q.pairs[def][1];
  return q.pairs.some(p => p[0] === t && p[1] === d);
}
/* Plain-text correct answer, shown in the feedback footer. */
function answerText(q) {
  if (q.type === "order") return q.items.map((x, i) => `${i + 1}. ${x}`).join("\n");
  if (q.type === "match") return q.pairs.map(([t, d]) => `${t}: ${d}`).join("\n");
  return q.ok;
}

const Logic = { MATCH_PAIRS, ORDER_MIN, ORDER_MAX, HUES, SUBJECTS, UNIT_SUBJECT, UNIT_AFTER, normQ, normLesson, subjectOf, displayOrder, buildUnits, unitsFor, subjectName,
  validSubject, checkChoice, checkOrder, orderMarks, checkPair, answerText };
if (typeof module !== "undefined" && module.exports) module.exports = Logic;
else (root.Blop = root.Blop || {}).logic = Logic;
})(typeof window !== "undefined" ? window : globalThis);
