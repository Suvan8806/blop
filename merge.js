/* Sync merge: combines this device's saved state with the copy stored in the account, so progress made
   on either side is kept. Pure functions, no DOM, tested in node. The rules (FEATURES.md item 1):
   - done: union. doneOn: earliest day per lesson. xp: max. miss: max per question.
   - streak/last: the pair from the side with the more recent `last`.
   - srs: per lesson, newer updatedAt. jobs: per id, newer updatedAt (tombstones included).
   - plan: newer updatedAt; for the same plan, targets merge per day with max.
   - times: union (as a multiset), last 20 kept. settings: newer settingsUpdatedAt.
   - day counters: same day -> max; otherwise the later day.
   - anything else (fields added later): the side with the newer top-level updatedAt.
   Ties are broken by comparing the values themselves, so merge(a, b) and merge(b, a) agree, except
   that device-only fields come from `local` and jobs keep local order first. */
(function (root) {
const St = typeof module !== "undefined" && module.exports ? require("./state.js") : root.BlopState;
const SETTINGS = St.SETTINGS_KEYS;
const KEEP_TIMES = 20;
const LOCAL_ONLY = ["open"]; // which unit is expanded on this screen
const KNOWN = new Set(["done", "doneOn", "xp", "streak", "last", "miss", "srs", "jobs", "plan", "times",
  "day", "dayLessons", "dayXp", "updatedAt", "settingsUpdatedAt", ...SETTINGS, ...LOCAL_ONLY]);

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const obj = v => (isObj(v) ? v : {});
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const stamp = x => (isObj(x) ? num(x.updatedAt) : 0);
const text = v => JSON.stringify(v === undefined ? null : v);
/* The newer of two values by a timestamp; on a tie, the one that sorts later as JSON (any fixed rule works). */
function newer(x, y, at = stamp) {
  const ax = at(x), ay = at(y);
  if (ax !== ay) return ax > ay ? x : y;
  return text(x) >= text(y) ? x : y;
}
const keys = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])];

function mergeDone(a, b) {
  const out = {};
  keys(a, b).forEach(id => { if (a[id] || b[id]) out[id] = true; });
  return out;
}
function mergeDoneOn(a, b) {
  const out = {};
  keys(a, b).forEach(id => {
    const days = [a[id], b[id]].filter(Number.isFinite);
    if (days.length) out[id] = Math.min(...days);
  });
  return out;
}
function mergeMiss(a, b) {
  const out = {};
  keys(a, b).forEach(q => { out[q] = Math.max(num(a[q]), num(b[q])); });
  return out;
}
/* Per key, the newer entry by updatedAt. Entries that aren't objects lose to ones that are. */
function mergeByStamp(a, b) {
  const out = {};
  keys(a, b).forEach(k => {
    const x = isObj(a[k]) ? a[k] : undefined, y = isObj(b[k]) ? b[k] : undefined;
    if (x || y) out[k] = !x ? y : !y ? x : newer(x, y);
  });
  return out;
}
/* Per id, the newer copy. On an exact tie a tombstone wins, so a delete isn't undone by a stale copy. */
function mergeJobs(a, b) {
  const valid = l => (Array.isArray(l) ? l : []).filter(j => isObj(j) && typeof j.id === "string" && j.id);
  const la = valid(a), lb = valid(b);
  const byB = new Map(lb.map(j => [j.id, j]));
  const pick = (x, y) => {
    if (!y) return x;
    if (stamp(x) !== stamp(y)) return stamp(x) > stamp(y) ? x : y;
    if (!!x.deleted !== !!y.deleted) return x.deleted ? x : y;
    return newer(x, y);
  };
  const seen = new Set(), out = [];
  la.forEach(j => { if (!seen.has(j.id)) { seen.add(j.id); out.push(pick(j, byB.get(j.id))); } });
  lb.forEach(j => { if (!seen.has(j.id)) { seen.add(j.id); out.push(j); } });
  return out;
}
function mergeTargets(a, b) {
  const out = {};
  keys(obj(a), obj(b)).forEach(d => {
    const v = [obj(a)[d], obj(b)[d]].filter(Number.isFinite);
    if (v.length) out[d] = Math.max(...v);
  });
  return out;
}
/* null means "never had a plan" and always loses to a real plan or an ended marker. */
function mergePlan(a, b) {
  const x = isObj(a) ? a : null, y = isObj(b) ? b : null;
  if (!x || !y) return x || y;
  const w = newer(x, y);
  if (!x.ended && !y.ended && x.id && x.id === y.id) return { ...w, targets: mergeTargets(x.targets, y.targets) };
  return w;
}
/* Lesson times carry no ids, so a time on both devices is the same sample: keep each value as many
   times as the side with more of it, in the newer side's order, then the last 20. */
