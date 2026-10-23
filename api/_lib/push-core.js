/* Pure helpers for the streak reminders (/api/push-subscribe and /api/cron-remind): checking a push subscription,
   a reminder time and a time zone, deciding whether a reminder is due now in the user's own time zone, whether
   today's goal is done, and the message to send. No network, no env, tested in node (test/push-core.test.js). */
"use strict";
const Plan = require("../../plan.js");
const St = require("../../state.js");
const Paths = require("../../paths.js");

const MAX_SUBS_PER_USER = 10;
const DUE_WINDOW_MIN = 60;   // a reminder goes out on the first hourly run in [remind time, remind time + 60 min)
const MAX_ENDPOINT = 2048;
const MAX_TZ = 64;
const MAX_BODY_CHARS = 8000;
const GOALS = [1, 2, 3, 5];
const DEFAULT_GOAL = 2;

/* Push services the browsers use. A subscription endpoint must be https on one of these, so the server never
   sends requests anywhere else (no SSRF through a made-up "subscription"). */
const PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
const PUSH_HOST_SUFFIXES = [".push.apple.com", ".notify.windows.com"];
function pushHostOk(host) {
  const h = String(host || "").toLowerCase();
  return PUSH_HOSTS.includes(h) || PUSH_HOST_SUFFIXES.some(s => h.endsWith(s) && h.length > s.length);
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const keyOk = (k, min, max) => typeof k === "string" && k.length >= min && k.length <= max && B64URL.test(k);

/* A PushSubscription's toJSON() -> { ok, sub: { endpoint, keys: { p256dh, auth } } } or { ok:false, error }.
   Only the fields web-push needs are kept. */
function validSubscription(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return { ok: false, error: "Missing subscription." };
  const endpoint = s.endpoint;
  if (typeof endpoint !== "string" || !endpoint || endpoint.length > MAX_ENDPOINT) return { ok: false, error: "Bad subscription endpoint." };
  let u;
  try { u = new URL(endpoint); } catch (e) { return { ok: false, error: "Bad subscription endpoint." }; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return { ok: false, error: "Bad subscription endpoint." };
  if (!pushHostOk(u.hostname)) return { ok: false, error: "Unknown push service." };
  const keys = s.keys;
  if (!keys || typeof keys !== "object" || !keyOk(keys.p256dh, 40, 200) || !keyOk(keys.auth, 8, 64))
    return { ok: false, error: "Bad subscription keys." };
  return { ok: true, sub: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } };
}

/* "HH:MM", 24-hour. */
function validTime(t) { return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t); }

/* An IANA time zone this runtime knows, e.g. "Europe/London". */
function validTz(tz) {
  if (typeof tz !== "string" || !tz || tz.length > MAX_TZ || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0); return true; } catch (e) { return false; }
}

/* POST body -> { ok, sub, time, tz }; DELETE body -> { ok, endpoint }; otherwise { ok:false, status, error }. */
function parseBody(body) {
  let b = body;
  if (typeof b === "string") {
    if (b.length > MAX_BODY_CHARS) return { ok: false, status: 413, error: "Request too large." };
    try { b = JSON.parse(b); } catch (e) { return { ok: false, status: 400, error: "Bad request." }; }
  }
  if (!b || typeof b !== "object" || Array.isArray(b)) return { ok: false, status: 400, error: "Bad request." };
  return { ok: true, body: b };
}
function validateSubscribe(raw) {
  const p = parseBody(raw);
  if (!p.ok) return p;
  const v = validSubscription(p.body.subscription);
  if (!v.ok) return { ok: false, status: 400, error: v.error };
  if (!validTime(p.body.time)) return { ok: false, status: 400, error: "Pick a reminder time." };
  if (!validTz(p.body.tz)) return { ok: false, status: 400, error: "Unknown time zone." };
  return { ok: true, sub: v.sub, time: p.body.time, tz: p.body.tz };
}
function validateUnsubscribe(raw) {
  const p = parseBody(raw);
  if (!p.ok) return p;
  const ep = p.body.endpoint;
  if (typeof ep !== "string" || !ep || ep.length > MAX_ENDPOINT) return { ok: false, status: 400, error: "Bad subscription endpoint." };
  return { ok: true, endpoint: ep };
}

/* Wall-clock date and time at `now` (ms) in a time zone: { date: "YYYY-MM-DD", day, minutes } where day is the
   local day number the app uses (days since 1970-01-01 of the local date, like today() in core.js) and minutes
   is minutes past local midnight. */
