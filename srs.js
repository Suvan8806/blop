/* Spaced repetition: each finished lesson has { step, due, updatedAt }. `due` is a local day number
   (see today() in core.js) and `step` indexes LADDER. Pure functions, no DOM, tested in node. */
(function (root) {
const LADDER = [1, 3, 7, 21, 60]; // days until the next review
const REVIEW_CAP = 15;
const lessonOf = qid => { const m = /^(u\d+l\d+)q\d+$/.exec(qid); return m ? m[1] : null; };

function entry(step, today, now) {
  const s = Math.max(0, Math.min(LADDER.length - 1, step));
  return { step: s, due: today + LADDER[s], updatedAt: now };
}

/* A lesson joins the schedule the first time it's finished, due tomorrow. Returns a new map. */
function enter(srs, id, today, now) {
  return srs[id] ? srs : { ...srs, [id]: entry(0, today, now) };
}

/* Finished lessons from before spaced repetition existed start due tomorrow. */
function migrate(srs, done, today, now) {
  const out = { ...(srs && typeof srs === "object" ? srs : {}) };
  Object.keys(done || {}).forEach(id => { if (done[id] && !out[id]) out[id] = entry(0, today, now); });
  return out;
}

/* Lesson ids due on or before today, most overdue first. `valid` limits them to lessons that exist. */
function dueIds(srs, today, valid) {
  return Object.keys(srs)
    .filter(id => srs[id].due <= today && (!valid || valid(id)))
    .sort((a, b) => srs[a].due - srs[b].due || a.localeCompare(b, undefined, { numeric: true }));
}

/* Pick about `cap` questions from due lessons. Previously missed questions come first, then the rest
   one lesson at a time (most overdue first) so many lessons get covered. `qsOf(id)` lists a lesson's
   question ids; `order` may shuffle a list. Returns { qids, lessons } where lessons are the ones
   with at least one question in the review (only those get graded). */
function pickReview({ srs, today, qsOf, miss, cap = REVIEW_CAP, order = a => a, valid }) {
  const due = dueIds(srs, today, valid);
  const missed = [], rest = due.map(() => []);
  due.forEach((id, i) => order(qsOf(id)).forEach(q => (miss && miss[q] > 0 ? missed : rest[i]).push(q)));
  const qids = missed.slice(0, cap);
  for (let round = 0; qids.length < cap && rest.some(r => r.length > round); round++) {
    rest.forEach(r => { if (qids.length < cap && r[round]) qids.push(r[round]); });
  }
  const lessons = due.filter(id => qids.some(q => lessonOf(q) === id));
  return { qids, lessons };
}

/* Questions a review must ask from a lesson before it can move up: two, or all of them if it has fewer. */
const MIN_ASKED = 2;
const needed = count => Math.max(1, Math.min(MIN_ASKED, Number.isFinite(count) ? count : MIN_ASKED));

/* firstTry: { qid: true if answered right on the first try }. qCount(id) gives a lesson's question count.
   Any wrong answer sends a lesson back to 1 day. A lesson moves one step up the ladder only when at least
   min(2, its question count) of its questions were asked and all were right first try; with fewer asked
   it keeps its step and due date. Returns { srs, up, back, kept } (lesson ids); the map is new. */
function gradeDetail(srs, firstTry, today, now, qCount) {
  const byLesson = {};
  Object.keys(firstTry).forEach(q => {
    const id = lessonOf(q);
    if (!id || !srs[id]) return;
    const r = byLesson[id] || (byLesson[id] = { asked: 0, right: true });
    r.asked++; r.right = r.right && !!firstTry[q];
  });
  const out = { ...srs }, up = [], back = [], kept = [];
  Object.keys(byLesson).forEach(id => {
    const r = byLesson[id];
    if (!r.right) { out[id] = entry(0, today, now); back.push(id); }
    else if (r.asked >= needed(qCount ? qCount(id) : undefined)) { out[id] = entry(srs[id].step + 1, today, now); up.push(id); }
    else kept.push(id);
  });
  return { srs: out, up, back, kept };
}
function grade(srs, firstTry, today, now, qCount) { return gradeDetail(srs, firstTry, today, now, qCount).srs; }

const SRS = { LADDER, REVIEW_CAP, MIN_ASKED, lessonOf, enter, migrate, dueIds, pickReview, grade, gradeDetail };
if (typeof module !== "undefined" && module.exports) module.exports = SRS; else root.SRS = SRS;
})(typeof window !== "undefined" ? window : globalThis);
