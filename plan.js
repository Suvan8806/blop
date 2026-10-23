/* Study plan: spreads the lessons you still need across the days left before your deadline.
   Pure functions, no DOM. Days are local day numbers (see today() in app.js). */
(function (root) {
const DAY_MS = 864e5;
const DEFAULT_LESSON_SECS = 120;
const MIN_SAMPLES = 3;
const HISTORY_DAYS = 7;
const KEEP_TARGET_DAYS = 400;

/* Lesson ids in the plan, in curriculum order, leaving out skipped units. units is indexed by unit index;
   a unit's optional display position `pos` (from logic.js) orders it, so the plan follows the Learn tab.
   unitOrder (optional): unit indices in the order to study them (a learning path from paths.js); only those
   units are planned, in that order. prereqs (optional, paths.js PREREQS): with it, a path that spans more than one
   subject is interleaved (see interleave), so a learner doesn't go weeks without coding. */
function planOrder(units, skip, unitOrder, prereqs) {
  const skipped = new Set(skip || []);
  if (Array.isArray(unitOrder)) {
    const seen = new Set();
    const list = unitOrder.filter(ui => units[ui] && !skipped.has(ui) && !seen.has(ui) && seen.add(ui)).map(ui => units[ui]);
    return prereqs && typeof prereqs === "object" ? interleave(list, prereqs) : list.flatMap(u => u.lessons.map(l => l.id));
  }
  return units.map((u, ui) => [u, ui]).filter(([, ui]) => !skipped.has(ui))
    .sort(([a, ai], [b, bi]) => (a.pos ?? ai) - (b.pos ?? bi))
    .flatMap(([u]) => u.lessons.map(l => l.id));
}

/* A path's lesson ids with its subjects interleaved: each turn takes the next CHUNK lessons (fewer at a unit's end)
   from the subject furthest behind its share of the path's lessons, ties going to the subject that comes first on
   the path. Within a subject the path's order holds, and a unit only starts once every unit on the path it builds on
   (prereqs, followed through units that aren't on the path) is fully placed. A subject that had to wait isn't owed
   the turns it missed (its share restarts from the others' progress), so it rejoins the rotation instead of arriving
   in one long burst. A single-subject path is unchanged. */
const CHUNK = 3;
function interleave(list, prereqs) {
  const units = list.filter(u => u.lessons.length);
  const subjects = [...new Set(units.map(u => u.tr))];
  if (subjects.length < 2) return units.flatMap(u => u.lessons.map(l => l.id));
  const onPath = new Set(units.map(u => u.title));
  const memo = new Map();
  const needs = t => { // titles on the path that t builds on, transitively
    if (memo.has(t)) return memo.get(t);
    const out = new Set();
    memo.set(t, out);
    (prereqs[t] || []).forEach(p => { if (onPath.has(p)) out.add(p); needs(p).forEach(x => out.add(x)); });
    return out;
  };
  // share: the fraction of the subject's lessons placed so far, as a running tag (weighted fair queueing).
  const queues = subjects.map(s => ({ units: units.filter(u => u.tr === s), at: 0, li: 0, share: 0 }));
  queues.forEach(q => { q.total = q.units.reduce((a, u) => a + u.lessons.length, 0); });
  const finished = new Set(), out = [];
  const head = q => q.units[q.at];
  const ready = q => !!head(q) && (q.li > 0 || [...needs(head(q).title)].every(t => finished.has(t)));
  let clock = 0;
  const tag = q => Math.max(q.share, clock);
  while (queues.some(head)) {
    let pick = queues.filter(ready).sort((a, b) => tag(a) - tag(b))[0];
    // Only reachable with an order that isn't topological: take the earliest unit on the path instead.
    if (!pick) pick = queues.filter(head).sort((a, b) => units.indexOf(head(a)) - units.indexOf(head(b)))[0];
    clock = tag(pick);
    let n = 0;
    while (n < CHUNK && head(pick)) {
      const u = head(pick);
      out.push(u.lessons[pick.li].id);
      pick.li++; n++;
      if (pick.li >= u.lessons.length) { finished.add(u.title); pick.at++; pick.li = 0; break; }
    }
    pick.share = clock + n / pick.total;
  }
  return out;
}

/* Units added after a plan was made (index >= knownUnits) count as skipped until the user ticks them,
   so new content never inflates an existing plan. */
const UNITS_BEFORE_KNOWN = 18; // units that existed before plans tracked knownUnits
function effectiveSkip(skip, knownUnits, unitCount) {
  const out = new Set(skip || []);
  for (let ui = knownUnits; ui < unitCount; ui++) out.add(ui);
  return [...out].sort((a, b) => a - b);
}
/* Tick (on) or untick a unit in an active plan's unit list. New units that weren't ticked stay skipped
   and the plan now knows every unit. Returns the new { plan, skip } without touching the inputs. */
function setUnit(plan, skip, ui, on, unitCount, now) {
  const base = effectiveSkip(skip, plan.knownUnits, unitCount).filter(x => x !== ui);
  return { plan: { ...plan, knownUnits: unitCount, updatedAt: Number.isFinite(now) ? now : plan.updatedAt },
    skip: on ? base : [...base, ui].sort((a, b) => a - b) };
}

/* A plan is { id, start, days, knownUnits, startRemaining, targets, updatedAt }. Ending one leaves
   { ended: true, updatedAt } so the ending can win a sync merge against an older copy of the plan. */
function isActive(plan) { return !!plan && typeof plan === "object" && !plan.ended; }
function create({ start, days, knownUnits, startRemaining, now, id }) {
  return { id: id || `p${start}-${now}`, start, days, knownUnits, startRemaining, targets: {}, updatedAt: now };
}
function ended(now) { return { ended: true, updatedAt: now }; }
/* Lessons in the plan that weren't done before it started: the ones left plus the ones done since.
   Used to estimate startRemaining for plans saved before it was stored. */
function estimateStartRemaining(order, done, doneOn, start) {
  return order.filter(id => !done[id] || doneOn[id] >= start).length;
}
/* Bounds for a plan, which may come from another device or an old build: a start day between 2019 and 2079,
   1..MAX_DAYS days, a short id and at most a year of recorded targets. Anything outside them would make
   schedule() build absurdly long arrays, so such a plan is dropped. */
const MIN_START = 18000, MAX_START = 40000, MAX_DAYS = 730, MAX_ID = 64, MAX_TARGET = 10000;
const validPlanShape = p => Number.isInteger(p.start) && p.start >= MIN_START && p.start <= MAX_START
  && Number.isInteger(p.days) && p.days >= 1 && p.days <= MAX_DAYS;
const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));
function cleanTargets(t) {
  if (!t || typeof t !== "object" || Array.isArray(t)) return {};
  const days = Object.keys(t).filter(k => /^\d{1,6}$/.test(k) && Number.isInteger(t[k]) && t[k] >= 0 && t[k] <= MAX_TARGET)
    .map(Number).filter(d => d >= MIN_START - KEEP_TARGET_DAYS && d <= MAX_START + MAX_DAYS)
    .sort((a, b) => b - a).slice(0, KEEP_TARGET_DAYS);
  return Object.fromEntries(days.sort((a, b) => a - b).map(d => [d, t[d]]));
}
/* Old saved plans predate knownUnits, updatedAt, id and startRemaining (core.js fills the last one in,
   since it needs the curriculum). limits: { unitCount, lessonCount } of this build, to clamp knownUnits and
   startRemaining. A plan that can't be repaired becomes null. Returns the same object when nothing needed changing. */
