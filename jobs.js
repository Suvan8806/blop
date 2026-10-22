/* Job application tracker: validation, stats, streak and filters. Each application is
   { id, company, role, link, day, status, updatedAt } in S.jobs. Pure functions, tested in node. */
(function (root) {
const DAY_MS = 864e5;
const STATUSES = [["applied", "Applied"], ["oa", "OA"], ["phone", "Phone screen"], ["onsite", "Onsite"],
  ["offer", "Offer"], ["rejected", "Rejected"], ["ghosted", "Ghosted"]];
const STATUS_IDS = STATUSES.map(s => s[0]);
const NO_RESPONSE = ["applied", "ghosted"]; // everything else means the company answered
const DEFAULT_TARGET = 15, MIN_TARGET = 1, MAX_TARGET = 100;
const MAX_TEXT = 120, MAX_LINK = 500;
const MIN_DAY = 0, MAX_DAY = 200000; // 1970 .. year 2517

const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const validDay = d => Number.isInteger(d) && d >= MIN_DAY && d <= MAX_DAY;
const validStatus = s => STATUS_IDS.includes(s);
function statusName(id) { const s = STATUSES.find(x => x[0] === id); return s ? s[1] : STATUSES[0][1]; }
function clampTarget(n) { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.min(MAX_TARGET, Math.max(MIN_TARGET, v)) : DEFAULT_TARGET; }

/* Only http(s) links survive. A bare "example.com/job" gets https:// in front. */
function safeLink(v) {
  const s = text(v, MAX_LINK);
  if (!s) return "";
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".") ? u.href : "";
  } catch (e) { return ""; }
}

function newId(rand = Math.random, now = Date.now()) {
  return `j${now.toString(36)}${rand().toString(36).slice(2, 10).padEnd(8, "0")}`;
}

/* A new application from optional details. */
function create(fields, { id, day, now }) {
  const f = fields || {};
  return { id, company: text(f.company, MAX_TEXT), role: text(f.role, MAX_TEXT), link: safeLink(f.link),
    day: validDay(f.day) ? f.day : day, status: "applied", updatedAt: now };
}
/* Apply an edit to one application. Unknown or invalid fields are ignored. Returns a new list. */
function update(jobs, id, patch, now) {
  return jobs.map(j => {
    if (j.id !== id) return j;
    const p = patch || {}, out = { ...j, updatedAt: now };
    if ("company" in p) out.company = text(p.company, MAX_TEXT);
    if ("role" in p) out.role = text(p.role, MAX_TEXT);
    if ("link" in p) out.link = safeLink(p.link);
    if (validDay(p.day)) out.day = p.day;
    if (validStatus(p.status)) out.status = p.status;
    return out;
  });
}
function remove(jobs, id) { return jobs.filter(j => j.id !== id); }

/* Saved data from older versions or another device: keep valid entries, repair what's fixable. */
function sanitize(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter(j => j && typeof j === "object" && typeof j.id === "string" && j.id && validDay(j.day) && !seen.has(j.id) && seen.add(j.id))
    .map(j => ({ id: j.id, company: text(j.company, MAX_TEXT), role: text(j.role, MAX_TEXT), link: safeLink(j.link), day: j.day,
      status: validStatus(j.status) ? j.status : "applied", updatedAt: Number.isFinite(j.updatedAt) ? j.updatedAt : 0 }));
}

function countOn(jobs, day) { return jobs.filter(j => j.day === day).length; }

/* Days in a row with at least one application, ending today (or yesterday, so it survives until you apply today). */
function streak(jobs, today) {
  const days = new Set(jobs.map(j => j.day));
  let d = days.has(today) ? today : today - 1, n = 0;
  while (days.has(d)) { n++; d--; }
  return n;
}

/* Monday of the week a day falls in. */
function weekStart(day) { const dow = new Date(day * DAY_MS).getUTCDay(); return day - ((dow + 6) % 7); }

function stats(jobs, today) {
  const total = jobs.length;
  const responses = jobs.filter(j => !NO_RESPONSE.includes(j.status)).length;
  const wk = weekStart(today);
  const inRange = (a, b) => jobs.filter(j => j.day >= a && j.day < b).length;
  return { total, responses, rate: total ? Math.round(responses / total * 100) : 0,
    thisWeek: inRange(wk, wk + 7), lastWeek: inRange(wk - 7, wk) };
}

function counts(jobs) {
  const out = Object.fromEntries(STATUS_IDS.map(s => [s, 0]));
  jobs.forEach(j => { out[j.status] = (out[j.status] || 0) + 1; });
  return out;
}

/* Newest day first, then most recently logged (later in the list), so editing an item never moves it.
   Optionally one status, optionally a company (or role) search. */
function filter(jobs, { status = "all", q = "" } = {}) {
  const needle = q.trim().toLowerCase();
  return jobs.map((j, i) => [j, i])
    .filter(([j]) => status === "all" || j.status === status)
    .filter(([j]) => !needle || j.company.toLowerCase().includes(needle) || j.role.toLowerCase().includes(needle))
    .sort(([a, ia], [b, ib]) => b.day - a.day || ib - ia)
    .map(([j]) => j);
}

function dayFromISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const d = Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS;
  return validDay(d) && isoFromDay(d) === s ? d : null;
}
function isoFromDay(day) { return new Date(day * DAY_MS).toISOString().slice(0, 10); }

const Jobs = { STATUSES, STATUS_IDS, DEFAULT_TARGET, MIN_TARGET, MAX_TARGET, statusName, clampTarget, safeLink, newId,
  create, update, remove, sanitize, countOn, streak, weekStart, stats, counts, filter, dayFromISO, isoFromDay };
if (typeof module !== "undefined" && module.exports) module.exports = Jobs; else root.Jobs = Jobs;
})(typeof window !== "undefined" ? window : globalThis);
