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
const AUTH_KEY = "blop-auth";        // where supabase-js keeps the session on this device (plus "blop-auth-*" keys)
const META_KEY = "blop-sync-meta";   // { lastSynced, owner } for this device; not part of S, so it isn't synced.
                                     // owner: the user id this device's data was last synced with.
const TABLE = "progress";
const REQUEST_TIMEOUT_MS = 15000, MAX_CONFLICT_RETRIES = 3, RESYNC_AFTER_MS = 60000;

const configured = SL.isConfigured(CFG);
const listeners = new Set();
const st = { phase: configured ? "out" : "off", user: null, busy: false, error: "", offline: !navigator.onLine,
  lastSynced: readMeta().lastSynced || 0, syncing: false, syncError: "", step: "email", email: "" };
let sb = null, sdkPromise = null;
let adoptedId = null;  // the signed-in user whose data this device now syncs with
let declinedId = null; // a user who chose "keep this device's data" (so is being signed out); don't ask twice

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
    if (!user) { adoptedId = null; changed({ user: null, phase: "out" }); return; }
    // Don't call Supabase inside this callback (it can deadlock the auth lock); run it next tick.
    setTimeout(() => adopt(user, event === "SIGNED_IN" || event === "INITIAL_SESSION"), 0);
  });
  return sb;
}

/* A user is signed in. If this device's data was last synced with a different account, merging would copy it
   into this one, so ask first: start fresh (clear this device, then pull this account) or sign out. Nothing
   syncs until this has run, because st.user stays empty until then. */
function adopt(user, syncNow){
  if (adoptedId === user.id) { changed({ user, phase: "in" }); if (syncNow) sched.flush(); return; }
  if (declinedId === user.id) return;
  const meta = readMeta();
  if (SL.ownerCheck({ owner: meta.owner, userId: user.id, hasData: SL.hasLocalData(B.S) }) === "ask") {
    if (!confirm("This device has data from another account. Start fresh for this account?\n\n"
      + "OK clears this device’s progress, job applications and mock interviews, then loads this account. Cancel signs out and keeps them.")) {
      declinedId = user.id;
      signOutNow();
      return;
    }
    B.wipe();
    refreshScreen();
    writeMeta({ owner: user.id, lastSynced: 0 });
    changed({ lastSynced: 0 });
  } else writeMeta({ ...meta, owner: user.id });
  adoptedId = user.id;
  changed({ user, phase: "in" });
  sched.flush();
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
      const size = SL.checkPayload(B.S);
      if (!size.ok) throw new SL.PayloadTooLarge(size.bytes);
      // updated_at is set by the database (a trigger), so the compare-and-swap below only ever compares
      // server timestamps: the write succeeds only if the row still has the updated_at we just read.
      const payload = { data: B.S };
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
  declinedId = null;
  const c = await client();
  const { error } = await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin } });
  if (error) throw error;
});
const sendCode = raw => act(async () => {
  const email = SL.cleanEmail(raw);
  if (!email) { changed({ error: "Enter a valid email address." }); return; }
  declinedId = null;
  const c = await client();
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
  changed({ step: "code", email });
});
const verify = raw => act(async () => {
  const token = SL.cleanCode(raw);
  if (!token) { changed({ error: "Enter the 6-digit code from the email." }); return; }
  declinedId = null;
  const c = await client();
  const { error } = await c.auth.verifyOtp({ email: st.email, token, type: "email" });
  if (error) throw error;
  changed({ step: "email" }); // onAuthStateChange signs in and starts a sync
});
/* Every key supabase-js keeps for this app: the session, the user, and any PKCE code verifier. */
function clearAuthStorage(){
  try {
    const ks = [];
    for (let i = 0; i < localStorage.length; i++) ks.push(localStorage.key(i));
    ks.filter(k => SL.isAuthKey(k, AUTH_KEY)).forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}
/* Signing out only forgets the session on this device; progress stays in localStorage. No busy check, so it
   also works while a sign-in is finishing (the account-switch prompt). */
async function signOutNow(){
  adoptedId = null;
  try { if (sb) await sb.auth.signOut({ scope: "local" }); }
  catch (e) {}
  finally {
    clearAuthStorage();
    changed({ user: null, phase: "out", step: "email" });
  }
}
const signOut = () => act(signOutNow);
/* Sign out, then forget everything on this device: progress, jobs, mock attempts, drafts and settings. */
const signOutAndClear = () => act(async () => {
  await signOutNow();
  B.wipe();
  writeMeta({});
  changed({ lastSynced: 0 });
  B.render();
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
    // adopt() checks whose data is on this device before anything syncs. The onAuthStateChange handler
    // calls it too; whichever runs first decides and the other is a no-op.
    const msg = redirectError ? SL.friendlyError({ message: redirectError }) : error ? SL.friendlyError(error) : "";
    if (user) { changed({ error: msg }); setTimeout(() => adopt(user, false), 0); } // adopt() decides once per user
    else changed({ user: null, phase: "out", error: msg });
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
  /* A fresh access token for our own API (/api/grade), or "" when signed out. getSession refreshes an expired one. */
  token: async () => {
    if (!sb || !st.user) return "";
    const { data } = await sb.auth.getSession();
    return data && data.session && data.session.access_token ? data.session.access_token : "";
  },
  google, sendCode, verify, signOut, signOutAndClear,
  setEmail: email => { st.email = String(email || ""); },
  back: () => changed({ step: "email", error: "" })
};
})();
