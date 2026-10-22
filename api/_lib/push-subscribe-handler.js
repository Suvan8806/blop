/* The /api/push-subscribe request flow. POST saves this browser's push subscription with the reminder time and
   time zone; DELETE removes it. Built from injectable fetch and env (test/push-handlers.test.js).
   Order: method -> same origin -> JSON -> config -> sign-in -> input -> write with the service-role key.
   Each user keeps at most MAX_SUBS_PER_USER subscriptions; adding one more drops the oldest. */
"use strict";
const core = require("./push-core.js");
const { bearerToken, sameOrigin } = require("./grade-core.js");
const { send, fail, createSupabase } = require("./push-http.js");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOW = "POST, DELETE, OPTIONS";

function createHandler({ fetch, env, log = (...a) => console.warn(...a) }) {
  const sb = createSupabase({ fetch, env });
  const q = encodeURIComponent;

  /* Make room for one more subscription: drop this user's oldest ones beyond the cap (not the one being saved). */
  async function enforceCap(uid, endpoint) {
    const rows = await sb.restJSON("GET", `push_subs?user_id=eq.${uid}&select=endpoint,created_at&order=created_at.asc`);
    const others = (Array.isArray(rows) ? rows : []).filter(r => r && r.endpoint !== endpoint);
    const extra = others.length - (core.MAX_SUBS_PER_USER - 1);
    for (const r of others.slice(0, Math.max(0, extra)))
      await sb.restJSON("DELETE", `push_subs?endpoint=eq.${q(r.endpoint)}&user_id=eq.${uid}`);
    return Math.max(0, extra);
  }
  async function subscribe(res, uid, body) {
    const v = core.validateSubscribe(body);
    if (!v.ok) return fail(res, v.status, v.error);
    const dropped = await enforceCap(uid, v.sub.endpoint);
    // last_sent_day isn't sent, so changing the time keeps today's "already reminded" mark.
    await sb.restJSON("POST", "push_subs?on_conflict=endpoint",
      { endpoint: v.sub.endpoint, user_id: uid, sub: v.sub, remind_time: v.time, tz: v.tz },
      "resolution=merge-duplicates,return=minimal");
    return send(res, 200, { ok: true, time: v.time, tz: v.tz, dropped });
  }
  async function unsubscribe(res, uid, body) {
    const v = core.validateUnsubscribe(body);
    if (!v.ok) return fail(res, v.status, v.error);
    await sb.restJSON("DELETE", `push_subs?endpoint=eq.${q(v.endpoint)}&user_id=eq.${uid}`);
    return send(res, 200, { ok: true });
  }

  return async function handler(req, res) {
    try {
      if (req.method === "OPTIONS") return send(res, 204, null, { Allow: ALLOW });
      if (req.method !== "POST" && req.method !== "DELETE") return fail(res, 405, "Use POST or DELETE.", { Allow: ALLOW });
      const headers = req.headers || {};
      if (!sameOrigin(headers)) return fail(res, 403, "Not allowed from this site.");
      if (!/^application\/json\b/i.test(String(headers["content-type"] || ""))) return fail(res, 415, "Send JSON.");
      if (!sb.configured()) return fail(res, 503, "Reminders aren’t set up on the server yet.");

      const token = bearerToken(headers.authorization);
      if (!token) return fail(res, 401, "Sign in to turn on reminders.");
      let uid;
      try { uid = await sb.userId(token); } catch (e) { log(`push-subscribe: auth check failed (${e.message})`); return fail(res, 503, "Couldn’t check your sign-in. Try again in a moment."); }
      if (!uid || !UUID.test(uid)) return fail(res, 401, "Your sign-in expired. Sign in again on the Profile tab.");

      let body;
      try { body = req.body; } catch (e) { return fail(res, 400, "Bad request."); }
      try {
        return req.method === "POST" ? await subscribe(res, uid, body) : await unsubscribe(res, uid, body);
      } catch (e) { log(`push-subscribe: database error (${e.message})`); return fail(res, 503, "Couldn’t save your reminder. Try again in a moment."); }
    } catch (e) {
      log(`push-subscribe: unexpected error (${e && e.name})`);
      return fail(res, 500, "Something went wrong. Try again in a moment.");
    }
  };
}

module.exports = { createHandler };