function migratePlan(plan, limits) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return null;
  const at = Number.isFinite(plan.updatedAt) && plan.updatedAt > 0 ? plan.updatedAt : 0;
  if (plan.ended) return plan.ended === true && plan.updatedAt === at && Object.keys(plan).length === 2 ? plan : ended(at);
  if (!validPlanShape(plan)) return null;
  const lim = limits || {};
  const units = Number.isInteger(lim.unitCount) ? lim.unitCount : Infinity;
  const lessons = Number.isInteger(lim.lessonCount) ? lim.lessonCount : MAX_TARGET;
  const out = { id: typeof plan.id === "string" && plan.id ? plan.id.slice(0, MAX_ID) : `p${plan.start}`,
    start: plan.start, days: plan.days,
    knownUnits: Number.isInteger(plan.knownUnits) ? clampInt(plan.knownUnits, 0, Math.min(units, 10000)) : Math.min(UNITS_BEFORE_KNOWN, units),
    targets: cleanTargets(plan.targets), updatedAt: at };
  if (Number.isFinite(plan.startRemaining)) out.startRemaining = clampInt(plan.startRemaining, 0, lessons);
  const same = Object.keys(out).length === Object.keys(plan).length
    && Object.keys(out).every(k => JSON.stringify(out[k]) === JSON.stringify(plan[k]));
  return same ? plan : out;
}

