/* Shared plumbing for the reminder functions: JSON responses, env reading, timed fetch, and Supabase calls
   (the user check with the anon key, PostgREST with the service-role key). fetch and env are injected so the
   handlers run in node tests with a stubbed network. Never logs tokens, keys or subscription endpoints. */
"use strict";

const SUPABASE_TIMEOUT_MS = 5000;

function send(res, status, body, extraHeaders) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  Object.entries(extraHeaders || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.end(body === null ? "" : JSON.stringify(body));
}
const fail = (res, status, error, headers) => send(res, status, { ok: false, error }, headers);

function createSupabase({ fetch, env }) {
  const E = k => (typeof env[k] === "string" ? env[k].trim() : "");
  const url = () => { const u = E("SUPABASE_URL").replace(/\/+$/, ""); return /^https:\/\//.test(u) ? u : ""; };
  async function timed(u, init, ms) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || SUPABASE_TIMEOUT_MS);
    try { return await fetch(u, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
  }
  /* The signed-in user's id, null for a bad token, or throws when Supabase can't be reached. */
  async function userId(token) {
    const r = await timed(`${url()}/auth/v1/user`, { headers: { apikey: E("SUPABASE_ANON_KEY"), Authorization: `Bearer ${token}` } });
    if (r.status === 401 || r.status === 403) return null;
    if (!r.ok) throw new Error(`auth ${r.status}`);
    const u = await r.json().catch(() => null);
    return u && typeof u.id === "string" && u.id ? u.id : null;
  }
  /* A PostgREST request with the service-role key (bypasses RLS). path starts after /rest/v1/. */
  function rest(method, path, body, prefer) {
    const key = E("SUPABASE_SERVICE_ROLE_KEY");
    const headers = { apikey: key, "Content-Type": "application/json" };
    if (key.split(".").length === 3) headers.Authorization = `Bearer ${key}`; // legacy JWT keys; sb_secret_ keys go in apikey only
    if (prefer) headers.Prefer = prefer;
    return timed(`${url()}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  async function restJSON(method, path, body, prefer) {
    const r = await rest(method, path, body, prefer);
    if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} ${r.status}`);
    return r.status === 204 ? null : r.json().catch(() => null);
  }
  const configured = () => !!(url() && E("SUPABASE_ANON_KEY") && E("SUPABASE_SERVICE_ROLE_KEY"));
  return { E, url, userId, rest, restJSON, configured };
}

module.exports = { send, fail, createSupabase };
