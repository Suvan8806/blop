/* Profile tab "Daily reminder" panel: turn streak reminders (Web Push) on or off for this device and pick the time.
   The subscription is saved to the signed-in account through /api/push-subscribe, and the hourly server run
   (/api/cron-remind) only sends one when today's goal isn't done. The time is the synced S.remind setting (also
   used by the calendar reminder on the Today tab); whether this device is subscribed is kept on this device only
   (blop-push in localStorage). Only this panel re-renders when its state changes. */
(() => {
if (!window.Blop || !window.Blop.S || !window.PushLogic) return; // old cached page: app.js copes
const B = window.Blop, PL = window.PushLogic, CFG = window.BLOP_CONFIG || {};
const { S, esc, setSettings, toast } = B;

const LOCAL_KEY = "blop-push";          // { on, time, tz, endpoint, user } for this device; not synced
const READY_TIMEOUT_MS = 10000, REQUEST_TIMEOUT_MS = 15000, CLEAR_TIMEOUT_MS = 4000;
const DENIED = "Notifications are blocked for blop. Allow them in your browser or phone settings (Settings → Notifications → blop on iPhone), then try again.";
const st = { busy: false, error: "" };

function env() {
  let displayStandalone = false;
  try { displayStandalone = !!(window.matchMedia && matchMedia("(display-mode: standalone)").matches); } catch (e) {}
  return { hasSW: "serviceWorker" in navigator, hasPush: "PushManager" in window, hasNotif: "Notification" in window,
    ua: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints || 0,
    standalone: navigator.standalone === true, displayStandalone };
}
function readLocal() { try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY)); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
function writeLocal(v) { try { if (v) localStorage.setItem(LOCAL_KEY, JSON.stringify(v)); else localStorage.removeItem(LOCAL_KEY); } catch (e) {} }
function userId() { const u = B.sync && B.sync.state().user; return u && u.id ? u.id : ""; }
function zone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } }

/* ios-install | unsupported | off (sign-in or push not configured) | checking | out | in */
function mode() {
  const s = PL.support(env());
  if (s !== "ok") return s;
  if (!PL.validKey(CFG.vapidPublicKey) || !B.sync || !B.sync.configured) return "off";
  if (B.sync.state().phase === "checking") return "checking";
  return B.sync.signedIn() ? "in" : "out";
}

