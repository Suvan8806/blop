/* Profile tab "Sync" panel: not set up / sign in (Google or an email code) / signed in.
   Only the panel itself re-renders when sync state changes, so typing elsewhere isn't disturbed.
   All user text (email, error messages) goes through esc(). */
(() => {
if (!window.Blop || !window.Blop.S || !window.Blop.sync) return;
const B = window.Blop, SL = window.SyncLogic;
const { esc } = B;

const G_LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>`;

function statusText(s){
  if (s.syncing) return "Syncing…";
  if (s.offline) return `Offline · will sync when you’re back online${s.lastSynced ? ` (last ${SL.agoText(s.lastSynced, Date.now()).toLowerCase()})` : ""}`;
  return SL.agoText(s.lastSynced, Date.now());
}
function errorHTML(msg){ return msg ? `<p class="serr" role="alert">${esc(msg)}</p>` : ""; }

function signedInHTML(s){
  const email = s.user && s.user.email ? s.user.email : "your account";
  return `<h3>Sync</h3>
    <div class="srow"><span>Signed in as</span><b>${esc(email)}</b></div>
    <div class="srow"><span>Last synced</span><b aria-live="polite">${esc(statusText(s))}</b></div>
    ${errorHTML(s.offline ? s.error : s.syncError || s.error)}
    <button class="cta ghost" id="ssync" ${s.syncing ? "disabled" : ""}>${s.syncing ? "Syncing…" : "Sync now"}</button>
    <div class="jrow"><button class="linkish" id="sout" ${s.busy ? "disabled" : ""}>Sign out</button>
      <span class="fine">Signing out keeps your progress on this device.</span></div>
    <div class="jrow"><button class="linkish soft" id="soutclear" ${s.busy ? "disabled" : ""}>Sign out and clear this device</button>
      <span class="fine">For a shared device: removes progress, job applications and mock interviews from this device only. Your account keeps its copy.</span></div>`;
}
function signedOutHTML(s){
  const busy = s.busy ? "disabled" : "";
  const form = s.step === "code"
    ? `<form class="jform" id="scode" novalidate><p class="fine">We sent a code to <b>${esc(s.email)}</b>. It can take a minute to arrive.</p>
        <label>Code from the email<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="123456" aria-describedby="serr"></label>
        <button class="cta" type="submit" ${busy}>${s.busy ? "Checking…" : "Sign in"}</button></form>
       <button class="linkish soft" id="sback">Use a different email</button>`
    : `<form class="jform" id="semail" novalidate>
        <label>Email<input name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" value="${esc(s.email)}" placeholder="you@example.com"></label>
        <button class="cta ghost" type="submit" ${busy}>${s.busy ? "Sending…" : "Email me a code"}</button></form>`;
  return `<h3>Sign in to sync</h3>
    <p>Keep lessons, streak, reviews, your plan and job applications the same on your phone and laptop. Optional: everything works without it.</p>
    <button class="cta gbtn" id="sgoogle" ${busy}>${G_LOGO}<span>Continue with Google</span></button>
    <div class="or"><span>or get a 6-digit code by email</span></div>
    ${form}
    <div id="serr">${errorHTML(s.error)}</div>
    <p class="fine" style="margin-top:12px!important">On an iPhone home-screen app, the email code is the most reliable option: Google sign-in can finish in Safari instead of the app.</p>`;
}
function innerHTML(){
  const sy = B.sync, s = sy.state();
  if (!sy.configured) return `<h3>Sync</h3><p style="margin:0">Sync isn’t set up yet. Your progress is saved on this device.</p>`;
  if (s.phase === "checking") return `<h3>Sync</h3><p style="margin:0">Checking sign-in…</p>`;
  return s.user ? signedInHTML(s) : signedOutHTML(s);
}
function syncPanelHTML(){ return `<div class="panel" id="syncbox">${innerHTML()}</div>`; }

function bind(box){
  const on = (sel, ev, fn) => { const el = box.querySelector(sel); if (el) el[ev] = fn; };
  on("#sgoogle", "onclick", () => B.sync.google());
  on("#semail", "onsubmit", e => { e.preventDefault(); B.sync.sendCode(e.target.email.value); });
  on("#semail input", "oninput", e => B.sync.setEmail(e.target.value));
  on("#scode", "onsubmit", e => { e.preventDefault(); B.sync.verify(e.target.code.value); });
  on("#sback", "onclick", () => B.sync.back());
  on("#ssync", "onclick", () => B.sync.now());
  on("#sout", "onclick", () => B.sync.signOut());
  on("#soutclear", "onclick", () => {
    if (confirm("Sign out and clear this device? Progress, job applications and mock interviews are removed from this device. Your account keeps its synced copy.")) B.sync.signOutAndClear();
  });
}
/* Repaint the panel in place, keeping focus on the same control when it still exists, and moving
   it to the code field when that field first appears. */
let lastStep = "email";
function paint(){
  const box = document.getElementById("syncbox");
  if (!box) return;
  const a = document.activeElement;
  const focused = a && box.contains(a) ? (a.id || a.name || null) : null;
  box.innerHTML = innerHTML();
  bind(box);
  const step = B.sync.state().step;
  const el = step === "code" && lastStep !== "code" ? box.querySelector("#scode input")
    : focused && box.querySelector(`#${CSS.escape(focused)}, [name="${CSS.escape(focused)}"]`);
  lastStep = step;
  if (el) el.focus({ preventScroll: true });
}
B.sync.onChange(paint);

B.syncPanelHTML = syncPanelHTML;
B.bindSyncPanel = app => { const box = app.querySelector("#syncbox"); if (box) bind(box); };
})();
