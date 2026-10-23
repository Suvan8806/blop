/* Tabs and screens. Data, state, helpers and the session runner come from core.js via window.Blop. */
(() => {
/* An old cached index.html can serve this file without core.js. Reload once to pick up the new page,
   then fall back to a button so it can never loop. */
if (!window.Blop || !window.Blop.S) {
  const FLAG = "blop-stale-reload";
  let tried = false;
  try { tried = sessionStorage.getItem(FLAG) === "1"; sessionStorage.setItem(FLAG, "1"); } catch (e) { tried = true; }
  if (!tried) { location.reload(); return; }
  const root = document.getElementById("app");
  if (root) {
    root.innerHTML = `<div class="wrap"><div class="panel"><h3>Update ready</h3><p>Tap to load the new version of blop.</p>
      <button class="cta" id="reload">Reload</button></div></div>`;
    document.getElementById("reload").onclick = () => location.reload();
  }
  return;
}
try { sessionStorage.removeItem("blop-stale-reload"); } catch (e) {}
const B = window.Blop, L = B.logic;
const { UNITS, BY_ID, S, I, $, esc, save, commit, setSettings, liveStreak, toast, unlocked, nextInUnit, startLesson, startPractice, isDue, estSecs, estLabel,
  planSkip, dayGoal, statsRow, hasFocus, pathIds, pathUnits, pathNext, plural } = B;
const app = $("#app");
const P = window.Paths;
const isDeep = t => !!(P && P.isDeep(t));
const short = t => (P ? P.shortTitle(t) : t);

/* ---------- tabs ---------- */
/* The tab bar. "jobs" is a screen inside Profile (the Job tracker); ?tab=jobs and B.goTab("jobs") still open it. */
const TABS = ["today", "learn", "mock", "profile"];
const VIEWS = [...TABS, "jobs"];
const HOME = "today";
/* ?tab=today (a reminder notification opens the app this way) picks the first tab, then leaves the URL clean. */
function initialTab(){
  try {
    const u = new URL(location.href), t = u.searchParams.get("tab");
    if (t === null) return HOME;
    u.searchParams.delete("tab");
    history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    return VIEWS.includes(t) ? t : HOME;
  } catch (e) { return HOME; }
}
let tab = initialTab();
function renderTabs(){
  const t = [["today","Today",I.sun],["learn","Learn",I.path],["mock","Mock",I.chat],["profile","Profile",I.user]];
  const here = tab === "jobs" ? "profile" : tab;
  $("#tabs").innerHTML = t.map(([k,label,ic]) =>
    `<button data-tab="${k}" ${here===k?'aria-current="page"':""}><span class="ti">${ic}</span>${label}</button>`).join("");
  $("#tabs").querySelectorAll("button").forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); window.scrollTo(0,0); });
}
/* ---------- learn: shared pieces ---------- */
function subjectSwitch(){
  return `<div class="subj" role="group" aria-label="Subject">${L.SUBJECTS.map(([id, name]) =>
    `<button data-subj="${id}" aria-pressed="${S.subject === id}">${name}</button>`).join("")}</div>`;
}
/* Open the next unfinished unit of the current subject, unless one of its units is open or the user collapsed them all (-1). */
function openFor(units){
  if (S.open === -1 || units.some(u => u.ui === S.open)) return;
  const n = units.find(u => nextInUnit(u)) || units[0];
  S.open = n ? n.ui : -1;
}
function lessonRow(l, nxt){
  const isDone = !!S.done[l.id], isCur = nxt && nxt.id === l.id, lock = !unlocked(l);
  const cls = isDone ? "done" : isCur ? "cur" : lock ? "locked" : "";
  const ic = isDone ? I.check : isCur ? I.play : lock ? I.lock : I.book;
  const badge = isDone && isDue(l.id) ? ` <span class="badge" title="Due for review">review</span>` : "";
  const time = estLabel(estSecs(l));
  const sub = isDone ? "Done · tap to redo" : isCur ? `Up next · ${time}` : lock ? "Unlocks after the lesson above" : `Ready · ${time}`;
  return `<li><button class="lesson ${cls}" data-lesson="${l.id}"><span class="node">${ic}</span>
    <span><div class="lt">${esc(l.title)}${badge}</div><div class="ls">${sub}</div></span></button></li>`;
}
const lessonsHTML = u => `<ul class="lessons">${u.lessons.map(l => lessonRow(l, nextInUnit(u))).join("")}</ul>`;
const doneIn = u => u.lessons.filter(l => S.done[l.id]).length;
/* "8 lessons · ~16 min" (estimate.js, scaled by the learner's pace). */
function unitTime(u){ return `${plural(u.lessons.length, "lesson")} · ${estLabel(u.lessons.reduce((a, l) => a + estSecs(l), 0))}`; }
/* A full unit card (Browse, and the current and next units on the path). */
function unitHTML(u, opts){
  const o = opts || {}, done = doneIn(u), open = S.open === u.ui;
  const skipped = !o.path && planSkip().includes(u.ui);
  return `<section class="unit${o.here ? " here" : ""}" style="--hue:${u.hue}">
    <button class="banner" data-unit="${u.ui}" aria-expanded="${open}">
      <small>${esc(o.label || `Unit ${u.num}`)}</small><h2>${esc(short(u.title))}</h2>
      <span class="meta">${o.state ? `<span class="ustate">${o.state}</span> · ` : ""}${unitTime(u)}${done ? ` · ${done} done` : ""}${
        skipped ? (hasFocus() ? " · not on your path" : " · skipped in your plan") : ""}</span>
      <div class="ubar"><span style="width:${done / u.lessons.length * 100}%"></span></div>
    </button>${open ? lessonsHTML(u) : ""}</section>`;
}
/* A slim unit row (the rest of the path, Go deeper): title, state and a small "3/17"; tapping opens it in place. */
function unitRowHTML(u, state, tag){
  const open = S.open === u.ui, done = doneIn(u), all = done === u.lessons.length;
  return `<li class="urow-li"><button class="urow${all ? " udone" : ""}" data-unit="${u.ui}" aria-expanded="${open}" style="--hue:${u.hue}">
      <span class="udot" aria-hidden="true">${all ? I.check : ""}</span>
      <span class="ut"><b>${esc(short(u.title))}</b>${tag ? ` <span class="itag">${tag}</span>` : ""}<small>${state}</small></span>
      <span class="uf">${done}/${u.lessons.length}</span></button>${open ? lessonsHTML(u) : ""}</li>`;
}
function practiceHTML(){
  if (Object.keys(S.done).length < 3) return "";
  const missed = Object.keys(S.miss).some(k => S.miss[k] > 0);
  return `<button class="cta ghost lpractice" id="practice">${missed ? "Practise mistakes" : "Mixed practice"}</button>`;
}