/* Median of your recent lesson times once there are enough of them, otherwise the default. */
function lessonSecs(times) {
  if (!times || times.length < MIN_SAMPLES) return DEFAULT_LESSON_SECS;
  const s = times.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function minutesFor(count, secs) { return count ? Math.max(1, Math.round(count * secs / 60)) : 0; }

/* Split n items over k days as evenly as possible, bigger days first. */
function spread(n, k) {
  if (k <= 0) return [];
  const base = Math.floor(n / k), extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

/* The core: today's target stays fixed for the whole day, everything after today is re-spread
   from what's actually left. Doing extra today lowers the future days, skipping a day raises them. */
function schedule({ order, done, doneOn, today, start, days }) {
  // Never build arrays sized by untrusted numbers: an out-of-range plan is an error the caller handles.
  if (!validPlanShape({ start, days }) || !Number.isInteger(today)) throw new RangeError("Plan out of range");
  const end = start + days - 1;
  const remaining = order.filter(id => !done[id]);
  const doneToday = order.filter(id => done[id] && doneOn[id] === today).length;
  const overdue = today > end;
  const daysLeft = overdue ? 1 : end - today + 1;
  const todayTarget = Math.ceil((remaining.length + doneToday) / daysLeft);
  const todayLeft = Math.min(remaining.length, Math.max(0, todayTarget - doneToday));
  const counts = [todayLeft, ...spread(remaining.length - todayLeft, daysLeft - 1)];

  const plan = [];
  let cursor = 0;
  counts.forEach((n, i) => {
    plan.push({ day: today + i, ids: remaining.slice(cursor, cursor + n) });
    cursor += n;
  });

  const history = [];
  for (let d = Math.max(start, today - HISTORY_DAYS); d < today; d++) {
    history.push({ day: d, did: order.filter(id => done[id] && doneOn[id] === d).length });
  }

  const doneInPlan = order.length - remaining.length;
  const sinceStart = order.filter(id => done[id] && doneOn[id] >= start).length;
  const p = projectFinish({ order, done, doneOn, today, start, days, remaining: remaining.length, doneToday });

  return { end, overdue, daysLeft, todayTarget, doneToday, todayLeft, plan, history, sinceStart,
           total: order.length, doneInPlan, remaining: remaining.length, ...p };
}

/* Pace and projected finish, from the last PACE_DAYS plan days (or since the start, if that's shorter).
   Today only counts once you've done something today, so mornings don't read as "late".
   projection: "done" (nothing left), "hidden" (fewer than MIN_PACE_DAYS days of data), "behind" (no
   progress lately, or a finish more than LATE_FACTOR times the plan's length after its start), or "date".
   finishDay is set only for "done" and "date". */
const PACE_DAYS = 7, MIN_PACE_DAYS = 2, LATE_FACTOR = 2;
function projectFinish({ order, done, doneOn, today, start, days, remaining, doneToday }) {
  const last = doneToday ? today : today - 1;            // last day that counts
  const from = Math.max(start, last - PACE_DAYS + 1);
  const paceDays = Math.max(0, last - from + 1);
  const recent = order.filter(id => done[id] && doneOn[id] >= from && doneOn[id] <= last).length;
  const pace = paceDays ? recent / paceDays : 0;
  if (!remaining) return { pace, paceDays, projection: "done", finishDay: today };
  if (paceDays < MIN_PACE_DAYS) return { pace, paceDays, projection: "hidden", finishDay: null };
  const finishDay = pace > 0 ? today + Math.ceil(remaining / pace) - 1 : null;
  if (finishDay === null || finishDay - start + 1 > LATE_FACTOR * days) return { pace, paceDays, projection: "behind", finishDay: null };
  return { pace, paceDays, projection: "date", finishDay };
}

/* Lessons ahead of (+) or behind (-) an even pace from the plan's start. Work today only counts as
   ahead once today's target is met, so a half-done day never reads as behind. */
function aheadBy(s, start, days, today) {
  const atStart = s.remaining + s.sinceStart;               // lessons left when the plan began
  const daysLeftAtDawn = Math.max(0, start + days - today);  // including today
  const expected = atStart * daysLeftAtDawn / days;          // what should be left this morning
  const actual = s.remaining + s.doneToday;                  // what was left this morning
  return Math.round(expected - actual + Math.max(0, s.doneToday - s.todayTarget));
}

/* Remember each day's target so the calendar can judge past days. Keeps about a year (KEEP_TARGET_DAYS). */
function recordTarget(targets, day, target) {
  const t = targets && typeof targets === "object" ? targets : {};
  if (t[day] === target) return t;
  const out = { [day]: target };
  Object.keys(t).forEach(k => { if (+k !== day && +k > day - KEEP_TARGET_DAYS) out[k] = t[k]; });
  return out;
}

/* Target for a past plan day in the calendar. A recorded target wins; days the app wasn't opened fall
   back to the plan's original even pace (lessons left at the start over its length). With nothing in
   the plan (total 0) past days aren't judged, so they never show as missed. */
function pastTarget({ targets, day, startRemaining, days, total }) {
  if (!total) return null;
  const t = targets && targets[day];
  if (Number.isFinite(t)) return t;
  const left = Number.isFinite(startRemaining) ? startRemaining : total;
  return left > 0 ? Math.max(1, Math.ceil(left / Math.max(1, days))) : 0;
}

/* Calendar month: the day number of the 1st, how many days, and the weekday of the 1st (0 = Sunday). */
function monthInfo(year, month) {
  const first = Date.UTC(year, month, 1) / DAY_MS;
  const count = (Date.UTC(year, month + 1, 1) / DAY_MS) - first;
  return { first, count, lead: dayDate(first).getUTCDay() };
}
function monthOf(day) { const d = dayDate(day); return { year: d.getUTCFullYear(), month: d.getUTCMonth() }; }

/* How a calendar day looks. target: lessons expected that day (0 = rest day, null = not judged).
   Returns done | partial | missed | today | upcoming | rest | off. */
function dayStatus({ day, today, did, target }) {
  if (target === null || target === undefined) return "off";
  if (day > today) return target ? "upcoming" : "rest";
  if (!target) return did ? "done" : "rest";
  if (did >= target) return "done";
  if (did > 0) return "partial";
  return day === today ? "today" : "missed";
}

/* Preview before a plan starts. */
function preview(total, days, secs) {
  const perDay = Math.ceil(total / days);
  return { perDay, minutes: minutesFor(perDay, secs) };
}

function dayDate(day) { return new Date(day * DAY_MS); } // read it with getUTC* to get the local date
function dayLabel(day, opts) {
  return dayDate(day).toLocaleDateString(undefined, Object.assign({ timeZone: "UTC" }, opts || { weekday: "short", month: "short", day: "numeric" }));
}
/* "Sat, Nov 20", with the year added ("Sat, Nov 20, 2027") when the day isn't in today's year. */
function dateLabel(day, today) {
  const yearOf = d => dayDate(d).getUTCFullYear();
  const opts = { weekday: "short", month: "short", day: "numeric" };
  return dayLabel(day, yearOf(day) === yearOf(today) ? opts : { ...opts, year: "numeric" });
}
function ymd(day) {
  const d = dayDate(day), p = n => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

/* A calendar file with one repeating daily event and an alert, from fromDay through endDay. */
function reminderICS({ fromDay, endDay: lastDay, time, minutes, url }) {
  const [hh, mm] = time.split(":");
  const endDay = Math.max(fromDay, lastDay);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//blop//study plan//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:blop-plan-${fromDay}-${endDay}@blop`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${ymd(fromDay)}T${hh}${mm}00`,
    `DURATION:PT${Math.max(5, minutes)}M`,
    `RRULE:FREQ=DAILY;UNTIL=${ymd(endDay)}T235959`,
    "SUMMARY:blop: today's lessons",
    `DESCRIPTION:Open blop to see how many lessons today's plan has. ${url}`,
    `URL:${url}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Time for today's blop lessons", "TRIGGER:PT0M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"
  ].map(foldLine).join("\r\n") + "\r\n";
}

/* RFC 5545: lines longer than 75 octets continue on the next line after a single space. */
function foldLine(line) {
  const max = 75;
  if (line.length <= max) return line;
  const parts = [line.slice(0, max)];
  for (let i = max; i < line.length; i += max - 1) parts.push(" " + line.slice(i, i + max - 1));
  return parts.join("\r\n");
}

const Plan = { CHUNK, interleave, MIN_START, MAX_START, MAX_DAYS, KEEP_TARGET_DAYS, isActive, create, ended, estimateStartRemaining, pastTarget, aheadBy, recordTarget, monthInfo, monthOf, dayStatus, planOrder, effectiveSkip, setUnit, migratePlan, UNITS_BEFORE_KNOWN, lessonSecs, minutesFor, spread, schedule, projectFinish, PACE_DAYS, MIN_PACE_DAYS, LATE_FACTOR, preview, dayLabel, dateLabel, ymd, reminderICS, DEFAULT_LESSON_SECS };
if (typeof module !== "undefined" && module.exports) module.exports = Plan; else root.Plan = Plan;
})(typeof window !== "undefined" ? window : globalThis);