function mergeTimes(base, other) {
  const ok = l => (Array.isArray(l) ? l : []).filter(Number.isFinite);
  const out = ok(base).slice(), count = new Map();
  out.forEach(t => count.set(t, (count.get(t) || 0) + 1));
  ok(other).forEach(t => {
    const c = count.get(t) || 0;
    if (c > 0) count.set(t, c - 1); else out.push(t);
  });
  return out.slice(-KEEP_TIMES);
}
function pickSettings(a, b) {
  const sub = s => Object.fromEntries(SETTINGS.filter(k => k in s).map(k => [k, s[k]]));
  const w = newer(a, b, s => num(s.settingsUpdatedAt));
  return { ...sub(w === a ? b : a), ...sub(w), settingsUpdatedAt: Math.max(num(a.settingsUpdatedAt), num(b.settingsUpdatedAt)) };
}
function pickStreak(a, b) {
  const la = num(a.last, -1), lb = num(b.last, -1);
  if (la !== lb) return la > lb ? { streak: num(a.streak), last: la } : { streak: num(b.streak), last: lb };
  return { streak: Math.max(num(a.streak), num(b.streak)), last: la };
}
function pickDay(a, b) {
  const da = num(a.day, -1), db = num(b.day, -1);
  if (da === db) return { day: da, dayLessons: Math.max(num(a.dayLessons), num(b.dayLessons)), dayXp: Math.max(num(a.dayXp), num(b.dayXp)) };
  const w = da > db ? a : b;
  return { day: Math.max(da, db), dayLessons: num(w.dayLessons), dayXp: num(w.dayXp) };
}

/* local: this device's state. remote: the account's copy (may be missing or malformed). Returns a new object. */
function merge(local, remote) {
  const a = obj(local), b = obj(remote);
  const top = newer(a, b);
  const out = {};
  keys(a, b).filter(k => !KNOWN.has(k)).forEach(k => {
    out[k] = !(k in b) ? a[k] : !(k in a) ? b[k] : top[k];
  });
  Object.assign(out, {
    done: mergeDone(obj(a.done), obj(b.done)),
    doneOn: mergeDoneOn(obj(a.doneOn), obj(b.doneOn)),
    xp: Math.max(num(a.xp), num(b.xp)),
    ...pickStreak(a, b),
    miss: mergeMiss(obj(a.miss), obj(b.miss)),
    srs: mergeByStamp(obj(a.srs), obj(b.srs)),
    jobs: mergeJobs(a.jobs, b.jobs),
    plan: mergePlan(a.plan, b.plan),
    times: mergeTimes(top === a ? a.times : b.times, top === a ? b.times : a.times),
    ...pickSettings(a, b),
    ...pickDay(a, b),
    updatedAt: Math.max(num(a.updatedAt), num(b.updatedAt))
  });
  LOCAL_ONLY.forEach(k => { if (k in a) out[k] = a[k]; });
  return out;
}

const Merge = { merge, mergeJobs, mergePlan, mergeTimes, mergeByStamp, KEEP_TIMES };
if (typeof module !== "undefined" && module.exports) module.exports = Merge; else root.Merge = Merge;
})(typeof window !== "undefined" ? window : globalThis);
