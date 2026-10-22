/* Mock tab: pick a question (by category or at random), answer it by typing or dictating, optionally
   against a timer, and get it graded by /api/grade. Past attempts per question show the score trend.
   Logic lives in mock.js and the questions in mock-prompts.js. Everything from the grader or another
   device is treated as untrusted text: it's clamped by Mock.clampResult and always rendered through esc(). */
(() => {
if (!window.Blop || !window.Blop.S || !window.Mock || !window.MockPrompts) return; // old cached page: app.js shows the reload screen
const B = window.Blop, MP = window.MockPrompts;
const { S, I, esc, commit, today, toast, plural } = B;

const DRAFTS_KEY = "blop-mock-drafts"; // { promptId: text } on this device only; a draft isn't synced
const GRADE_TIMEOUT_MS = 35000; // a little over the server function limit (30 s)
const TIMER_CHOICES = [0, 5, 10, 15];
const SHORT = { ml: "ML", sd: "Design", code: "Coding", behav: "Behavioral" };
const SPARK_MAX = 12;

let cat = MP.CATEGORIES[0].id;
let promptId = null;           // null: the question list; otherwise the question being answered
let busy = false, error = "", justGraded = null;
let timer = { mins: 0, endsAt: 0 }, tick = null;

/* ---------- drafts ---------- */
function readDrafts(){ try { const d = JSON.parse(localStorage.getItem(DRAFTS_KEY)); return d && typeof d === "object" ? d : {}; } catch (e) { return {}; } }
function draftOf(id){ const d = readDrafts()[id]; return typeof d === "string" ? d : ""; }
function saveDraft(id, text){
  const d = readDrafts();
  if (text) d[id] = text.slice(0, Mock.MAX_ANSWER + 500); else delete d[id];
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(d)); } catch (e) {}
}

/* ---------- sign-in gate ---------- */
function gate(){
  const sy = B.sync;
  if (!sy || !sy.configured) return "off";
  if (sy.state().phase === "checking") return "checking";
  return sy.signedIn() ? "in" : "out";
}
function gateHTML(g){
  if (g === "in") return "";
  const msg = g === "off" ? "Grading needs sign-in, and sign-in isn’t set up on this copy of blop yet."
    : g === "checking" ? "Checking sign-in…"
    : "Sign in on the Profile tab to get answers graded (it keeps grading fair: 20 a day per account).";
  return `<div class="mgate" role="status"><p>${esc(msg)} Your draft is saved on this device, so nothing you type is lost.</p>
    ${g === "out" ? `<button class="cta ghost" id="mgo">Go to sign in</button>` : ""}</div>`;
}

