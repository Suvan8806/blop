/* Mock interviews: answer checks, clamping a grade into a safe shape, and the attempt history in S.mock.
   Pure functions, no DOM, tested in node. Shared by the browser (window.Mock) and /api/grade (require),
   so the server and the app clamp grades the same way.
   An attempt is { id, promptId, answer, result, day, updatedAt }. Deleting one leaves a tombstone
   { id, deleted: true, updatedAt } so the deletion syncs; every reader skips tombstones. The history
   keeps the newest MAX_ATTEMPTS entries (tombstones included) by updatedAt. */
(function (root) {
const MAX_ATTEMPTS = 100;
const MIN_ANSWER = 20, MAX_ANSWER = 6000;          // characters, after trimming
const SCORE_MIN = 0, SCORE_MAX = 5;
const MAX_AREAS = 5, MAX_AREA = 80, MAX_NOTE = 300; // rubric areas and their text
const MAX_ITEMS = 6, MAX_ITEM = 300;               // strengths, gaps, outline
const MAX_ID = 64, MAX_DAY = 200000;

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
/* Plain text only: control characters (except newline and tab) removed, trimmed and cut to max. */
function cleanText(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim().slice(0, max);
}
const cleanList = v => (Array.isArray(v) ? v : []).map(x => cleanText(x, MAX_ITEM)).filter(Boolean).slice(0, MAX_ITEMS);

/* An answer worth grading: a string of MIN_ANSWER..MAX_ANSWER characters once trimmed. */
function checkAnswer(answer) {
  if (typeof answer !== "string") return { ok: false, error: "Type an answer first." };
  const text = answer.trim();
  if (text.length < MIN_ANSWER) return { ok: false, error: `Write at least ${MIN_ANSWER} characters so there's something to grade.` };
  if (text.length > MAX_ANSWER) return { ok: false, error: `Keep it under ${MAX_ANSWER} characters (yours is ${text.length}).` };
  return { ok: true, text };
}
function wordCount(text) { const m = String(text || "").trim().match(/\S+/g); return m ? m.length : 0; }

/* A score as an integer 0..5, or null when it isn't a number at all. "4" and 4.4 become 4; 9 becomes 5. */
function parseScore(v) {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(n)));
}
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const mean = l => l.reduce((a, b) => a + b, 0) / l.length;

/* Clamp a grade into { scores:[{area, score, note}], overall, strengths, gaps, outline }, or null if unusable.
   With a rubric (the server), there's exactly one score per rubric area in rubric order: matched by area
   name, else by position; a missing or non-numeric score makes the whole grade unusable. Without one
   (results already saved), the saved areas are kept as they are, clamped. overall is always the mean of
   the area scores to one decimal, so it can't disagree with them. */
function clampResult(raw, rubric) {
  if (!isObj(raw) || !Array.isArray(raw.scores)) return null;
  const given = raw.scores.filter(isObj);
  let scores;
  if (Array.isArray(rubric) && rubric.length) {
    const used = new Set();
    const take = j => { if (j >= 0) used.add(j); return j; };
    const at = rubric.map(r => take(given.findIndex((g, k) => !used.has(k) && norm(g.area) === norm(r.name))));
    at.forEach((j, i) => { if (j < 0) at[i] = take(given.findIndex((g, k) => !used.has(k))); });
    scores = rubric.map((r, i) => {
      const j = at[i];
      if (j < 0) return null;
      const score = parseScore(given[j].score);
      return score === null ? null : { area: r.name, score, note: cleanText(given[j].note, MAX_NOTE) };
    });
    if (scores.some(s => s === null)) return null;
  } else {
    scores = given.map(g => ({ area: cleanText(g.area, MAX_AREA), score: parseScore(g.score), note: cleanText(g.note, MAX_NOTE) }))
      .filter(s => s.area && s.score !== null).slice(0, MAX_AREAS);
    if (!scores.length) return null;
  }
  return { scores, overall: Math.round(mean(scores.map(s => s.score)) * 10) / 10,
    strengths: cleanList(raw.strengths), gaps: cleanList(raw.gaps), outline: cleanList(raw.outline) };
}