/* ---------- learn: my path ---------- */
let learnView = "path"; // "path" or "browse"; the path view only exists with a goal
function viewSwitch(){
  return `<div class="subj" role="group" aria-label="View">${[["path", "My path"], ["browse", "Browse"]].map(([id, name]) =>
    `<button data-view="${id}" aria-pressed="${learnView === id}">${name}</button>`).join("")}</div>`;
}
/* The last unfinished unit on the path that this one builds on (directly or through units off the path), or null. */
function waitingOn(u, order){
  const at = new Map(order.map((ui, i) => [UNITS[ui].title, i]));
  const seen = new Set(), out = [];
  const walk = t => (P.PREREQS[t] || []).forEach(p => { if (seen.has(p)) return; seen.add(p); if (at.has(p)) out.push(p); else walk(p); });
  walk(u.title);
  const open = out.filter(t => { const x = UNITS[order[at.get(t)]]; return !x.lessons.every(l => S.done[l.id]); });
  return open.sort((a, b) => at.get(a) - at.get(b)).pop() || null;
}
function unitState(u, order, cur, nextUi){
  const done = doneIn(u);
  if (done === u.lessons.length) return "Done";
  if (u.ui === cur) return "In progress";
  if (u.ui === nextUi) return "Up next";
  const w = waitingOn(u, order);
  return w ? `Unlocks after ${esc(short(w))}` : done ? "In progress" : "Ready";
}
function pathFull(){ return P.pathFor(UNITS, S.focus.goals, { known: S.focus.known, done: S.done, deep: S.focus.deep, secsOf: estSecs }); }
function pathHTML(){
  const order = pathUnits() || [], ids = pathIds() || [], nxt = pathNext();
  const cur = nxt ? nxt.ui : null;
  const after = ids.find(id => !S.done[id] && BY_ID[id].ui !== cur);
  const nextUi = after ? BY_ID[after].ui : null;
  if (S.open === null || (S.open !== -1 && !UNITS[S.open])) S.open = cur ?? -1;
  const done = ids.filter(id => S.done[id]).length;
  const n = order.length, idx = ui => order.indexOf(ui) + 1;
  const label = P.focusLabel(S.focus);
  const head = `<div class="panel ppath"><div class="kicker">${esc(label)}</div>
      <div class="jbar" aria-hidden="true"><span style="width:${ids.length ? done / ids.length * 100 : 0}%"></span></div>
      <p>${done} of ${plural(ids.length, "lesson")} · ${plural(n, "unit")}</p>
      ${nxt ? `<button class="cta" id="pathgo">${done ? "Continue" : "Start"}: ${esc(nxt.title)}</button>`
        : `<p style="margin:0"><b>Path complete.</b> Choose a new goal, or keep your lessons fresh with reviews.</p>`}
      <button class="linkish soft" id="pathedit">Edit path</button></div>`;
  const big = [cur, nextUi].filter(ui => ui !== null);
  const cards = big.map(ui => unitHTML(UNITS[ui], { path: true, here: ui === cur, label: `Unit ${idx(ui)} of ${n}`,
    state: ui === cur ? "In progress" : "Up next" })).join("");
  const rest = order.filter(ui => !big.includes(ui));
  const restHTML = rest.length ? `<div class="panel ulist"><h3 class="subhead">${rest.length === 1 ? "1 more unit" : `${rest.length} more units`}</h3>
      <ul class="urows">${rest.map(ui => unitRowHTML(UNITS[ui], unitState(UNITS[ui], order, cur, nextUi), isDeep(UNITS[ui].title) ? "in depth" : "")).join("")}</ul></div>` : "";
  const known = S.focus.known.filter(t => UNITS.some(u => u.title === t));
  return `${head}${cards}${restHTML}${practiceHTML()}${deeperHTML()}
    ${known.length ? `<div class="panel"><h3>Skipped (you know these)</h3><p>${known.map(t => esc(short(t))).join(", ")}. Still in Browse if you want them.</p>
      <button class="cta ghost" id="pathknown">Change</button></div>` : ""}`;
}
const DEEP_SHOWN = 6;
let deeperOpen = false;
/* Go deeper: the in-depth units for this path, de-emphasised, with the toggle that adds them to the plan. */
function deeperHTML(){
  const p = pathFull(), rel = P.relatedDeep(UNITS, p).filter(x => !x.added);
  const extra = p.deepExtra.length, on = S.focus.deep;
  const addedN = p.steps.filter(s => s.deep).length;
  if (!extra && !addedN && !rel.length) return "";
  const lessons = p.deepExtra.reduce((a, x) => a + x.lessons, 0);
  const sub = on ? (addedN ? `${plural(addedN, "in-depth unit")} added to your plan` : "In-depth units for your topics join your plan")
    : extra ? `Add ${plural(extra, "optional in-depth unit")} · +${plural(lessons, "lesson")}` : "Optional in-depth units";
  const toggle = extra || addedN ? `<label class="switch"><span class="sr">Go deeper: add in-depth units to my plan</span>
      <input type="checkbox" role="switch" id="deeptoggle" ${on ? "checked" : ""}></label>` : "";
  const shown = rel.slice(0, DEEP_SHOWN), more = rel.length - shown.length;
  const list = rel.length ? `<details class="dlist" id="deeperlist" ${deeperOpen ? "open" : ""}><summary>${on ? "More" : "See"} ${plural(rel.length, "in-depth unit")}</summary>
      <p class="fine">Start any of these any time.${on ? "" : " With Go deeper off they don’t count toward your plan."}</p>
      <ul class="urows">${shown.map(x => unitRowHTML(UNITS[x.ui], unitTime(UNITS[x.ui]), "in depth")).join("")}</ul>
      ${more > 0 ? `<button class="linkish soft" id="deepmore">+${more} more in Browse</button>` : ""}</details>` : "";
  return `<section class="deeper" aria-labelledby="deeperh"><div class="dhead"><div><h3 id="deeperh">Go deeper</h3><small>${sub}</small></div>${toggle}</div>${list}</section>`;
}

