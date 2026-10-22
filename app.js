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
const { UNITS, ALL, BY_ID, S, I, $, esc, save, liveStreak, toast, unlocked, nextInUnit, startLesson, startPractice, isDue,
  planSkip, sched, dayGoal, statsRow } = B;
const app = $("#app");

/* ---------- tabs ---------- */
let tab = "learn";
function renderTabs(){
  const t = [["learn","Learn",I.path],["today","Today",I.sun],["profile","Profile",I.user]];
  $("#tabs").innerHTML = t.map(([k,label,ic]) =>
    `<button data-tab="${k}" ${tab===k?'aria-current="page"':""}><span class="ti">${ic}</span>${label}</button>`).join("");
  $("#tabs").querySelectorAll("button").forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); window.scrollTo(0,0); });
}
/* ---------- learn ---------- */
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
function lessonRow(l, nxt, todaySet){
  const isDone = !!S.done[l.id], isCur = nxt && nxt.id === l.id, lock = !unlocked(l);
  const cls = isDone ? "done" : isCur ? "cur" : lock ? "locked" : "";
  const ic = isDone ? I.check : isCur ? I.play : lock ? I.lock : I.book;
  const inToday = !isDone && todaySet.has(l.id) ? " · in today’s plan" : "";
  const badge = isDone && isDue(l.id) ? ` <span class="badge" title="Due for review">review</span>` : "";
  const sub = (isDone ? "Done · tap to redo" : isCur ? `Up next · ${l.qs.length} questions` : lock ? "Finish the lesson before this to unlock" : "Ready") + inToday;
  return `<li><button class="lesson ${cls}" data-lesson="${l.id}"><span class="node">${ic}</span>
    <span><div class="lt">${esc(l.title)}${badge}</div><div class="ls">${sub}</div></span></button></li>`;
}
function unitHTML(u, s, todaySet){
  const done = u.lessons.filter(l => S.done[l.id]).length;
  const open = S.open === u.ui;
  const skipped = s && planSkip().includes(u.ui);
  const nxt = nextInUnit(u);
  return `<section class="unit" style="--hue:${u.hue}">
    <button class="banner" data-unit="${u.ui}" aria-expanded="${open}">
      <span class="num" aria-hidden="true">${u.num}</span>
      <small>Unit ${u.num}</small><h2>${esc(u.title)}</h2>
      <span class="meta">${done} of ${u.lessons.length} complete${skipped ? " · skipped in your plan" : ""}</span>
      <div class="ubar"><span style="width:${done/u.lessons.length*100}%"></span></div>
    </button>${open ? `<ul class="lessons">${u.lessons.map(l => lessonRow(l, nxt, todaySet)).join("")}</ul>` : ""}</section>`;
}
function renderLearn(){
  const units = L.unitsFor(UNITS, S.subject);
  openFor(units);
  const s = sched();
  const todaySet = new Set(s ? s.plan[0].ids : []);
  app.innerHTML = `<div class="top"><div class="wrap"><h1>Learn</h1>${statsRow()}${subjectSwitch()}</div></div><div class="wrap">
    <button class="cta ghost" id="practice" style="margin-top:4px">Practice what you’ve learned</button>
    ${units.length ? units.map(u => unitHTML(u, s, todaySet)).join("") : `<div class="panel"><h3>Coming soon</h3><p style="margin:0">No units here yet.</p></div>`}</div>`;
  $("#practice").onclick = startPractice;
  app.querySelectorAll("[data-subj]").forEach(b => b.onclick = () => {
    if (S.subject === b.dataset.subj) return;
    S.subject = L.validSubject(b.dataset.subj); S.open = null; save(); render(); window.scrollTo(0,0);
    const f = app.querySelector(`[data-subj="${S.subject}"]`); if (f) f.focus({ preventScroll:true });
  });
  app.querySelectorAll("[data-unit]").forEach(b => b.onclick = () => {
    const ui = +b.dataset.unit;
    S.open = (S.open === ui) ? -1 : ui; save(); render();
    if (S.open === ui) app.querySelector(`[data-unit="${ui}"]`).scrollIntoView({ block: "start", behavior: "smooth" });
  });
  app.querySelectorAll("[data-lesson]").forEach(b => b.onclick = () => {
    const l = BY_ID[b.dataset.lesson];
    if (!unlocked(l)) return toast("Finish the lesson before this one to unlock it.");
    startLesson(l);
  });
}

/* ---------- profile ---------- */
function renderProfile(){
  const doneCount = Object.keys(S.done).length;
  const unitsDone = UNITS.filter(u => u.lessons.every(l => S.done[l.id])).length;
  app.innerHTML = `<div class="top"><div class="wrap"><h1>Profile</h1>${statsRow()}</div></div><div class="wrap">
  <div class="grid">
    <div class="panel"><div class="big">${liveStreak()}</div><div class="k">day streak</div></div>
    <div class="panel"><div class="big">${S.xp}</div><div class="k">total XP</div></div>
    <div class="panel"><div class="big">${doneCount}<span style="font-size:1rem;color:var(--soft)">/${ALL.length}</span></div><div class="k">lessons done</div></div>
    <div class="panel"><div class="big">${unitsDone}<span style="font-size:1rem;color:var(--soft)">/${UNITS.length}</span></div><div class="k">units finished</div></div>
  </div>
  ${dayGoal().plan
    ? `<div class="panel"><h3>Daily goal</h3><p style="margin:0">Your study plan sets this each day. Change it in the Today tab.</p></div>`
    : `<div class="panel"><h3>Daily goal</h3><p>Lessons per day. Each takes about two minutes.</p>
    <div class="seg">${[1,2,3,5].map(n => `<button data-goal="${n}" aria-pressed="${S.goal===n}">${n}</button>`).join("")}</div></div>`}
  <div class="panel"><h3>Add to your home screen</h3>
    <ol class="steps"><li>iPhone: open this site in Safari, tap Share, then Add to Home Screen.</li>
    <li>Android: open it in Chrome, tap the ⋮ menu, then Install app or Add to Home screen.</li></ol>
    <p style="margin:10px 0 0">Your progress is saved on this device.</p></div>
  <div class="panel"><h3>Reset progress</h3><p>Clears your streak, XP, and finished lessons on this device.</p>
    <button class="linkish" id="reset">Reset everything</button></div></div>`;
  app.querySelectorAll("[data-goal]").forEach(b => b.onclick = () => { S.goal = +b.dataset.goal; save(); render(); });
  $("#reset").onclick = () => {
    if (confirm("Reset all progress? This can’t be undone.")) { B.reset(); render(); }
  };
}

function render(){
  renderTabs();
  if (tab === "learn") renderLearn();
  else if (tab === "today" && B.renderToday) B.renderToday(app, render);
  else renderProfile();
}
B.render = render;

render();
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
})();
