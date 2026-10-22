/* Sync helpers with no DOM: config checks, input checks, auth-redirect URL handling, friendly error
   messages and the push scheduler (debounce, coalesce, retry later). Tested in node; used by sync.js. */
(function (root) {
const DEBOUNCE_MS = 2000;
const AUTH_PARAMS = ["code", "error", "error_code", "error_description", "access_token", "refresh_token",
  "expires_in", "expires_at", "token_type", "provider_token", "provider_refresh_token", "type"];

/* A secret key must never ship to browsers: new-style "sb_secret_..." keys, or a legacy JWT whose role
   is service_role. Sync refuses to start with one. */
function isSecretKey(key) {
  const k = String(key || "").trim();
  if (k.startsWith("sb_secret_")) return true;
  const part = k.split(".")[1];
  if (!part) return false;
  try {
    const json = typeof atob === "function" ? atob(part.replace(/-/g, "+").replace(/_/g, "/"))
      : Buffer.from(part, "base64").toString("utf8");
    return JSON.parse(json).role === "service_role";
  } catch (e) { return false; }
}
/* Sync is on only when config.js has both values, the URL is https (or a local dev server) and the key
   is the public anon/publishable one. */
function isConfigured(cfg) {
  if (!cfg || typeof cfg.supabaseUrl !== "string" || typeof cfg.supabaseAnonKey !== "string") return false;
  if (!cfg.supabaseUrl.trim() || !cfg.supabaseAnonKey.trim() || isSecretKey(cfg.supabaseAnonKey)) return false;
  try {
    const u = new URL(cfg.supabaseUrl.trim());
    return u.protocol === "https:" || (u.protocol === "http:" && ["127.0.0.1", "localhost"].includes(u.hostname));
  } catch (e) { return false; }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function cleanEmail(v) { const s = String(v || "").trim(); return s.length <= 254 && EMAIL.test(s) ? s : ""; }
/* The code from the email, digits only. Supabase sends 6 digits by default (up to 10 if configured). */
function cleanCode(v) { const s = String(v || "").replace(/\s+/g, ""); return /^\d{6,10}$/.test(s) ? s : ""; }

function parts(href) {
  const u = new URL(href);
  return { u, hash: new URLSearchParams(u.hash.replace(/^#/, "")) };
}
/* True when the page was opened by a sign-in redirect (PKCE ?code=, implicit #access_token=, or an error). */
function hasAuthParams(href) {
  try {
    const { u, hash } = parts(href);
    return ["code", "error", "error_description"].some(k => u.searchParams.has(k))
      || ["access_token", "error", "error_description"].some(k => hash.has(k));
  } catch (e) { return false; }
}
/* An error the auth server sent back in the redirect, if any. */
function authError(href) {
  try {
    const { u, hash } = parts(href);
    return u.searchParams.get("error_description") || hash.get("error_description")
      || u.searchParams.get("error") || hash.get("error") || "";
  } catch (e) { return ""; }
}
/* The same address without sign-in parameters, as a path for history.replaceState. */
function cleanUrl(href) {
  const { u, hash } = parts(href);
  AUTH_PARAMS.forEach(k => { u.searchParams.delete(k); hash.delete(k); });
  const q = u.searchParams.toString(), h = hash.toString();
  return u.pathname + (q ? `?${q}` : "") + (h ? `#${h}` : "");
}

/* Turn library and network errors into something a person can act on. */
function friendlyError(err) {
  const msg = String((err && (err.message || err.error_description || err.msg)) || err || "").toLowerCase();
  const status = err && (err.status || err.code);
  if (msg.includes("load sign-in")) return "Couldn’t load sign-in. Check your connection and try again.";
  if (msg.includes("offline")) return "You’re offline. Sync will run when you’re back online.";
  if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network request failed")
    || msg.includes("load failed") || msg.includes("abort") || msg.includes("timed out") || msg.includes("timeout"))
    return "Couldn’t reach the sync server. Check your connection and try again.";
  if (status === 429 || msg.includes("rate limit") || msg.includes("too many") || msg.includes("security purposes"))
    return "Too many tries. Wait a minute, then try again.";
  if (msg.includes("invalid api key") || msg.includes("no api key"))
    return "Sync isn’t set up correctly (the app’s Supabase key was rejected).";
  if (msg.includes("jwt") || msg.includes("session")) return "Your sign-in expired. Sign in again.";
  if (msg.includes("expired") || (msg.includes("invalid") && msg.includes("token")) || msg.includes("otp"))
    return "That code didn’t work. Check it, or ask for a new one.";
  if (msg.includes("provider is not enabled") || msg.includes("unsupported provider"))
    return "Google sign-in isn’t switched on for this app yet. Use the email code instead.";
  if (msg.includes("signups not allowed") || msg.includes("signup is disabled"))
    return "New sign-ups are turned off for this app.";
  if (status === 401) return "Sync isn’t set up correctly (the app’s Supabase key was rejected).";
  if (msg.includes("relation") || msg.includes("does not exist") || msg.includes("schema cache"))
    return "Sync isn’t set up correctly (the progress table is missing).";
  if (msg.includes("email")) return "Check the email address and try again.";
  return "Something went wrong. Try again in a moment.";
}

/* Runs `run` (an async push) about `delay` ms after the last soon(), never two at once. A request
   made while one is running is coalesced into one more run afterwards. A failed run stays pending
   until flush() is called again (for example when the browser comes back online). */
function createScheduler({ run, delay = DEBOUNCE_MS, setTimer = setTimeout, clearTimer = clearTimeout, onState = () => {} }) {
  let timer = null, running = null, again = false, pending = false, lastError = null;
  const report = () => onState({ pending, busy: !!running, error: lastError });
  function flush() {
    if (timer) { clearTimer(timer); timer = null; }
    if (running) { again = true; return running; }
    pending = false;
    running = (async () => {
      try { await run(); lastError = null; } catch (e) { pending = true; lastError = e; }
    })().then(() => {
      running = null;
      if (again) { again = false; flush(); return; } // the next run reports when it ends
      report();
    });
    report();
    return running;
  }
  function soon() {
    pending = true;
    if (timer) clearTimer(timer);
    timer = setTimer(() => { timer = null; flush(); }, delay);
    report();
  }
  return { soon, flush, get pending() { return pending; }, get busy() { return !!running; }, get error() { return lastError; } };
}

/* "just now", "5 min ago", "3 h ago", or a date. */
function agoText(ms, now) {
  if (!ms) return "Not yet";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "Just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const SyncLogic = { DEBOUNCE_MS, isSecretKey, isConfigured, cleanEmail, cleanCode, hasAuthParams, authError, cleanUrl, friendlyError, createScheduler, agoText };
if (typeof module !== "undefined" && module.exports) module.exports = SyncLogic; else root.SyncLogic = SyncLogic;
})(typeof window !== "undefined" ? window : globalThis);