/* ---------- learn: browse ---------- */
let browseDeepOpen = false;
function browseHTML(){
  const units = L.unitsFor(UNITS, S.subject);
  const core = units.filter(u => !isDeep(u.title)), deep = units.filter(u => isDeep(u.title));
  openFor(core.length ? core : units);
  if (deep.some(u => u.ui === S.open)) browseDeepOpen = true;
  const banner = hasFocus() || !B.openFocus ? "" : `<div class="panel nudge slim"><p>Not sure where to start? <button class="linkish soft inl" id="browsegoal">Choose a goal</button></p></div>`;
  if (!units.length) return `${banner}<div class="panel"><h3>Coming soon</h3><p style="margin:0">No units here yet.</p></div>`;
  return `${banner}${core.map(u => unitHTML(u)).join("")}
    ${deep.length ? `<details class="deeper dlist" id="browsedeep" ${browseDeepOpen ? "open" : ""}><summary>Go deeper · ${plural(deep.length, "unit")}</summary>
      <p class="fine">Optional in-depth units. They go further than most interviews ask.</p>
      <ul class="urows">${deep.map(u => unitRowHTML(u, unitTime(u), "in depth")).join("")}</ul></details>` : ""}
    ${practiceHTML()}`;
}
function renderLearn(){
  const onPath = hasFocus() && learnView === "path";
  app.innerHTML = `<div class="top"><div class="wrap"><h1>Learn</h1>${statsRow()}${hasFocus() ? viewSwitch() : ""}${onPath ? "" : subjectSwitch()}</div></div>
    <div class="wrap">${onPath ? pathHTML() : browseHTML()}</div>`;
  const on = (sel, fn) => { const b = $(sel); if (b) b.onclick = fn; };
  on("#practice", () => startPractice(Object.keys(S.miss).some(k => S.miss[k] > 0) ? "Practise mistakes" : "Mixed practice"));
  app.querySelectorAll("[data-view]").forEach(b => b.onclick = () => {
    if (learnView === b.dataset.view) return;
    learnView = b.dataset.view; S.open = null; render(); window.scrollTo(0,0);
    const f = app.querySelector(`[data-view="${learnView}"]`); if (f) f.focus({ preventScroll:true });
  });
  on("#pathgo", () => { const n = pathNext(); if (n) startLesson(n); });
  on("#pathedit", () => B.openFocus && B.openFocus({ edit: true }));
  on("#pathknown", () => B.openFocus && B.openFocus({ edit: true }));
  on("#browsegoal", () => B.openFocus && B.openFocus());
  on("#deepmore", () => { learnView = "browse"; S.open = null; browseDeepOpen = true; setSettings({ subject: "ml" }); render(); window.scrollTo(0,0); });
  const dl = $("#deeperlist"); if (dl) dl.ontoggle = () => { deeperOpen = dl.open; };
  const bd = $("#browsedeep"); if (bd) bd.ontoggle = () => { browseDeepOpen = bd.open; };
  const dt = $("#deeptoggle"); if (dt) dt.onchange = () => setDeep(dt.checked);
  app.querySelectorAll("[data-subj]").forEach(b => b.onclick = () => {
    if (S.subject === b.dataset.subj) return;
    S.open = null; setSettings({ subject: L.validSubject(b.dataset.subj) }); render(); window.scrollTo(0,0);
    const f = app.querySelector(`[data-subj="${S.subject}"]`); if (f) f.focus({ preventScroll:true });
  });
  app.querySelectorAll("[data-unit]").forEach(b => b.onclick = () => {
    const ui = +b.dataset.unit;
    S.open = (S.open === ui) ? -1 : ui; save(); render();
    if (S.open === ui) { const el = app.querySelector(`[data-unit="${ui}"]`); if (el) el.scrollIntoView({ block: "start", behavior: "smooth" }); }
  });
  app.querySelectorAll("[data-lesson]").forEach(b => b.onclick = () => {
    const l = BY_ID[b.dataset.lesson];
    if (!unlocked(l)) return toast("Finish the lesson before this one to unlock it.");
    startLesson(l);
  });
}
/* Go deeper on or off: deep-dive units join or leave the path (and any plan over it). Synced inside the focus. */
function setDeep(on){
  S.focus = P.withFocus(S.focus, { deep: !!on }, Date.now());
  commit(); render();
  toast(on ? "In-depth units added to your plan." : "Back to the core units. In-depth ones stay in Browse.");
}