/* ---------- pieces ---------- */
const dateText = day => Plan.dateLabel(day, today());
const fmtScore = n => (Math.round(n * 10) / 10).toFixed(1);
function sparkHTML(scores){
  const s = scores.slice(-SPARK_MAX);
  return `<span class="mspark" role="img" aria-label="${esc(`Scores: ${s.map(fmtScore).join(", ")}`)}">${s.map(v =>
    `<i style="height:${Math.max(10, Math.round(v / Mock.SCORE_MAX * 100))}%"></i>`).join("")}</span>`;
}
function trendText(t){
  if (!t.count) return "Not tried yet";
  if (t.count === 1) return `1 attempt · ${fmtScore(t.last)}/5`;
  const sign = t.change > 0 ? "+" : t.change < 0 ? "−" : "±";
  return `${t.count} attempts · ${fmtScore(t.first)} → ${fmtScore(t.last)} (${sign}${fmtScore(Math.abs(t.change))}) · best ${fmtScore(t.best)}`;
}
function listItem(p){
  const t = Mock.trend(Mock.forPrompt(S.mock, p.id));
  const hasDraft = !!draftOf(p.id);
  return `<li><button class="mitem" data-prompt="${esc(p.id)}"><span class="mt">${esc(p.title)}</span>
    <span class="ms">${esc(trendText(t))}${hasDraft ? " · draft saved" : ""}</span>${t.count > 1 ? sparkHTML(t.scores) : ""}</button></li>`;
}
function progressHTML(){
  const rows = Mock.summary(S.mock).filter(r => MP.byId(r.promptId));
  if (!rows.length) return "";
  return `<div class="panel"><h3>Your progress</h3><p class="fine">Overall score per attempt, oldest to newest.</p>
    <ul class="mlist">${rows.map(r => `<li><button class="mitem" data-prompt="${esc(r.promptId)}"><span class="mt">${esc(MP.byId(r.promptId).title)}</span>
      <span class="ms">${esc(trendText(r))}</span>${sparkHTML(r.scores)}</button></li>`).join("")}</ul></div>`;
}
function headerHTML(title){
  const live = Mock.live(S.mock), todayCount = live.filter(a => a.day === today()).length;
  return `<div class="top"><div class="wrap"><h1>${esc(title)}</h1><div class="stats">
    <span class="pill" title="Graded answers">${I.chat}${plural(live.length, "attempt")}</span>
    <span class="pill" title="Answers graded today (your account can get 20 a day, counted in UTC)">${I.target}${todayCount} graded today</span></div></div></div>`;
}
function listHTML(){
  const ps = MP.inCategory(cat);
  return `${headerHTML("Mock interview")}<div class="wrap" id="mockroot">
    <div class="panel"><h3>Practice out loud, get graded</h3>
      <p style="margin:0">Pick a question and answer it as you would in an interview, typed or dictated. An AI grader scores it against a rubric
      and shows what a strong answer covers.</p>${gateHTML(gate())}</div>
    <div class="subj mcats" role="group" aria-label="Category">${MP.CATEGORIES.map(c =>
      `<button data-cat="${c.id}" aria-pressed="${cat === c.id}" title="${esc(c.name)}">${esc(SHORT[c.id] || c.name)}</button>`).join("")}</div>
    <div class="panel"><div class="mhead"><h3>${esc(MP.categoryName(cat))}</h3><button class="cta ghost mrand" id="mrand">Random</button></div>
      <ul class="mlist">${ps.map(listItem).join("")}</ul></div>
    ${progressHTML()}</div>`;
}

