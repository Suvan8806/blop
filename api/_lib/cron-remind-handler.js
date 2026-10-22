/* The /api/cron-remind run, called hourly by the GitHub Action (.github/workflows/remind.yml) with
   "Authorization: Bearer <CRON_SECRET>". For every saved subscription whose reminder time is due in its own
   time zone and that hasn't been reminded that day: claim the day (so overlapping runs can't double-send),
   look at the user's synced progress, and send a push only if today's goal isn't done yet. Subscriptions the
   push service says are gone (404/410) are deleted. fetch, env, web-push, the clock and the curriculum are
   injected for tests (test/push-handlers.test.js). */
"use strict";
const crypto = require("crypto");
const core = require("./push-core.js");
const { send, fail, createSupabase } = require("./push-http.js");

const RUN_BUDGET_MS = 45000;   // stop starting new sends after this; vercel.json maxDuration is 60 s
const SEND_TIMEOUT_MS = 10000;
const CONCURRENCY = 6;
const USERS_PER_QUERY = 50;
const MAX_SUBS = 10000;
const PUSH_TTL_S = 4 * 3600;   // a phone that's offline for a few hours still gets today's reminder
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Constant-time comparison of the presented bearer secret with CRON_SECRET (hashing first equalises lengths). */
function secretOk(header, secret) {
  const m = /^Bearer (\S+)$/.exec(typeof header === "string" ? header.trim() : "");
  if (!m || !secret) return false;
  const h = s => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(h(m[1]), h(secret));
}

function createHandler({ fetch, env, webPush, now = () => Date.now(), loadUnits = () => require("./curriculum.js").loadUnits(),
  log = (...a) => console.warn(...a), budgetMs = RUN_BUDGET_MS }) {
  const sb = createSupabase({ fetch, env });
  const E = sb.E, q = encodeURIComponent;

  async function progressByUser(ids) {
    const out = new Map();
    const valid = [...new Set(ids)].filter(id => UUID.test(id));
    for (let i = 0; i < valid.length; i += USERS_PER_QUERY) {
      const chunk = valid.slice(i, i + USERS_PER_QUERY);
      const rows = await sb.restJSON("GET", `progress?user_id=in.(${chunk.join(",")})&select=user_id,data`);
      (Array.isArray(rows) ? rows : []).forEach(r => { if (r && r.user_id) out.set(r.user_id, r.data); });
    }
    return out;
  }
  /* Mark the reminder's day as sent, unless another run already did. True when this run owns it. */
  async function claim(endpoint, date) {
    const rows = await sb.restJSON("PATCH", `push_subs?endpoint=eq.${q(endpoint)}&or=(last_sent_day.is.null,last_sent_day.neq.${date})`,
      { last_sent_day: date }, "return=representation");
    return Array.isArray(rows) && rows.length > 0;
  }
  async function unclaim(endpoint, previous) {
    try { await sb.restJSON("PATCH", `push_subs?endpoint=eq.${q(endpoint)}`, { last_sent_day: previous || null }, "return=minimal"); }
    catch (e) { log(`cron-remind: couldn't undo a claim (${e.message})`); }
  }

  async function remindOne(item, progress, units, vapid) {
    const { row, due } = item;
    if (!(await claim(row.endpoint, due.date))) return "skipped";
    const data = progress.get(row.user_id);
    const st = data === undefined ? { known: false } : core.goalStatus(data, due.day, units);
    if (st.known && st.left === 0) return "done";
    const v = core.validSubscription(row.sub);
    if (!v.ok) { await sb.restJSON("DELETE", `push_subs?endpoint=eq.${q(row.endpoint)}`); return "removed"; }
    try {
      await webPush.sendNotification(v.sub, core.payload(st), { TTL: PUSH_TTL_S, urgency: "normal", topic: "blopstreak",
        timeout: SEND_TIMEOUT_MS, vapidDetails: vapid });
      return "sent";
    } catch (e) {
      const code = e && e.statusCode;
      if (code === 404 || code === 410) { await sb.restJSON("DELETE", `push_subs?endpoint=eq.${q(row.endpoint)}`); return "removed"; }
      log(`cron-remind: push failed (${code || (e && e.name) || "error"})`);
      await unclaim(row.endpoint, row.last_sent_day);
      return "failed";
    }
  }

  async function run(t0) {
    const rows = await sb.restJSON("GET", `push_subs?select=endpoint,user_id,sub,remind_time,tz,last_sent_day&order=created_at.asc&limit=${MAX_SUBS}`);
    const all = Array.isArray(rows) ? rows : [];
    const at = now();
    const due = all.map(row => ({ row, due: core.dueNow({ remindTime: row.remind_time, tz: row.tz, lastSentDay: row.last_sent_day, now: at }) }))
      .filter(x => x.due.due);
    const counts = { total: all.length, due: due.length, sent: 0, done: 0, skipped: 0, removed: 0, failed: 0, deferred: 0 };
    if (!due.length) return counts;
    const progress = await progressByUser(due.map(x => x.row.user_id));
    const units = loadUnits();
    const vapid = { subject: E("VAPID_SUBJECT"), publicKey: E("VAPID_PUBLIC_KEY"), privateKey: E("VAPID_PRIVATE_KEY") };
    let next = 0;
    async function worker() {
      while (next < due.length) {
        if (Date.now() - t0 > budgetMs) { counts.deferred = due.length - next; next = due.length; return; }
        const item = due[next++];
        try { counts[await remindOne(item, progress, units, vapid)]++; }
        catch (e) { counts.failed++; log(`cron-remind: ${e.message}`); }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, due.length) }, worker));
    return counts;
  }

  return async function handler(req, res) {
    const t0 = Date.now();
    try {
      const secret = E("CRON_SECRET");
      if (!secret) return fail(res, 503, "CRON_SECRET isn’t set.");
      if (!secretOk((req.headers || {}).authorization, secret)) return fail(res, 401, "Unauthorized.");
      if (req.method !== "GET" && req.method !== "POST") return fail(res, 405, "Use GET or POST.", { Allow: "GET, POST" });
      if (!sb.url() || !E("SUPABASE_SERVICE_ROLE_KEY") || !E("VAPID_PUBLIC_KEY") || !E("VAPID_PRIVATE_KEY") || !E("VAPID_SUBJECT"))
        return fail(res, 503, "Reminders aren’t configured (Supabase or VAPID env vars missing).");
      const counts = await run(t0);
      return send(res, 200, { ok: true, ...counts });
    } catch (e) {
      log(`cron-remind: run failed (${e && e.message})`);
      return fail(res, 500, "Run failed.");
    }
  };
}

module.exports = { createHandler, secretOk };