/* ---------- profile ---------- */
function goalPanelHTML(){
  if (!P || !B.openFocus) return "";
  if (!hasFocus()) return `<div class="panel"><h3>Your goal</h3><p>No goal yet, so you’re browsing everything. Choose what you’re preparing for and blop builds a short path and a daily plan.</p>
      <button class="cta ghost" id="focusbtn">Choose a goal</button></div>`;
  const p = pathFull(), extra = p.deepExtra.length, addedN = p.steps.filter(s => s.deep).length;
  return `<div class="panel"><h3>Your goal</h3><p>${esc(P.focusLabel(S.focus))} · ${plural(p.included.length, "unit")} · ${P.hoursText(p.minutes)} left</p>
      ${extra || addedN ? `<div class="prow"><span><b>Go deeper</b><br><small class="soft">${S.focus.deep ? `${plural(addedN, "in-depth unit")} on your path` : `Add ${plural(extra, "optional in-depth unit")}`}</small></span>
        <label class="switch"><span class="sr">Go deeper</span><input type="checkbox" role="switch" id="deeptoggle" ${S.focus.deep ? "checked" : ""}></label></div>` : ""}
      <div class="gbtns"><button class="cta ghost" id="focusbtn">Change goal</button><button class="cta ghost" id="focusedit">Edit path</button></div></div>`;
}
function jobsRowHTML(){
  if (!B.renderJobs || !window.Jobs) return "";
  const live = Jobs.live(S.jobs).length, week = live ? Jobs.stats(S.jobs, B.today()).thisWeek : 0;
  return `<button class="panel rowlink" id="jobsopen"><span><b>Job tracker</b><small>${live ? `${week} applied this week` : "Log applications and track replies"}</small></span>
    <span class="chev" aria-hidden="true">›</span></button>`;
}
function statsGridHTML(){
  const doneCount = Object.keys(S.done).length;
  if (!doneCount) return `<div class="panel"><p style="margin:0">Your streak and progress show up here after your first lesson.</p></div>`;
  const ids = pathIds();
  const onPath = ids ? ids.filter(id => S.done[id]).length : 0;
  const unitsDone = UNITS.filter(u => u.lessons.every(l => S.done[l.id])).length;
  return `<div class="grid">
    <div class="panel"><div class="big">${liveStreak()}</div><div class="k">day streak</div></div>
    <div class="panel"><div class="big">${S.xp}</div><div class="k">XP</div></div>
    <div class="panel"><div class="big">${doneCount}</div><div class="k">${doneCount === 1 ? "lesson done" : "lessons done"}</div></div>
    ${ids ? `<div class="panel"><div class="big">${onPath}<span class="of"> of ${ids.length}</span></div><div class="k">on your path</div></div>`
      : `<div class="panel"><div class="big">${unitsDone}</div><div class="k">${unitsDone === 1 ? "unit finished" : "units finished"}</div></div>`}
  </div>`;
}
function renderProfile(){
  app.innerHTML = `<div class="top"><div class="wrap"><h1>Profile</h1>${statsRow()}</div></div><div class="wrap">
  ${statsGridHTML()}
  ${goalPanelHTML()}
  ${jobsRowHTML()}
  ${B.syncPanelHTML ? B.syncPanelHTML() : ""}
  ${B.remindPanelHTML ? B.remindPanelHTML() : ""}
  ${dayGoal().plan
    ? `<div class="panel"><h3>Daily goal</h3><p style="margin:0">Your study plan sets this each day. Change the time a day in Plan settings on Today.</p></div>`
    : `<div class="panel"><h3>Daily goal</h3><p>Lessons a day. Each takes about ${plural(Math.max(1, Math.round(B.ALL.reduce((a, l) => a + estSecs(l), 0) / B.ALL.length / 60)), "minute")}.</p>
    <div class="seg">${[1,2,3,5].map(n => `<button data-goal="${n}" aria-pressed="${S.goal===n}">${n}</button>`).join("")}</div></div>`}
  <div class="panel"><h3>Add to your home screen</h3>
    <ol class="steps"><li>iPhone: open this site in Safari, tap Share, then Add to Home Screen.</li>
    <li>Android: open it in Chrome, tap the ⋮ menu, then Install app or Add to Home screen.</li></ol>
    <p style="margin:10px 0 0">Your progress is saved on this device.</p></div>
  <div class="panel"><h3>Reset study progress</h3><p>Clears your lessons, XP, streak, reviews and plan on this device. Jobs, mock answers and settings stay.${
    B.sync && B.sync.signedIn() ? " You’re signed in, so your other devices reset when they next sync." : ""}</p>
    <button class="linkish" id="reset">Reset study progress</button></div>
  <div class="panel"><h3>About</h3><p style="margin:0"><a href="/?welcome">About blop</a> · <a href="/privacy.html">Privacy Policy</a> · <a href="/terms.html">Terms of Service</a></p></div></div>`;
  app.querySelectorAll("[data-goal]").forEach(b => b.onclick = () => { setSettings({ goal: +b.dataset.goal }); render(); });
  const on = (sel, fn) => { const b = $(sel); if (b) b.onclick = fn; };
  on("#focusbtn", () => B.openFocus && B.openFocus());
  on("#focusedit", () => B.openFocus && B.openFocus({ edit: true }));
  on("#jobsopen", () => B.goTab("jobs"));
  const dt = $("#deeptoggle"); if (dt) dt.onchange = () => setDeep(dt.checked);
  if (B.bindSyncPanel) B.bindSyncPanel(app);
  if (B.bindRemindPanel) B.bindRemindPanel(app);
  $("#reset").onclick = () => {
    if (confirm("Reset your study progress? Job applications and settings stay. This can’t be undone.")) { B.reset(); render(); }
  };
}