function resultHTML(r){
  const list = (title, items, tag) => items.length ? `<h4>${title}</h4><${tag}>${items.map(x => `<li>${esc(x)}</li>`).join("")}</${tag}>` : "";
  return `<div class="mres"><div class="mover"><b>${fmtScore(r.overall)}</b><span>/ 5 overall</span></div>
    <ul class="mscores">${r.scores.map(s => `<li><div class="mrow"><span>${esc(s.area)}</span><b>${esc(String(s.score))}/5</b></div>
      <div class="mbar" role="img" aria-label="${esc(`${s.score} out of 5`)}"><i class="s${Mock.parseScore(s.score)}" style="width:${Mock.parseScore(s.score) * 20}%"></i></div>
      ${s.note ? `<p>${esc(s.note)}</p>` : ""}</li>`).join("")}</ul>
    ${list("Strengths", r.strengths, "ul")}${list("What was missing", r.gaps, "ul")}${list("Model answer outline", r.outline, "ol")}</div>`;
}
function attemptHTML(a, n){
  const open = a.id === justGraded;
  return `<li><details class="matt" ${open ? "open" : ""}><summary><span>Attempt ${n} · ${esc(dateText(a.day))}</span><b>${fmtScore(a.result.overall)}/5</b></summary>
    ${resultHTML(a.result)}
    <h4>Your answer</h4><p class="mans-read">${esc(a.answer).replace(/\n/g, "<br>")}</p>
    <button class="linkish" data-mdel="${esc(a.id)}">Delete attempt</button></details></li>`;
}
function historyHTML(p){
  const atts = Mock.forPrompt(S.mock, p.id);
  if (!atts.length) return "";
  const t = Mock.trend(atts);
  return `<div class="panel" id="mhist"><h3>Your attempts</h3><div class="mtrend">${sparkHTML(t.scores)}<span>${esc(trendText(t))}</span></div>
    <ul class="mlist matts">${atts.map((a, i) => [a, i + 1]).reverse().map(([a, n]) => attemptHTML(a, n)).join("")}</ul></div>`;
}
function timerHTML(){
  return `<div class="mtimer"><span>Timer</span><div class="seg">${TIMER_CHOICES.map(m =>
    `<button data-timer="${m}" aria-pressed="${timer.mins === m}">${m ? `${m} min` : "Off"}</button>`).join("")}</div>
    <b id="mclock" aria-live="off" class="${timer.mins && Date.now() >= timer.endsAt ? "up" : ""}">${timer.mins ? clockText() : ""}</b></div>`;
}
function promptHTML(p){
  const g = gate(), text = draftOf(p.id), chk = Mock.checkAnswer(text);
  return `${headerHTML("Mock interview")}<div class="wrap" id="mockroot">
    <button class="linkish soft mback" id="mback">‹ All questions</button>
    <div class="panel"><div class="kicker">${esc(MP.categoryName(p.cat))}</div><h2 class="mtitle">${esc(p.title)}</h2>
      <p class="mq">${esc(p.prompt)}</p>
      <details class="mrub"><summary>How it’s graded</summary><ul>${p.rubric.map(r =>
        `<li><b>${esc(r.name)}</b>: ${esc(r.what_good_looks_like)}</li>`).join("")}</ul></details></div>
    <div class="panel">${timerHTML()}
      <label class="mlabel" for="mans">Your answer</label>
      <textarea id="mans" class="mans" rows="10" maxlength="${Mock.MAX_ANSWER + 500}" placeholder="Answer as if you were talking to the interviewer…" ${busy ? "readonly" : ""}>${esc(text)}</textarea>
      <div class="mcount" id="mcount">${countText(text)}</div>
      <p class="fine mhint">Tip: tap the microphone on your phone’s keyboard to dictate instead of typing.</p>
      ${gateHTML(g)}
      ${error ? `<p class="serr" role="alert">${esc(error)}</p>` : ""}
      <button class="cta" id="msubmit" ${busy || g !== "in" || !chk.ok ? "disabled" : ""}>${busy ? "Grading… (up to 30 s)" : "Submit for grading"}</button></div>
    ${historyHTML(p)}</div>`;
}
function countText(text){
  const n = text.trim().length;
  const note = n < Mock.MIN_ANSWER ? ` · at least ${Mock.MIN_ANSWER} to grade` : n > Mock.MAX_ANSWER ? ` · over the ${Mock.MAX_ANSWER} limit` : "";
  return `${plural(Mock.wordCount(text), "word")} · ${n}/${Mock.MAX_ANSWER} characters${note}`;
}

/* ---------- timer ---------- */
function clockText(){
  const left = Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000));
  return left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Time’s up";
}
function stopTimer(){ if (tick) clearInterval(tick); tick = null; timer = { mins: 0, endsAt: 0 }; }
function startTimer(mins){
  stopTimer();
  if (!mins) return;
  timer = { mins, endsAt: Date.now() + mins * 60000 };
  tick = setInterval(() => {
    const el = document.getElementById("mclock");
    if (!el) return stopTimer(); // left the question
    el.textContent = clockText();
    if (Date.now() >= timer.endsAt) {
      clearInterval(tick); tick = null; el.classList.add("up");
      toast("Time’s up. Wrap up your answer, then submit.");
      if (navigator.vibrate) navigator.vibrate(120);
    }
  }, 1000);
}