/* ---------- browser and server calls ---------- */
function withTimeout(p, ms, msg) {
  return Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))]);
}
const swReady = () => withTimeout(navigator.serviceWorker.ready, READY_TIMEOUT_MS, "Couldn’t start notifications. Reload blop and try again.");
/* Notification.requestPermission returns a promise in current browsers and takes a callback in old Safari. */
function askPermission() {
  if (Notification.permission === "granted") return Promise.resolve("granted");
  return new Promise(resolve => { const p = Notification.requestPermission(resolve); if (p && p.then) p.then(resolve, () => resolve("default")); });
}
async function api(method, body) {
  const token = await B.sync.token();
  if (!token) throw new Error("Your sign-in expired. Sign in again above.");
  return request(method, body, token, REQUEST_TIMEOUT_MS);
}
async function request(method, body, token, timeoutMs) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  let r;
  try {
    r = await fetch("/api/push-subscribe", { method, signal: ctl.signal, credentials: "same-origin",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  } catch (e) { throw new Error(navigator.onLine ? "Couldn’t reach blop. Try again in a moment." : "You’re offline. Try again when you’re back online."); }
  finally { clearTimeout(t); }
  const data = await r.json().catch(() => null);
  if (!r.ok || !data || !data.ok) throw new Error(data && typeof data.error === "string" ? data.error.slice(0, 200) : "Couldn’t save your reminder. Try again in a moment.");
  return data;
}
async function save(sub) {
  const time = S.remind, tz = zone();
  const user = userId();
  await api("POST", PL.subscribeBody(sub.toJSON(), time, tz));
  writeLocal({ on: true, time, tz, endpoint: sub.endpoint, user });
}

/* ---------- actions ---------- */
async function act(fn) {
  if (st.busy) return;
  st.busy = true; st.error = ""; paint();
  try { await fn(); } catch (e) { st.error = e && e.message ? e.message : "Something went wrong. Try again."; }
  st.busy = false; paint();
}
function turnOn() {
  const perm = askPermission(); // asked straight from the tap, before anything async: Safari requires that
  return act(async () => {
    const p = await perm;
    if (p !== "granted") throw new Error(p === "denied" ? DENIED : "Allow notifications to turn on reminders.");
    const reg = await swReady();
    const sub = (await reg.pushManager.getSubscription())
      || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: PL.keyBytes(CFG.vapidPublicKey) });
    try { await save(sub); }
    catch (e) { try { await sub.unsubscribe(); } catch (x) {} throw e; }
    toast(`Reminder on: ${S.remind} on days you haven’t hit your goal.`);
  });
}
function turnOff() {
  return act(async () => {
    let sub = null;
    try { sub = await (await swReady()).pushManager.getSubscription(); } catch (e) {}
    const endpoint = sub ? sub.endpoint : readLocal().endpoint;
    let serverError = null;
    if (endpoint) { try { await api("DELETE", { endpoint }); } catch (e) { serverError = e; } }
    // Unsubscribing locally is enough on its own: the server deletes a subscription the push service says is gone.
    if (sub) { try { await sub.unsubscribe(); } catch (e) {} }
    writeLocal(null);
    toast(serverError ? "Reminders off on this device." : "Reminders off.");
  });
}
function changeTime(value) {
  if (!value || value === S.remind) return;
  if (!readLocal().on) { setSettings({ remind: value }); return paint(); }
  return act(async () => {
    setSettings({ remind: value }); // inside act, so the sync it triggers can't start a second save (reconcile)
    const sub = await (await swReady()).pushManager.getSubscription();
    if (!sub) { writeLocal(null); throw new Error("This device’s reminder was switched off by the browser. Turn it on again."); }
    await save(sub);
    toast(`Reminder moved to ${value}.`);
  });
}
/* After sign-in: if this device is subscribed but the time (changed on another device) or time zone moved,
   save it again; if the browser dropped the subscription, show it as off; if it was turned on by another account
   (signed out without clearing the device), unsubscribe it so this account doesn't get that account's reminders.
   Runs at most once a minute per account, and straight away when a different account signs in. */
const RECONCILE_EVERY_MS = 60000;
let reconciling = false, reconciledAt = 0, reconciledFor = "";
async function reconcile() {
  const saved = readLocal(), uid = userId();
  if (reconciling || st.busy || !saved.on || mode() !== "in" || !uid) return;
  if (uid === reconciledFor && Date.now() - reconciledAt < RECONCILE_EVERY_MS) return;
  reconciling = true; reconciledAt = Date.now(); reconciledFor = uid;
  try {
    const sub = await (await swReady()).pushManager.getSubscription();
    const action = PL.reconcileAction(saved, uid, sub ? sub.endpoint : "", S.remind, zone());
    if (action === "drop") { try { await sub.unsubscribe(); } catch (e) {} }
    if (action === "clear" || action === "drop") { writeLocal(null); paint(); }
    else if (action === "save") await save(sub);
  } catch (e) { /* tried again on the next sign-in or app open */ }
  finally { reconciling = false; }
}

/* "Sign out and clear this device" and the account-switch wipe: forget this device's reminder so the next person
   doesn't get the previous account's. getToken (optional) gives the still-valid token of the account being signed
   out, to delete the subscription on the server first (best effort, short timeout). Then the browser subscription
   is unsubscribed, which stops delivery on its own: the push service reports it gone and the server deletes it.
   blop-push is cleared before anything async, so a sign-in that follows can't re-save it for the new account. */
