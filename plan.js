/* Study plan: spreads the lessons you still need across the days left before your deadline.
   Pure functions, no DOM. Days are local day numbers (see today() in app.js). */
(function (root) {
const DAY_MS = 864e5;
const DEFAULT_LESSON_SECS = 120;
const MIN_SAMPLES = 3;
const HISTORY_DAYS = 7;

/* Lesson ids in the plan, in curriculum order, leaving out skipped units. */
function planOrder(units, skip) {
  const skipped = new Set(skip || []);
  return units.filter((u, ui) => !skipped.has(ui)).flatMap(u => u.lessons.map(l => l.id));
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
function setUnit(plan, skip, ui, on, unitCount) {
  const base = effectiveSkip(skip, plan.knownUnits, unitCount).filter(x => x !== ui);
  return { plan: { ...plan, knownUnits: unitCount }, skip: on ? base : [...base, ui].sort((a, b) => a - b) };
}
/* Old saved plans predate knownUnits. */
function migratePlan(plan) {
  if (!plan || typeof plan !== "object") return null;
  return Number.isInteger(plan.knownUnits) ? plan : { ...plan, knownUnits: UNITS_BEFORE_KNOWN };
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
  // Today only counts toward the pace once you've done something today, so mornings don't read as "late".
  const elapsed = Math.max(1, today - start + (doneToday ? 1 : 0));
  const pace = sinceStart / elapsed;
  const finishDay = !remaining.length ? today
    : pace > 0 ? today + Math.ceil(remaining.length / pace) - 1 : null;

  return { end, overdue, daysLeft, todayTarget, doneToday, todayLeft, plan, history,
           total: order.length, doneInPlan, remaining: remaining.length, pace, finishDay };
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

const Plan = { planOrder, effectiveSkip, setUnit, migratePlan, UNITS_BEFORE_KNOWN, lessonSecs, minutesFor, spread, schedule, preview, dayLabel, ymd, reminderICS, DEFAULT_LESSON_SECS };
if (typeof module !== "undefined" && module.exports) module.exports = Plan; else root.Plan = Plan;
})(typeof window !== "undefined" ? window : globalThis);
