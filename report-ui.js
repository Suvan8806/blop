/* "Report a problem" sheet in a lesson session (the flag in the top bar, from session-nav.js). Sends
   POST /api/report with the lesson and question ids, the shown text, the app version and a reason/note. Works
   signed out; a sign-in token is attached when there is one. If the server can't take it (not set up, offline,
   an error), the sheet offers an email with the same details instead. */
(() => {
const B = window.Blop;
if (!B || !B.sessionNav) return;
const REASONS = [["wrong", "Wrong answer"], ["unclear", "Unclear"], ["typo", "Typo"], ["other", "Other"]];
const MAX_NOTE = 500;
const TIMEOUT_MS = 10000;
const EMAIL = "blop@bloplearn.space";

/* The service worker's cache name (sw.js CACHE, e.g. "blop-v16"), or "unknown". */
async function appVersion(){
  try {
    const keys = (await caches.keys()).filter(k => /^blop-v\d+$/.test(k));
    return keys.sort((a, b) => b.slice(6) - a.slice(6))[0] || "unknown";
  } catch (e) { return "unknown"; }
}
function mailto(p){
  const reason = (REASONS.find(r => r[0] === p.reason) || ["", p.reason])[1];
  const body = [`Lesson: ${p.lessonId}`, `Question: ${p.questionId}`, `Reason: ${reason}`, `Note: ${p.note || "-"}`,
    `App: ${p.appVersion}`, `Time: ${p.ts}`, "", "Shown text:", p.shownText].join("\n");
  return `mailto:${EMAIL}?subject=${encodeURIComponent(`blop report: ${p.questionId === "teach" ? p.lessonId : p.questionId}`)}&body=${encodeURIComponent(body)}`;
}
async function send(p){
  let token = "";
  try { if (B.sync && B.sync.token) token = await B.sync.token(); } catch (e) { token = ""; }
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch("/api/report", { method: "POST", headers, body: JSON.stringify(p), signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok && !!j.ok, error: typeof j.error === "string" ? j.error : "" };
  } catch (e) { return { status: 0, ok: false, error: "" }; }
  finally { clearTimeout(t); }
}

function open(host, ctx){
  let reason = "", busy = false;
  const what = ctx.questionId === "teach" ? "slide" : "question";
  const close = B.sessionNav.sheet(host, { label: "Report a problem", focus: ".nchip",
    html: `<p class="nsub">What’s wrong with this ${what}?</p>
      <div class="nchips" role="group" aria-label="Reason">${REASONS.map(([k, t]) =>
        `<button class="nchip" data-r="${k}" aria-pressed="false">${t}</button>`).join("")}</div>
      <label class="nlabel" for="nnote">Add a note (optional)</label>
      <textarea id="nnote" maxlength="${MAX_NOTE}" rows="3" placeholder="What should it say?"></textarea>
      <div class="ncount" aria-live="polite">0/${MAX_NOTE}</div>
      <p class="nerr" role="alert" hidden></p>
      <button class="cta" id="nsend" disabled>Send</button>` });
  const sh = close.el;
  const q = s => sh.querySelector(s);
  const chips = [...sh.querySelectorAll(".nchip")], note = q("#nnote"), sendBtn = q("#nsend"), err = q(".nerr");
  chips.forEach(c => c.onclick = () => {
    reason = c.dataset.r;
    chips.forEach(x => x.setAttribute("aria-pressed", String(x === c)));
    sendBtn.disabled = busy;
  });
  note.oninput = () => { q(".ncount").textContent = `${note.value.length}/${MAX_NOTE}`; };
  sendBtn.onclick = async () => {
    if (!reason || busy) return;
    busy = true; sendBtn.disabled = true; sendBtn.textContent = "Sending…"; err.hidden = true;
    const p = { ...ctx, reason, note: note.value.slice(0, MAX_NOTE), appVersion: await appVersion(), ts: new Date().toISOString() };
    const r = await send(p);
    busy = false; sendBtn.disabled = false; sendBtn.textContent = "Send";
    if (r.ok) { close(); B.toast("Thanks — we’ll check it"); return; }
    err.hidden = false;
    if (r.status === 400 || r.status === 413 || r.status === 429) { err.textContent = r.error || "Couldn’t send that. Check the note and try again."; return; }
    // Not set up, offline or failing: hand the same details to the mail app.
    err.innerHTML = `Couldn’t send it from here. <a href="${B.esc(mailto(p))}" id="nmail">Email it to us instead</a>.`;
    q("#nmail").focus();
  };
}

B.report = { open, mailto };
})();