async function clearDevice(getToken) {
  const saved = readLocal();
  writeLocal(null);
  st.error = "";
  let sub = null;
  try {
    const reg = "serviceWorker" in navigator ? await withTimeout(navigator.serviceWorker.getRegistration(), CLEAR_TIMEOUT_MS, "timeout") : null;
    sub = reg && reg.pushManager ? await withTimeout(reg.pushManager.getSubscription(), CLEAR_TIMEOUT_MS, "timeout") : null;
  } catch (e) {}
  const plan = PL.cleanupPlan(saved, sub ? sub.endpoint : "");
  if (plan.deleteEndpoint && getToken) {
    try {
      const token = await withTimeout(Promise.resolve(getToken()), CLEAR_TIMEOUT_MS, "timeout");
      if (token) await request("DELETE", { endpoint: plan.deleteEndpoint }, token, CLEAR_TIMEOUT_MS);
    } catch (e) { /* unsubscribing below still stops delivery */ }
  }
  if (plan.unsubscribe) { try { await sub.unsubscribe(); } catch (e) {} }
  paint();
}

/* ---------- panel ---------- */
const CAL_HINT = "With a study plan, Plan settings on Today can add a daily event to your calendar instead.";
function innerHTML() {
  const head = `<h3>Reminders</h3>`, m = mode();
  const msg = text => `${head}<p style="margin:0">${text}</p>`;
  if (m === "ios-install") return msg("Add blop to your Home Screen first (Share → Add to Home Screen), then turn this on.");
  if (m === "unsupported") return msg(`This browser can’t show notifications. ${CAL_HINT}`);
  if (m === "off") return msg(`Reminders need sign-in, which isn’t set up on this copy of blop yet. ${CAL_HINT}`);
  if (m === "checking") return msg("Checking sign-in…");
  if (m === "out") return msg("Sign in to sync (above) to turn on reminders. They’re saved with your account, so blop can check whether today’s goal is done before nudging you.");
  const saved = readLocal(), on = !!saved.on, dis = st.busy ? "disabled" : "";
  const denied = !on && window.Notification && Notification.permission === "denied" && st.error !== DENIED;
  return `${head}<p>A notification at this time on days you haven’t hit your goal yet.</p>
    <div class="prow"><label class="switch"><input type="checkbox" role="switch" id="pushon" ${on ? "checked" : ""} ${dis}>
      <span>${st.busy ? "Saving…" : on ? "On" : "Off"}</span></label>
      <input type="time" id="pushat" class="ptime" value="${esc(S.remind)}" aria-label="Reminder time" ${dis}></div>
    ${denied ? `<p class="fine">${esc(DENIED)}</p>` : ""}
    ${st.error ? `<p class="serr" role="alert">${esc(st.error)}</p>` : ""}
    <p class="fine" style="margin-top:10px!important">${on ? `On for this device at ${esc(S.remind)} (${esc(saved.tz || zone())}).`
      : "Turn it on on each device you want reminders on."}</p>`;
}
function remindPanelHTML() { return `<div class="panel" id="pushbox">${innerHTML()}</div>`; }
function bind(box) {
  const sw = box.querySelector("#pushon"), t = box.querySelector("#pushat");
  if (sw) sw.onchange = () => { if (sw.checked) turnOn(); else turnOff(); };
  if (t) t.onchange = () => changeTime(t.value);
}
function paint() {
  const box = document.getElementById("pushbox");
  if (!box) return;
  const focused = document.activeElement && box.contains(document.activeElement) ? document.activeElement.id : "";
  box.innerHTML = innerHTML();
  bind(box);
  const el = focused && box.querySelector(`#${focused}`);
  if (el) el.focus({ preventScroll: true });
}
if (B.sync && B.sync.onChange) B.sync.onChange(() => { paint(); reconcile(); });
// Sign-in may already have finished before this script ran, so check once now and whenever blop comes back.
setTimeout(reconcile, 0);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reconcile(); });

B.remindPanelHTML = remindPanelHTML;
B.clearPushDevice = clearDevice;
B.bindRemindPanel = app => { const box = app.querySelector("#pushbox"); if (box) bind(box); };
})();
