/* Shape of the saved state S: which fields exist, which are study progress and which are settings,
   resetting progress, XP per device, and cleaning saved or synced data into safe bounds.
   Pure functions, no DOM, tested in node. core.js loads and saves S; merge.js merges two copies. */
(function (root) {
const DEFAULT_REMIND = "20:00"; // 8 pm: the daily reminder and the calendar alert
/* Settings travel together and carry S.settingsUpdatedAt, so the most recently changed side wins a merge. */
const SETTINGS_KEYS = ["goal", "jobTarget", "subject", "remind", "skip"];
/* Every top-level field S may have. Anything else (from an old build, another app, or a bad remote copy) is dropped.
   resetAt: when progress was last reset. progressUpdatedAt: when study progress last changed. */
const KNOWN_KEYS = ["done", "doneOn", "xp", "xpLog", "streak", "last", "miss", "srs", "jobs", "mock", "plan", "times",
  "day", "dayLessons", "dayXp", "updatedAt", "settingsUpdatedAt", "resetAt", "progressUpdatedAt", ...SETTINGS_KEYS, "open"];

/* XP is a counter per device ({ deviceId: xp earned there }), so two devices earning offline add up instead of
   one overwriting the other. XP from before per-device counting lives under BASE_XP_KEY: every device that
   already synced has the same total there, so merging it by max can't count it twice. */
const BASE_XP_KEY = "_base";

/* Bounds for data that may come from another device or an old build. */
const LIMITS = {
  KEY: 64,            // lesson / question / device id length
  ENTRIES: 10000,     // done, doneOn and srs entries (the app has a few hundred lessons)
  MISS_ENTRIES: 20000,
  DEVICES: 100,
  XP: 1e9,
  COUNT: 100000,      // streak, lessons in a day, missed count per question
  DAY: 200000,        // local day numbers (1970 .. year 2517)
  MIN_SECS: 15, MAX_SECS: 900, TIMES: 20
};

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const int = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);
const stamp = v => (Number.isFinite(v) && v > 0 ? v : 0);
const okKey = k => typeof k === "string" && k.length > 0 && k.length <= LIMITS.KEY;

/* Map entries with a valid key and a value `fix` accepts (fix returns undefined to drop), capped at max. */
function cleanMap(m, fix, max) {
  const out = {};
  if (!isObj(m)) return out;
  let n = 0;
  for (const k of Object.keys(m)) {
    if (n >= max) break;
    if (!okKey(k)) continue;
    const v = fix(m[k]);
    if (v !== undefined) { out[k] = v; n++; }
  }
  return out;
}

function sumXp(log) { return Object.values(isObj(log) ? log : {}).reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0); }
/* A side's per-device XP. Data from before per-device counting has only `xp`; it becomes the base entry. */
function xpLogOf(s) {
  const log = cleanMap(s && s.xpLog, v => int(v, 0, LIMITS.XP, undefined), LIMITS.DEVICES);
  if (Object.keys(log).length) return log;
  const xp = int(s && s.xp, 0, LIMITS.XP, 0);
  return xp ? { [BASE_XP_KEY]: xp } : {};
}
/* Add XP earned on this device. Returns the new { xpLog, xp } without touching the input. */
function addXp(s, deviceId, amount) {
  const log = xpLogOf(s), key = okKey(deviceId) ? deviceId : BASE_XP_KEY;
  const xpLog = { ...log, [key]: int((log[key] || 0) + amount, 0, LIMITS.XP, 0) };
  return { xpLog, xp: sumXp(xpLog) };
}

/* Keep only known fields, and put every study-progress number into a sane range. Settings, the plan, srs, jobs
   and mock attempts are checked by their own modules (core.js normalize). Returns a new object. */
function clean(raw) {
  const src = isObj(raw) ? raw : {};
  const out = {};
  KNOWN_KEYS.forEach(k => { if (k in src) out[k] = src[k]; });
  const day = v => (Number.isInteger(v) && v >= 0 && v <= LIMITS.DAY ? v : undefined);
  out.done = cleanMap(src.done, v => (v ? true : undefined), LIMITS.ENTRIES);
  out.doneOn = cleanMap(src.doneOn, day, LIMITS.ENTRIES);
  out.miss = cleanMap(src.miss, v => int(v, 0, LIMITS.COUNT, undefined), LIMITS.MISS_ENTRIES);
  out.times = (Array.isArray(src.times) ? src.times : []).filter(Number.isFinite).slice(-LIMITS.TIMES)
    .map(t => int(t, LIMITS.MIN_SECS, LIMITS.MAX_SECS, LIMITS.MIN_SECS));
  out.xpLog = xpLogOf(src);
  out.xp = sumXp(out.xpLog);
  out.streak = int(src.streak, 0, LIMITS.COUNT, 0);
  out.last = int(src.last, -1, LIMITS.DAY, -1);
  out.day = int(src.day, -1, LIMITS.DAY, -1);
  out.dayLessons = int(src.dayLessons, 0, LIMITS.COUNT, 0);
  out.dayXp = int(src.dayXp, 0, LIMITS.XP, 0);
  ["updatedAt", "settingsUpdatedAt", "resetAt", "progressUpdatedAt"].forEach(k => { out[k] = stamp(src[k]); });
  return out;
}

/* Everything "Reset progress" clears. The plan is handled separately (it's ended, not deleted). */
function progressDefaults() {
  return { done: {}, xp: 0, xpLog: {}, streak: 0, last: -1, miss: {}, srs: {}, doneOn: {}, times: [],
    day: -1, dayLessons: 0, dayXp: 0, open: null };
}

/* Clears study progress and ends any plan. Keeps job applications, mock history and settings. resetAt tells a sync
   merge to ignore progress from any copy that last changed before the reset. Returns a new object. */
function resetProgress(s, now) {
  const plan = s.plan ? { ended: true, updatedAt: now } : null;
  return { ...s, ...progressDefaults(), plan, resetAt: now, progressUpdatedAt: now, updatedAt: now };
}

/* Settings change: apply the patch and stamp it. Returns a new object. */
function withSettings(s, patch, now) {
  const out = { ...s, settingsUpdatedAt: now };
  Object.keys(patch || {}).forEach(k => { if (SETTINGS_KEYS.includes(k)) out[k] = patch[k]; });
  return out;
}

/* A reminder time "HH:MM", or the default. */
function validTime(t) { return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : DEFAULT_REMIND; }

const BlopState = { DEFAULT_REMIND, SETTINGS_KEYS, KNOWN_KEYS, BASE_XP_KEY, LIMITS, progressDefaults, resetProgress,
  withSettings, validTime, clean, sumXp, xpLogOf, addXp };
if (typeof module !== "undefined" && module.exports) module.exports = BlopState; else root.BlopState = BlopState;
})(typeof window !== "undefined" ? window : globalThis);