/* ---------- attempt history ---------- */
const stamp = a => (Number.isFinite(a.updatedAt) ? a.updatedAt : 0);
/* Newest first; ties broken by id so every device keeps the same entries. */
const newestFirst = (x, y) => stamp(y) - stamp(x) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
function cap(list) { return list.slice().sort(newestFirst).slice(0, MAX_ATTEMPTS); }

function newId(rand = Math.random, now = Date.now()) {
  return `m${now.toString(36)}${rand().toString(36).slice(2, 10).padEnd(8, "0")}`;
}
const validId = id => typeof id === "string" && id.length > 0 && id.length <= MAX_ID;
const validDay = d => Number.isInteger(d) && d >= 0 && d <= MAX_DAY;

/* One saved entry, repaired, or null when it can't be. */
function cleanAttempt(a) {
  if (!isObj(a) || !validId(a.id)) return null;
  if (a.deleted === true) return { id: a.id, deleted: true, updatedAt: stamp(a) };
  const result = clampResult(a.result);
  if (!validId(a.promptId) || !result || !validDay(a.day)) return null;
  return { id: a.id, promptId: a.promptId, answer: cleanText(a.answer, MAX_ANSWER), result, day: a.day, updatedAt: stamp(a) };
}
/* Saved data from older versions or another device: valid entries only, one per id (the newer), capped. */
function sanitize(list) {
  const byId = new Map();
  (Array.isArray(list) ? list : []).map(cleanAttempt).filter(Boolean).forEach(a => {
    const b = byId.get(a.id);
    if (!b || newestFirst(a, b) < 0) byId.set(a.id, a);
  });
  return cap([...byId.values()]);
}
/* A new graded attempt. Returns a new list, capped. */
function add(list, { id, promptId, answer, result, day, now }) {
  const a = cleanAttempt({ id, promptId, answer, result, day, updatedAt: now });
  return a ? cap([a, ...(list || []).filter(x => x.id !== id)]) : (list || []).slice();
}
/* Deleting leaves a tombstone in place. Returns a new list. */
function remove(list, id, now) { return (list || []).map(a => a.id === id ? { id, deleted: true, updatedAt: now } : a); }
function live(list) { return (list || []).filter(a => a && !a.deleted); }

/* A prompt's attempts, oldest first, so scores read left to right as a trend. */
function forPrompt(list, promptId) { return live(list).filter(a => a.promptId === promptId).sort((x, y) => -newestFirst(x, y)); }
/* Scores over time for one prompt's attempts (oldest first). change is last minus first. */
function trend(attempts) {
  const scores = attempts.map(a => a.result.overall);
  if (!scores.length) return { count: 0, scores, first: null, last: null, best: null, change: 0 };
  const first = scores[0], last = scores[scores.length - 1];
  return { count: scores.length, scores, first, last, best: Math.max(...scores), change: Math.round((last - first) * 10) / 10 };
}
/* One row per prompt you've attempted, most recently practised first. */
function summary(list) {
  const groups = new Map();
  live(list).slice().sort(newestFirst).forEach(a => { if (!groups.has(a.promptId)) groups.set(a.promptId, true); });
  return [...groups.keys()].map(promptId => ({ promptId, ...trend(forPrompt(list, promptId)) }));
}

const Mock = { MAX_ATTEMPTS, MIN_ANSWER, MAX_ANSWER, SCORE_MAX, MAX_ITEMS, MAX_ITEM, MAX_NOTE, cleanText, checkAnswer, wordCount,
  parseScore, clampResult, cap, newId, cleanAttempt, sanitize, add, remove, live, forPrompt, trend, summary };
if (typeof module !== "undefined" && module.exports) module.exports = Mock; else root.Mock = Mock;
})(typeof window !== "undefined" ? window : globalThis);
