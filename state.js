/* Shape of the saved state S: which fields are study progress, which are settings, and resetting
   progress. Pure functions, no DOM, tested in node. core.js loads and saves S; merge.js merges two copies. */
(function (root) {
const DEFAULT_REMIND = "19:00";
/* Settings travel together and carry S.settingsUpdatedAt, so the most recently changed side wins a merge. */
const SETTINGS_KEYS = ["goal", "jobTarget", "subject", "remind", "skip"];

/* Everything "Reset progress" clears. The plan is handled separately (it's ended, not deleted). */
function progressDefaults() {
  return { done: {}, xp: 0, streak: 0, last: -1, miss: {}, srs: {}, doneOn: {}, times: [],
    day: -1, dayLessons: 0, dayXp: 0, open: null };
}

/* Clears study progress and ends any plan. Keeps job applications and settings. Returns a new object. */
function resetProgress(s, now) {
  const plan = s.plan ? { ended: true, updatedAt: now } : null;
  return { ...s, ...progressDefaults(), plan, updatedAt: now };
}

/* Settings change: apply the patch and stamp it. Returns a new object. */
function withSettings(s, patch, now) {
  const out = { ...s, settingsUpdatedAt: now };
  Object.keys(patch || {}).forEach(k => { if (SETTINGS_KEYS.includes(k)) out[k] = patch[k]; });
  return out;
}

/* A reminder time "HH:MM", or the default. */
function validTime(t) { return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : DEFAULT_REMIND; }

const BlopState = { DEFAULT_REMIND, SETTINGS_KEYS, progressDefaults, resetProgress, withSettings, validTime };
if (typeof module !== "undefined" && module.exports) module.exports = BlopState; else root.BlopState = BlopState;
})(typeof window !== "undefined" ? window : globalThis);
