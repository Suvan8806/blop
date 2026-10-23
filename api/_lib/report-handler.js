/* The /api/report request flow, built from injectable fetch and env (test/report.test.js).
   Order: method -> same origin -> JSON -> config -> input -> optional sign-in -> daily limit -> insert.
   Signing in is optional: a valid bearer token stores the user's id, anything else is anonymous. The daily limit
   counts the user's reports, or for anonymous ones the reports from the same salted IP hash. */
"use strict";
const core = require("./report-core.js");
const { bearerToken, sameOrigin } = require("./grade-core.js");
const { send, fail, createSupabase } = require("./push-http.js");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOW = "POST, OPTIONS";
const DAY_MS = 864e5;

function createHandler({ fetch, env, log = (...a) => console.warn(...a), now = () => Date.now() }) {
  const sb = createSupabase({ fetch, env });
  const configured = () => !!(sb.url() && sb.E("SUPABASE_SERVICE_ROLE_KEY") && core.saltOf(env));

  /* The signed-in user's id, or null (no token, a bad one, or the check failed). */
  async function userOf(headers) {
    const token = bearerToken(headers.authorization);
    if (!token || !sb.E("SUPABASE_ANON_KEY")) return null;
    try {
      const uid = await sb.userId(token);
      return uid && UUID.test(uid) ? uid : null;
    } catch (e) { log(`report: auth check failed (${e.message})`); return null; }
  }
  async function overLimit(uid, hash) {
    const since = encodeURIComponent(new Date(now() - DAY_MS).toISOString());
    const who = uid ? `user_id=eq.${uid}` : `reporter_hash=eq.${hash}&user_id=is.null`;
    const rows = await sb.restJSON("GET", `content_reports?select=id&${who}&created_at=gte.${since}&limit=${core.DAILY_LIMIT}`);
    return Array.isArray(rows) && rows.length >= core.DAILY_LIMIT;
  }

  return async function handler(req, res) {
    try {
      if (req.method === "OPTIONS") return send(res, 204, null, { Allow: ALLOW });
      if (req.method !== "POST") return fail(res, 405, "Use POST.", { Allow: ALLOW });
      const headers = req.headers || {};
      if (!sameOrigin(headers)) return fail(res, 403, "Not allowed from this site.");
      if (!/^application\/json\b/i.test(String(headers["content-type"] || ""))) return fail(res, 415, "Send JSON.");
      if (!configured()) return fail(res, 503, "Reports aren’t set up on the server yet.");

      let body;
      try { body = req.body; } catch (e) { return fail(res, 400, "Bad request."); }
      const v = core.validateReport(body);
      if (!v.ok) return fail(res, v.status, v.error);

      const uid = await userOf(headers);
      const hash = core.hashIp(core.clientIp(headers, req.socket), core.saltOf(env));
      try {
        if (await overLimit(uid, hash)) return fail(res, 429, "That’s a lot of reports for one day. Thanks! Try again tomorrow.");
        await sb.restJSON("POST", "content_reports", { ...v.row, user_id: uid, reporter_hash: hash }, "return=minimal");
      } catch (e) { log(`report: database error (${e.message})`); return fail(res, 503, "Couldn’t send the report. Try again in a moment."); }
      return send(res, 200, { ok: true });
    } catch (e) {
      log(`report: unexpected error (${e && e.name})`);
      return fail(res, 500, "Something went wrong. Try again in a moment.");
    }
  };
}

module.exports = { createHandler };
