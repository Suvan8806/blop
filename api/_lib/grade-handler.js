/* The /api/grade request flow, built from injectable fetch and env so it can be tested in node without
   calling Supabase, Groq or Gemini (test/grade-handler.test.js). api/grade.js wires in the real ones.
   Order: method -> same origin -> sign-in -> input -> config -> daily limit -> Groq, then Gemini on failure.
   Never logs the answer, the token or any key. */
"use strict";
const crypto = require("crypto");
const core = require("./grade-core.js");

const AUTH_TIMEOUT_MS = 5000;    // each Supabase call
const REQUEST_BUDGET_MS = 27000; // the whole request, under vercel.json maxDuration (30 s)
const TOTAL_LLM_MS = 25000;      // all model calls together, further capped by what's left of the budget
const GROQ_MAX_MS = 15000;       // leaves Gemini at least 10 s
const MIN_FALLBACK_MS = 3000;

function send(res, status, body, extraHeaders) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  Object.entries(extraHeaders || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.end(body === null ? "" : JSON.stringify(body));
}
const fail = (res, status, error, headers) => send(res, status, { ok: false, error }, headers);

function createHandler({ fetch, env, log = (...a) => console.warn(...a), nonce = () => crypto.randomBytes(9).toString("hex"),
  totalMs = TOTAL_LLM_MS, groqMaxMs = GROQ_MAX_MS, budgetMs = REQUEST_BUDGET_MS }) {
  async function timed(url, init, ms) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
  }
  const E = k => (typeof env[k] === "string" ? env[k].trim() : "");
  const supabaseUrl = () => { const u = E("SUPABASE_URL").replace(/\/+$/, ""); return /^https:\/\//.test(u) ? u : ""; };

  /* The signed-in user's id, null for a bad token, or throws when Supabase can't be reached. */
  async function userId(token) {
    const r = await timed(`${supabaseUrl()}/auth/v1/user`, { headers: { apikey: E("SUPABASE_ANON_KEY"), Authorization: `Bearer ${token}` } }, AUTH_TIMEOUT_MS);
    if (r.status === 401 || r.status === 403) return null;
    if (!r.ok) throw new Error(`auth ${r.status}`);
    const u = await r.json().catch(() => null);
    return u && typeof u.id === "string" && u.id ? u.id : null;
  }
  function rpc(name, uid) {
    const key = E("SUPABASE_SERVICE_ROLE_KEY");
    const headers = { apikey: key, "Content-Type": "application/json" };
    if (key.split(".").length === 3) headers.Authorization = `Bearer ${key}`; // legacy JWT keys; new sb_secret_ keys go in apikey only
    return timed(`${supabaseUrl()}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify({ uid }) }, AUTH_TIMEOUT_MS);
  }
  /* Today's grade count for this user after adding one (atomic, in Postgres). */
  async function bumpUsage(uid) {
    const r = await rpc("increment_grade_usage", uid);
    if (!r.ok) throw new Error(`usage ${r.status}`);
    const n = Number(await r.json());
    if (!Number.isInteger(n)) throw new Error("usage shape");
    return n;
  }
  /* Give the grade back when none was delivered. Best effort: a failure here only costs the user one grade. */
  async function refund(uid) {
    try { const r = await rpc("refund_grade_usage", uid); if (!r.ok) log(`grade: refund failed (${r.status})`); }
    catch (e) { log("grade: refund failed (network)"); }
  }
  /* One provider attempt -> { result } or { why } (an HTTP status, "timeout", "network" or "malformed"). */
  async function callModel(p, messages, prompt, ms) {
    let r;
    try {
      r = await timed(p.url, { method: "POST", headers: { Authorization: `Bearer ${E(p.envKey)}`, "Content-Type": "application/json" },
        body: JSON.stringify(core.requestBody(p, messages)) }, ms);
    } catch (e) { return { why: e && e.name === "AbortError" ? "timeout" : "network" }; }
    if (!r.ok) return { why: r.status };
    const data = await r.json().catch(() => null);
    const result = core.gradeFromCompletion(data, prompt);
    return result ? { result } : { why: "malformed" };
  }
  /* Groq first; Gemini when Groq fails in any way (429, 5xx, timeout, bad JSON) and a key is set. */
  async function grade(prompt, answer, budget) {
    const messages = core.buildMessages(prompt, answer, nonce());
    const started = Date.now(), limit = Math.min(totalMs, budget), left = () => limit - (Date.now() - started);
    const order = [core.PROVIDERS.groq, core.PROVIDERS.gemini].filter(p => E(p.envKey));
    for (const p of order) {
      const ms = p.name === "groq" && order.length > 1 ? Math.min(groqMaxMs, left()) : left();
      if (p !== order[0] && ms < MIN_FALLBACK_MS) break; // not enough time left for a fallback to finish
      const out = await callModel(p, messages, prompt, ms);
      if (out.result) return { result: out.result, provider: p.name };
      log(`grade: ${p.name} failed (${out.why})`);
    }
    return null;
  }

  return async function handler(req, res) {
    const t0 = Date.now();
    let charged = null; // user id whose grade was counted, until one is delivered
    try {
      if (req.method === "OPTIONS") return send(res, 204, null, { Allow: "POST, OPTIONS" });
      if (req.method !== "POST") return fail(res, 405, "Use POST.", { Allow: "POST, OPTIONS" });
      const headers = req.headers || {};
      if (!core.sameOrigin(headers)) return fail(res, 403, "Not allowed from this site.");
      if (!/^application\/json\b/i.test(String(headers["content-type"] || ""))) return fail(res, 415, "Send JSON.");
      if (!supabaseUrl() || !E("SUPABASE_ANON_KEY")) return fail(res, 503, "Grading isn’t set up yet (sign-in isn’t configured on the server).");

      const token = core.bearerToken(headers.authorization);
      if (!token) return fail(res, 401, "Sign in to get your answer graded.");
      let uid;
      try { uid = await userId(token); } catch (e) { log(`grade: auth check failed (${e.message})`); return fail(res, 503, "Couldn’t check your sign-in. Try again in a moment."); }
      if (!uid) return fail(res, 401, "Your sign-in expired. Sign in again on the Profile tab.");

      let body;
      try { body = req.body; } catch (e) { return fail(res, 400, "Bad request."); }
      const v = core.validateBody(body);
      if (!v.ok) return fail(res, v.status, v.error);

      if (!E("SUPABASE_SERVICE_ROLE_KEY") || !(E("GROQ_API_KEY") || E("GEMINI_API_KEY")))
        return fail(res, 503, "Grading isn’t set up yet (the grader keys are missing on the server).");
      let used;
      try { used = await bumpUsage(uid); } catch (e) { log(`grade: usage check failed (${e.message})`); return fail(res, 503, "Couldn’t check today’s grading limit. Try again in a moment."); }
      charged = uid;
      if (used > core.DAILY_LIMIT) { charged = null; return fail(res, 429, `You’ve used all ${core.DAILY_LIMIT} grades for today. More after midnight UTC.`); }

      const g = await grade(v.prompt, v.answer, budgetMs - (Date.now() - t0));
      if (!g) { charged = null; await refund(uid); return fail(res, 502, "The grader is busy right now. Your answer is still here, and this didn’t count toward today’s limit. Try again in a minute."); }
      charged = null;
      return send(res, 200, { ok: true, result: g.result, used, limit: core.DAILY_LIMIT });
    } catch (e) {
      log(`grade: unexpected error (${e && e.name})`);
      if (charged) await refund(charged);
      return fail(res, 500, "Something went wrong. Try again in a moment.");
    }
  };
}

module.exports = { createHandler, TOTAL_LLM_MS, GROQ_MAX_MS };
