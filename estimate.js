/* How long a lesson takes: reading the teach text at 200 words a minute, a fixed time per question by type, and a
   little overhead. Personalised by the learner's pace: S.pace keeps actual÷estimated (in percent) for the last
   lessons they timed; with at least 5 of them the median scales every estimate, clamped to 0.5×-2.5×.
   Pure, tested in node (test/estimate.test.js). The Learn rows and unit headers, the lesson's first screen, Today
   and the paths picker all use it, so the numbers agree. */
(function (root) {
"use strict";
const WPM = 200;
const OVERHEAD_SECS = 10;
const QUESTION_SECS = { mc: 15, gap: 15, order: 30, match: 40 };
const OTHER_QUESTION_SECS = 30; // any other or typed type
const MIN_RATIO = 0.5, MAX_RATIO = 2.5;
const MIN_SAMPLES = 5;
const KEEP_SAMPLES = 20;
const MIN_PCT = 10, MAX_PCT = 1000; // one sample's bounds, in percent (state.js LIMITS.PACE_* match)

const words = t => String(t || "").split(/\s+/).filter(Boolean).length;
const clampRatio = r => (Number.isFinite(r) && r > 0 ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, r)) : 1);

/* Unscaled seconds for a lesson { teach, qs: [{ type }] }. */
function baseSecs(lesson) {
  const l = lesson || {};
  const qs = Array.isArray(l.qs) ? l.qs : [];
  const qSecs = qs.reduce((a, q) => a + (QUESTION_SECS[q && q.type] || OTHER_QUESTION_SECS), 0);
  return words(l.teach) / WPM * 60 + qSecs + OVERHEAD_SECS;
}
/* Estimated whole seconds for a lesson, scaled by the learner's pace ratio (1 = no data). */
function lessonSecs(lesson, ratio = 1) { return Math.round(baseSecs(lesson) * clampRatio(ratio)); }
/* The pace ratio from S.pace, or 1 with fewer than MIN_SAMPLES. */
function paceRatio(pace) {
  const v = (Array.isArray(pace) ? pace : []).filter(n => Number.isFinite(n) && n > 0).slice(-KEEP_SAMPLES).sort((a, b) => a - b);
  if (v.length < MIN_SAMPLES) return 1;
  const m = v.length >> 1;
  return clampRatio((v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) / 100);
}
/* One pace sample: the time this lesson actually took ÷ its unscaled estimate, as a whole percent. */
function paceSample(actualSecs, lesson) {
  const pct = Math.round(actualSecs / baseSecs(lesson) * 100);
  return Number.isFinite(pct) ? Math.min(MAX_PCT, Math.max(MIN_PCT, pct)) : 100;
}
/* S.pace with one more sample, the last KEEP_SAMPLES kept. Returns a new array. */
function addSample(pace, pct) { return [...(Array.isArray(pace) ? pace : []), pct].slice(-KEEP_SAMPLES); }
function totalSecs(lessons, ratio = 1) { return (lessons || []).reduce((a, l) => a + lessonSecs(l, ratio), 0); }
/* Display: "~1 min", "~2 min" ... "~55 min", then "~1.5 h". */
function minutes(secs) { return Math.max(1, Math.round(secs / 60)); }
function label(secs) {
  const m = minutes(secs);
  return m < 60 ? `~${m} min` : `~${Math.round(m / 6) / 10} h`;
}

const Estimate = { WPM, OVERHEAD_SECS, QUESTION_SECS, OTHER_QUESTION_SECS, MIN_RATIO, MAX_RATIO, MIN_SAMPLES, KEEP_SAMPLES,
  baseSecs, lessonSecs, paceRatio, paceSample, addSample, totalSecs, minutes, label };
if (typeof module !== "undefined" && module.exports) module.exports = Estimate; else root.Estimate = Estimate;
})(typeof window !== "undefined" ? window : globalThis);
