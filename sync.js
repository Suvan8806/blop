/* Optional login and cross-device sync with Supabase. localStorage stays the source the app reads from;
   this file pulls the account's copy, merges it in (merge.js), saves, and pushes the result back.
   supabase-js is only downloaded when config.js is filled in AND the user signs in (or already has a
   session), so offline and no-config users pay nothing. Nothing here ever blocks the UI. */
(() => {
if (!window.Blop || !window.Blop.S || !window.Merge || !window.SyncLogic) return; // old cached page: app.js copes
const B = window.Blop, SL = window.SyncLogic, Merge = window.Merge;
const CFG = window.BLOP_CONFIG || {};
const SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js";
const SDK_SRI = "sha384-TcHRA3zBbn+Lexh5n+Oil4guNPOS3rjNDpGRAN46u/s/mB2IZ50ceC6TYDU2yvgK";
const AUTH_KEY = "blop-auth";        // where supabase-js keeps the session on this device
const META_KEY = "blop-sync-meta";   // { lastSynced } for this device; not part of S, so it isn't synced
const TABLE = "progress";
const REQUEST_TIMEOUT_MS = 15000, MAX_CONFLICT_RETRIES = 3, RESYNC_AFTER_MS = 60000;

const configured = SL.isConfigured(CFG);
const listeners = new Set();
const st = { phase: configured ? "out" : "off", user: null, busy: false, error: "", offline: !navigator.onLine,
  lastSynced: readMeta().lastSynced || 0, syncing: false, syncError: "", step: "email", email: "" };
let sb = null, sdkPromise = null;

function readMeta(){ try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; } }
function writeMeta(m){ try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {} }
function changed(patch){ Object.assign(st, patch || {}); listeners.forEach(fn => { try { fn(st); } catch (e) {} }); }
function hasStoredSession(){ try { return !!localStorage.getItem(AUTH_KEY); } catch (e) { return false; } }

/* ---------- loading the library ---------- */
function loadSdk(){
  if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK_URL; s.integrity = SDK_SRI; s.crossOrigin = "anonymous"; s.async = true;
    s.onload = () => window.supabase && window.supabase.createClient ? resolve(window.supabase) : reject(new Error("Couldn't load sign-in"));
    s.onerror = () => { s.remove(); sdkPromise = null; reject(new Error("Couldn't load sign-in")); };
    document.head.appendChild(s);
  });
  return sdkPromise;
}
/* Every request gives up after 15 s so a bad connection can't leave sync hanging. */
function timedFetch(input, init){
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  if (init && init.signal) init.signal.addEventListener("abort", () => ctl.abort());
  return fetch(input, { ...(init || {}), signal: ctl.signal }).finally(() => clearTimeout(t));
}
async function client(){
  if (sb) return sb;
  const lib = await loadSdk();
  if (sb) return sb;
  sb = lib.createClient(CFG.supabaseUrl.trim(), CFG.supabaseAnonKey.trim(), {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce", storageKey: AUTH_KEY },
    global: { fetch: timedFetch }
  });
  sb.auth.onAuthStateChange((event, session) => {
    const user = session ? session.user : null;
    changed({ user, phase: user ? "in" : "out" });
    // Don't call Supabase inside this callback (it can deadlock the auth lock); run it next tick.
    if (user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) setTimeout(() => sched.flush(), 0);
  });
  return sb;
}

/* ---------- pull, merge, push ---------- */
const visibleState = () => { const { updatedAt, open, ...rest } = B.S; return JSON.stringify(rest); };
/* Pull the account's row, merge it into S, save, then write the merged state back. The write only
   succeeds if nobody else wrote since our read (updated_at must match); otherwise merge again. */