const fmtCache = new Map();
function formatter(tz) {
  if (!fmtCache.has(tz)) fmtCache.set(tz, new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }));
  return fmtCache.get(tz);
}
const pad = n => String(n).padStart(2, "0");
function dateOfDay(day) { const d = new Date(day * 864e5); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function localNow(now, tz) {
  const parts = Object.fromEntries(formatter(tz).formatToParts(new Date(now)).map(p => [p.type, p.value]));
  const day = Date.UTC(+parts.year, +parts.month - 1, +parts.day) / 864e5;
  return { date: dateOfDay(day), day, minutes: (+parts.hour % 24) * 60 + +parts.minute };
}

/* Is this subscription's reminder due now? Due when the local time is in [remind, remind + DUE_WINDOW_MIN)
   and no reminder went out for that day yet. A window that crosses midnight belongs to the day it started.
   -> { due, date, day } (date/day: the reminder's local day) or { due:false, why }. */
function dueNow({ remindTime, tz, lastSentDay, now }) {
  if (!validTime(remindTime) || !validTz(tz)) return { due: false, why: "invalid" };
  const t = localNow(now, tz);
  const [hh, mm] = remindTime.split(":").map(Number);
  const diff = (t.minutes - (hh * 60 + mm) + 1440) % 1440;
  if (diff >= DUE_WINDOW_MIN) return { due: false, why: "not-due" };
  const day = diff > t.minutes ? t.day - 1 : t.day;
  const date = dateOfDay(day);
  if (lastSentDay && String(lastSentDay).slice(0, 10) === date) return { due: false, why: "sent" };
  return { due: true, date, day };
}

/* Today's goal from a user's saved progress (the `progress.data` row), mirroring dayGoal() in core.js: the active
   plan's target for today when there is one (over the learning path, with a focus), otherwise the daily goal. units: the curriculum (logic.buildUnits).
   -> { known:true, done, goal, left, streak } or { known:false } when the data can't be read. */
function goalStatus(data, day, units) {
  try {
    if (!data || typeof data !== "object" || Array.isArray(data) || !Number.isInteger(day)) return { known: false };
    const s = St.clean(data);
    const last = s.last;
    const streak = last >= day - 1 ? s.streak : 0;
    const plan = Plan.migratePlan(data.plan, { unitCount: units.length });
    if (plan && Plan.isActive(plan)) {
      // With a learning focus the plan covers the path (paths.js), exactly as planIds() in core.js.
      const path = Paths.focusOrder(units, data.focus);
      const skip = Array.isArray(data.skip) ? data.skip.filter(x => Number.isInteger(x) && x >= 0 && x < units.length) : [];
      const order = path ? Plan.planOrder(units, [], path, Paths.PREREQS) : Plan.planOrder(units, Plan.effectiveSkip(skip, plan.knownUnits, units.length));
      const sch = Plan.schedule({ order, done: s.done, doneOn: s.doneOn, today: day, start: plan.start, days: plan.days });
      if (sch.remaining + sch.doneToday > 0) return status(sch.doneToday, Math.max(1, sch.todayTarget), streak, true);
    }
    const goal = GOALS.includes(data.goal) ? data.goal : DEFAULT_GOAL;
    return status(s.day === day ? s.dayLessons : 0, goal, streak, false);
  } catch (e) { return { known: false }; }
}
function status(done, goal, streak, plan) { return { known: true, done, goal, left: Math.max(0, goal - done), streak, plan }; }

/* The notification text. A reminder is only sent when the goal isn't met (or unknown). */
function reminderMessage(st) {
  if (!st || !st.known) return "Time for today’s blop lessons.";
  const lessons = `${st.left} lesson${st.left === 1 ? "" : "s"} left today`;
  return st.streak > 0 ? `Keep your ${st.streak}-day streak: ${lessons}` : `Start a streak: ${lessons}`;
}
function payload(st) { return JSON.stringify({ title: "blop", body: reminderMessage(st), url: "/?tab=today", tag: "blop-streak" }); }

module.exports = { MAX_SUBS_PER_USER, DUE_WINDOW_MIN, PUSH_HOSTS, PUSH_HOST_SUFFIXES, pushHostOk, validSubscription, validTime, validTz,
  validateSubscribe, validateUnsubscribe, localNow, dateOfDay, dueNow, goalStatus, reminderMessage, payload };