/* ---------- grading ---------- */
function friendly(status, data){
  if (data && typeof data.error === "string" && data.error.trim()) return Mock.cleanText(data.error, 200);
  if (status === 401) return "Your sign-in expired. Sign in again on the Profile tab.";
  if (status === 429) return "You’ve used today’s grades. More tomorrow.";
  if (status === 404) return "Grading isn’t available on this version of the site.";
  return "The grader couldn’t be reached. Your answer is still here; try again in a minute.";
}
async function submit(p, rerender){
  const chk = Mock.checkAnswer(draftOf(p.id));
  if (busy || gate() !== "in") return;
  if (!chk.ok) { error = chk.error; return rerender(); }
  busy = true; error = ""; justGraded = null; rerender();
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), GRADE_TIMEOUT_MS);
  try {
    const token = await B.sync.token();
    if (!token) throw new Error("Your sign-in expired. Sign in again on the Profile tab.");
    let r;
    try {
      r = await fetch("/api/grade", { method: "POST", signal: ctl.signal, cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ promptId: p.id, answer: chk.text }) });
    } catch (e) { throw new Error(navigator.onLine ? "The grader didn’t answer in time. Try again in a minute." : "You’re offline. Your answer is saved; submit when you’re back online."); }
    const data = await r.json().catch(() => null);
    if (!r.ok || !data || data.ok !== true) throw new Error(friendly(r.status, data));
    const result = Mock.clampResult(data.result, p.rubric); // never trust the response shape
    if (!result) throw new Error("The grader sent back something unreadable. Try again.");
    const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Mock.newId();
    const next = Mock.add(S.mock, { id, promptId: p.id, answer: chk.text, result, day: today(), now: Date.now() });
    if (!next.some(a => a.id === id)) throw new Error("The grade couldn’t be saved. Try again.");
    S.mock = next;
    commit();
    saveDraft(p.id, "");
    stopTimer();
    justGraded = id;
  } catch (e) {
    error = e && e.message ? e.message : "Something went wrong. Try again.";
  } finally {
    clearTimeout(t);
    busy = false;
    rerender();
    const h = justGraded && document.getElementById("mhist");
    if (h) h.scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

/* ---------- render and bind ---------- */
function open(id, rerender){
  if (id !== promptId) { stopTimer(); error = ""; justGraded = null; }
  promptId = id; rerender(); window.scrollTo(0, 0);
}
function bind(app, rerender){
  const on = (sel, fn) => { const el = app.querySelector(sel); if (el) el.onclick = fn; };
  app.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { cat = b.dataset.cat; rerender(); });
  app.querySelectorAll("[data-prompt]").forEach(b => b.onclick = () => open(b.dataset.prompt, rerender));
  on("#mrand", () => { const ps = MP.inCategory(cat).filter(p => p.id !== promptId); open(ps[Math.floor(Math.random() * ps.length)].id, rerender); });
  on("#mback", () => { stopTimer(); promptId = null; error = ""; justGraded = null; rerender(); window.scrollTo(0, 0); });
  on("#mgo", () => B.goTab && B.goTab("profile"));
  app.querySelectorAll("[data-timer]").forEach(b => b.onclick = () => {
    startTimer(+b.dataset.timer);
    app.querySelectorAll("[data-timer]").forEach(x => x.setAttribute("aria-pressed", String(+x.dataset.timer === timer.mins)));
    const c = document.getElementById("mclock"); c.textContent = timer.mins ? clockText() : ""; c.classList.remove("up");
  });
  app.querySelectorAll("[data-mdel]").forEach(b => b.onclick = () => {
    if (!confirm("Delete this attempt? It can’t be undone.")) return;
    S.mock = Mock.remove(S.mock, b.dataset.mdel, Date.now()); commit(); rerender();
  });
  const p = MP.byId(promptId), ta = app.querySelector("#mans");
  if (!p || !ta) return;
  ta.oninput = () => {
    saveDraft(p.id, ta.value);
    app.querySelector("#mcount").textContent = countText(ta.value);
    const btn = app.querySelector("#msubmit");
    btn.disabled = busy || gate() !== "in" || !Mock.checkAnswer(ta.value).ok;
    if (error) { error = ""; const e = app.querySelector(".serr"); if (e) e.remove(); }
  };
  on("#msubmit", () => submit(p, rerender));
}

let lastGate = null;
function renderMock(app, render){
  const rerender = () => render();
  const p = promptId && MP.byId(promptId);
  if (promptId && !p) promptId = null;
  // Keep typing undisturbed if a sync refresh re-renders the screen mid-answer.
  const a = document.activeElement, keep = a && a.id === "mans" ? [a.selectionStart, a.selectionEnd, a.scrollTop] : null;
  lastGate = gate();
  app.innerHTML = p ? promptHTML(p) : listHTML();
  bind(app, rerender);
  if (keep) { const ta = app.querySelector("#mans"); if (ta) { ta.focus({ preventScroll: true }); ta.setSelectionRange(keep[0], keep[1]); ta.scrollTop = keep[2]; } }
}
/* Sign-in finishing (or ending) while the Mock tab is open updates the gate. */
if (B.sync && B.sync.onChange) B.sync.onChange(() => { if (document.getElementById("mockroot") && gate() !== lastGate) B.render(); });

B.renderMock = renderMock;
})();