/* A tab whose script didn't load (an old cached index.html, or a failed download) asks for a reload
   instead of silently showing another tab. */
function renderStale(){
  app.innerHTML = `<div class="wrap"><div class="panel" style="margin-top:24px"><h3>Update ready</h3>
    <p>Part of the new version of blop didn’t load. Reload to finish updating.</p>
    <button class="cta" id="reload">Reload</button></div></div>`;
  $("#reload").onclick = () => location.reload();
}
function render(){
  renderTabs();
  if (tab === "learn") renderLearn();
  else if (tab === "today") B.renderToday ? B.renderToday(app, render) : renderStale();
  else if (tab === "mock") B.renderMock ? B.renderMock(app, render) : renderStale();
  else if (tab === "jobs") B.renderJobs ? B.renderJobs(app, render) : renderStale();
  else renderProfile();
  if (B.maybeOnboard) B.maybeOnboard();
}
B.render = render;
/* Switch tabs from another screen (e.g. the Job tracker's back link opens Profile). */
B.goTab = k => { tab = VIEWS.includes(k) ? k : HOME; render(); window.scrollTo(0,0); };

render();
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
/* Tapping a reminder while blop is already open: the service worker asks this page to show that tab. */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", e => {
    const d = e.data;
    if (d && d.type === "blop-open" && VIEWS.includes(d.tab) && !document.querySelector(".session")) B.goTab(d.tab);
  });
}
})();
