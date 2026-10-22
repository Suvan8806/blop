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

/* firstTry: { qid: true if answered right on the first try }. Each reviewed lesson moves one step up
   the ladder if all of its questions were right first try, otherwise back to 1 day. Returns a new map. */
function grade(srs, firstTry, today, now) {
  const byLesson = {};
  Object.keys(firstTry).forEach(q => {
    const id = lessonOf(q);
    if (id && srs[id]) byLesson[id] = (byLesson[id] !== false) && !!firstTry[q];
  });
  const out = { ...srs };
  Object.keys(byLesson).forEach(id => { out[id] = entry(byLesson[id] ? srs[id].step + 1 : 0, today, now); });
  return out;
}

const SRS = { LADDER, REVIEW_CAP, lessonOf, enter, migrate, dueIds, pickReview, grade };
if (typeof module !== "undefined" && module.exports) module.exports = SRS; else root.SRS = SRS;
})(typeof window !== "undefined" ? window : globalThis);
