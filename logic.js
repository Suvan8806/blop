/* Pure content logic: builds units from window.CURRICULUM, normalises questions, checks answers,
   and filters units by subject. No DOM, so it runs under node for the tests. */
(function (root) {
const HUES = ["#2A9D8F","#6A5AE0","#E0724F","#3A7FD5","#C98A12","#D0507F"];
const SUBJECTS = [["ml","ML"],["code","Coding"],["sd","System Design"]];
const SUBJECT_IDS = SUBJECTS.map(s => s[0]);
// Units that already shipped in content.js but belong to another subject. Tagged here so content.js stays untouched.
const UNIT_SUBJECT = { 16: "sd", 17: "sd" };

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
  if (raw.type === "order") return strs(raw.items) && raw.items.length >= 2 ? { ...base, items: raw.items.slice() } : null;
  if (raw.type === "match") {
    const ok = Array.isArray(raw.pairs) && raw.pairs.length >= 2 && raw.pairs.every(x => Array.isArray(x) && x.length === 2 && strs(x));
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
  return { id, ui, li, title: str(title), teach: str(teach), problems,
    qs: (Array.isArray(qs) ? qs : []).map((q, qi) => normQ(q, `${id}q${qi}`)).filter(Boolean) };
}

function subjectOf(rawUnit, ui) {
  const tr = UNIT_SUBJECT[ui] || (rawUnit && rawUnit.tr);
  return SUBJECT_IDS.includes(tr) ? tr : "ml";
}

/* CURRICULUM -> units with a hue (by global index, so colours never change), a subject,
   and a 1-based number within that subject. */
function buildUnits(curriculum) {
  const count = {};
  return curriculum.map((u, ui) => {
    const tr = subjectOf(u, ui);
    count[tr] = (count[tr] || 0) + 1;
    return { ui, title: str(u.t), hue: HUES[ui % HUES.length], tr, num: count[tr],
      lessons: u.ls.map((l, li) => normLesson(l, ui, li)) };
  });
}

function unitsFor(units, subject) { return units.filter(u => u.tr === subject); }
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
/* term and def are indexes into q.pairs. */
function checkPair(q, term, def) {
  return !!q.pairs[term] && !!q.pairs[def] && q.pairs[term][1] === q.pairs[def][1];
}
/* Plain-text correct answer, shown in the feedback footer. */
function answerText(q) {
  if (q.type === "order") return q.items.map((x, i) => `${i + 1}. ${x}`).join("\n");
  if (q.type === "match") return q.pairs.map(([t, d]) => `${t}: ${d}`).join("\n");
  return q.ok;
}

const Logic = { HUES, SUBJECTS, UNIT_SUBJECT, normQ, normLesson, subjectOf, buildUnits, unitsFor, subjectName,
  validSubject, checkChoice, checkOrder, orderMarks, checkPair, answerText };
if (typeof module !== "undefined" && module.exports) module.exports = Logic;
else (root.Blop = root.Blop || {}).logic = Logic;
})(typeof window !== "undefined" ? window : globalThis);
