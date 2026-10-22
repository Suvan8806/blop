/* Sync merge: combines this device's saved state with the copy stored in the account, so progress made
   on either side is kept. Pure functions, no DOM, tested in node. The rules:
   - Study progress (done, doneOn, xp, miss, srs, times, streak, day counters) from a side whose
     progressUpdatedAt is older than the latest resetAt on either side is ignored, so a reset sticks.
   - done: union. doneOn: earliest day per lesson. miss: max per question.
   - xp: per device (xpLog), max per device; the total is the sum. Old data without xpLog counts as a base entry.
   - streak/last: the pair from the side with the more recent `last`.
   - srs: per lesson, newer updatedAt. jobs: per id, newer updatedAt (tombstones included).
   - mock (interview attempts): per id, newer updatedAt (tombstones included), then the newest KEEP_MOCK.
   - plan: newer updatedAt; for the same plan, targets merge per day with max.
   - times: union (as a multiset), last 20 kept. settings: newer settingsUpdatedAt.
   - day counters: same day -> max; otherwise the later day.
   - top-level fields that aren't in BlopState.KNOWN_KEYS are dropped.
   - every timestamp is capped at now + 1 day first, so a device with a clock far ahead can't win forever.
   Ties are broken by comparing the values themselves, so merge(a, b) and merge(b, a) agree, except
   that device-only fields come from `local` and jobs keep local order first. */
(function (root) {
const St = typeof module !== "undefined" && module.exports ? require("./state.js") : root.BlopState;
const SETTINGS = St.SETTINGS_KEYS;
const KEEP_TIMES = 20;
const KEEP_MOCK = 100; // same cap as mock.js MAX_ATTEMPTS
const MAX_SKEW_MS = 864e5; // timestamps more than a day ahead of this device's clock are capped
const LOCAL_ONLY = ["open"]; // which unit is expanded on this screen
const KNOWN = new Set(St.KNOWN_KEYS);

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
/* The newer copy of one item. On an exact tie a tombstone wins, so a delete isn't undone by a stale copy. */
function pickItem(x, y) {
  if (!y) return x;
  if (stamp(x) !== stamp(y)) return stamp(x) > stamp(y) ? x : y;
  if (!!x.deleted !== !!y.deleted) return x.deleted ? x : y;
  return newer(x, y);
}
const withIds = l => (Array.isArray(l) ? l : []).filter(j => isObj(j) && typeof j.id === "string" && j.id);
/* Per id, the newer copy (pickItem). Local order first, then items only the other side has. */
function mergeJobs(a, b) {
  const la = withIds(a), lb = withIds(b);
  const byB = new Map(lb.map(j => [j.id, j]));
  const pick = pickItem;
  const seen = new Set(), out = [];
  la.forEach(j => { if (!seen.has(j.id)) { seen.add(j.id); out.push(pick(j, byB.get(j.id))); } });
  lb.forEach(j => { if (!seen.has(j.id)) { seen.add(j.id); out.push(j); } });
  return out;
}
/* Mock interview attempts: per id like jobs, then newest first (ties by id) and capped, so both orders agree. */
function mergeMock(a, b) {
  const order = (x, y) => stamp(y) - stamp(x) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
  return mergeJobs(a, b).sort(order).slice(0, KEEP_MOCK);
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

/* A copy of one side with every timestamp capped at `limit`, and only known top-level fields. */
function capStamps(s, limit) {
  const cap = v => (Number.isFinite(v) ? Math.min(Math.max(v, 0), limit) : 0);
  const item = x => (isObj(x) && Number.isFinite(x.updatedAt) && x.updatedAt > limit ? { ...x, updatedAt: limit } : x);
  const out = {};
  Object.keys(s).forEach(k => { if (KNOWN.has(k)) out[k] = s[k]; });
  ["updatedAt", "settingsUpdatedAt", "resetAt", "progressUpdatedAt"].forEach(k => { if (k in out) out[k] = cap(out[k]); });
  if (isObj(out.plan)) out.plan = item(out.plan);
  if (isObj(out.srs)) out.srs = Object.fromEntries(Object.entries(out.srs).map(([k, v]) => [k, item(v)]));
  ["jobs", "mock"].forEach(k => { if (Array.isArray(out[k])) out[k] = out[k].map(item); });
  return out;
}
function mergeXpLog(a, b) {
  const x = St.xpLogOf(a), y = St.xpLogOf(b), out = {};
  keys(x, y).forEach(k => { out[k] = Math.max(num(x[k]), num(y[k])); });
  return out;
}

/* local: this device's state. remote: the account's copy (may be missing or malformed). now: this device's
   clock (ms). Returns a new object. */
function merge(local, remote, now = Date.now()) {
  const limit = (Number.isFinite(now) ? now : Date.now()) + MAX_SKEW_MS;
  const a = capStamps(obj(local), limit), b = capStamps(obj(remote), limit);
  const top = newer(a, b);
  // A reset on either side wins over progress that was last changed before it.
  const resetAt = Math.max(num(a.resetAt), num(b.resetAt));
  const kept = [a, b].filter(s => num(s.progressUpdatedAt) >= resetAt);
  const pa = kept.includes(a) ? a : {}, pb = kept.includes(b) ? b : {};
  const xpLog = mergeXpLog(pa, pb);
  const out = {
    done: mergeDone(obj(pa.done), obj(pb.done)),
    doneOn: mergeDoneOn(obj(pa.doneOn), obj(pb.doneOn)),
    xpLog,
    xp: St.sumXp(xpLog),
    ...pickStreak(pa, pb),
    miss: mergeMiss(obj(pa.miss), obj(pb.miss)),
    srs: mergeByStamp(obj(pa.srs), obj(pb.srs)),
    jobs: mergeJobs(a.jobs, b.jobs),
    mock: mergeMock(a.mock, b.mock),
    plan: mergePlan(a.plan, b.plan),
    times: mergeTimes(top === a ? pa.times : pb.times, top === a ? pb.times : pa.times),
    ...pickSettings(a, b),
    ...pickDay(pa, pb),
    resetAt,
    progressUpdatedAt: Math.max(resetAt, ...kept.map(s => num(s.progressUpdatedAt))),
    updatedAt: Math.max(num(a.updatedAt), num(b.updatedAt))
  };
  LOCAL_ONLY.forEach(k => { if (k in a) out[k] = a[k]; });
  return out;
}

const Merge = { MAX_SKEW_MS, merge, mergeJobs, mergeMock, mergePlan, mergeTimes, mergeByStamp, KEEP_TIMES, KEEP_MOCK };
if (typeof module !== "undefined" && module.exports) module.exports = Merge; else root.Merge = Merge;
})(typeof window !== "undefined" ? window : globalThis);