async function syncOnce(){
  if (!sb || !st.user) return;
  if (!navigator.onLine) throw new Error("offline");
  const uid = st.user.id;
  changed({ syncing: true });
  try {
    for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
      const { data: row, error } = await sb.from(TABLE).select("data, updated_at").eq("user_id", uid).maybeSingle();
      if (error) throw error;
      const before = visibleState();
      if (row && row.data) { B.replaceState(Merge.merge(B.S, row.data)); B.save(); }
      if (visibleState() !== before) refreshScreen();
      const payload = { data: B.S, updated_at: new Date().toISOString() };
      if (row) {
        const { data: done, error: e2 } = await sb.from(TABLE).update(payload).eq("user_id", uid).eq("updated_at", row.updated_at).select("updated_at");
        if (e2) throw e2;
        if (done && done.length) return synced();
      } else {
        const { error: e3 } = await sb.from(TABLE).insert({ user_id: uid, ...payload });
        if (!e3) return synced();
        if (e3.code !== "23505") throw e3; // 23505: another device created the row first
      }
    }
    throw new Error("Sync conflict, try again");
  } finally { changed({ syncing: false }); }
}
function synced(){
  const now = Date.now();
  writeMeta({ ...readMeta(), lastSynced: now });
  changed({ lastSynced: now, syncError: "" });
}
/* Re-render behind the scenes, but never under an open lesson (closing it re-renders anyway). */
function refreshScreen(){ if (!document.querySelector(".session")) B.render(); }

const sched = SL.createScheduler({
  run: syncOnce,
  onState: s => changed({ syncError: s.error ? SL.friendlyError(s.error) : "" })
});

/* ---------- sign in and out ---------- */
async function act(fn){
  if (st.busy) return;
  changed({ busy: true, error: "" });
  try { await fn(); changed({ busy: false }); }
  catch (e) { changed({ busy: false, error: SL.friendlyError(e) }); }
}
const google = () => act(async () => {
  const c = await client();
  const { error } = await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin } });
  if (error) throw error;
});
const sendCode = raw => act(async () => {
  const email = SL.cleanEmail(raw);
  if (!email) { changed({ error: "Enter a valid email address." }); return; }
  const c = await client();
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
  changed({ step: "code", email });
});
const verify = raw => act(async () => {
  const token = SL.cleanCode(raw);
  if (!token) { changed({ error: "Enter the 6-digit code from the email." }); return; }
  const c = await client();
  const { error } = await c.auth.verifyOtp({ email: st.email, token, type: "email" });
  if (error) throw error;
  changed({ step: "email" }); // onAuthStateChange signs in and starts a sync
});
/* Signing out only forgets the session on this device; progress stays in localStorage. */
const signOut = () => act(async () => {
  try { if (sb) await sb.auth.signOut({ scope: "local" }); }
  finally {
    try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
    changed({ user: null, phase: "out", step: "email" });
  }
});

/* ---------- start up ---------- */
async function init(){
  const href = location.href, fromRedirect = SL.hasAuthParams(href), redirectError = SL.authError(href);
  changed({ phase: "checking" });
  try {
    const c = await client();
    const { data, error } = await c.auth.getSession(); // also finishes a Google sign-in redirect
    if (fromRedirect) history.replaceState(history.state, "", SL.cleanUrl(href));
    const user = data && data.session ? data.session.user : null;
    changed({ user, phase: user ? "in" : "out", error: redirectError ? SL.friendlyError({ message: redirectError }) : error ? SL.friendlyError(error) : "" });
  } catch (e) {
    if (fromRedirect) history.replaceState(history.state, "", SL.cleanUrl(href));
    changed({ phase: "out", error: SL.friendlyError(e) });
  }
}
if (configured) {
  if (hasStoredSession() || SL.hasAuthParams(location.href)) init();
  window.addEventListener("online", () => { changed({ offline: false }); if (st.user) sched.flush(); });
  window.addEventListener("offline", () => changed({ offline: true }));
  document.addEventListener("visibilitychange", () => {
    if (!st.user) return;
    if (document.visibilityState === "hidden") { if (sched.pending) sched.flush(); }
    else if (Date.now() - st.lastSynced > RESYNC_AFTER_MS) sched.flush(); // pick up work from the other device
  });
}

B.sync = {
  configured,
  state: () => st,
  onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
  signedIn: () => !!st.user,
  soon: () => { if (st.user) sched.soon(); },
  now: () => { if (st.user) { changed({ syncError: "" }); sched.flush(); } },
  google, sendCode, verify, signOut,
  setEmail: email => { st.email = String(email || ""); },
  back: () => changed({ step: "email", error: "" })
};
})();
