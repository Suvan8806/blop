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
const { UNITS, ALL, BY_ID, QS, S, I, $, esc, save, today, rollDay, liveStreak, toast,
  unlocked, nextInUnit, nextOverall, unitLabel, startLesson, startPractice, startReview, dueReviews, isDue } = B;
const app = $("#app");

/* ---------- plan helpers ---------- */
/* Units left out of the plan: the ones the user unticked, plus units added since the plan was made. */
function planSkip(){
  return S.plan && window.Plan ? Plan.effectiveSkip(S.skip, S.plan.knownUnits, UNITS.length) : S.skip;
}
function sched(){
  if (!S.plan || !window.Plan) return null; // Plan is missing for one load if an old cached index.html is served
  return Plan.schedule({ order: Plan.planOrder(UNITS, planSkip()), done: S.done, doneOn: S.doneOn,
    today: today(), start: S.plan.start, days: S.plan.days });
}
function dayGoal(){
  const s = sched();
  if (s && s.remaining + s.doneToday > 0) return { done: s.doneToday, goal: Math.max(1, s.todayTarget), plan: true };
  rollDay();
  return { done: S.dayLessons, goal: S.goal, plan: false };
}
function nextUp(){
  const s = sched();
  const id = s && s.plan.flatMap(d => d.ids)[0];
  return id ? BY_ID[id] : nextOverall();
}

/* ---------- tabs ---------- */
let tab = "learn";
function renderTabs(){
  const t = [["learn","Learn",I.path],["daily","Daily",I.sun],["plan","Plan",I.cal],["profile","Profile",I.user]];
  $("#tabs").innerHTML = t.map(([k,label,ic]) =>
    `<button data-tab="${k}" ${tab===k?'aria-current="page"':""}><span class="ti">${ic}</span>${label}</button>`).join("");
  $("#tabs").querySelectorAll("button").forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); window.scrollTo(0,0); });
}
function statsRow(){
  const g = dayGoal();
  return `<div class="stats">
    <span class="pill" title="Day streak">${I.flame}${liveStreak()}</span>
    <span class="pill" title="Total XP">${I.bolt}${S.xp} XP</span>
    <span class="pill" title="${g.plan ? "New lessons today in your plan" : "Lessons today"}">${I.target}${g.done}/${g.goal} today</span>
  </div>`;
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

/* ---------- daily ---------- */
function ringSVG(pct, label){
  const r = 40, c = 2*Math.PI*r;
  return `<svg viewBox="0 0 96 96"><circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--sunk)" stroke-width="10"/>
    <circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--green)" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c*(1-pct)}" transform="rotate(-90 48 48)"/>
    <text x="48" y="54" text-anchor="middle" font-size="20" font-weight="800" fill="var(--ink)" font-family="Lexend,sans-serif">${esc(label)}</text></svg>`;
}
function renderDaily(){
  const g = dayGoal();
  const pct = Math.min(1, g.done / g.goal);
  const doneCount = Object.keys(S.done).length;
  const weak = Object.keys(S.miss).filter(k => S.miss[k] > 0 && QS[k]).length;
  const nxt = nextUp();
  const left = g.goal - g.done;
  let h = `<div class="top"><div class="wrap"><h1>Daily</h1>${statsRow()}</div></div><div class="wrap">
  <div class="panel"><div class="ring">${ringSVG(pct, `${g.done}/${g.goal}`)}
    <div><h3>${pct >= 1 ? "Daily goal reached" : g.plan ? "Today’s plan" : "Today’s goal"}</h3>
    <p style="margin:0">${pct >= 1
      ? (g.plan ? "Nice. Extra lessons today make the rest of your plan lighter." : "Nice. Anything else today is bonus XP.")
      : `Finish ${left} more lesson${left === 1 ? "" : "s"} to hit ${g.plan ? "today’s plan" : "your goal"}.`}</p></div>
  </div></div>`;
  if (nxt) h += `<div class="panel"><h3>Continue your track</h3><p>${unitLabel(nxt.ui)} · ${esc(nxt.title)}</p>
    <button class="cta" id="cont">Start lesson</button></div>`;
  h += reviewPanel(doneCount, weak) + `</div>`;
  app.innerHTML = h;
  if (nxt) $("#cont").onclick = () => startLesson(nxt);
  if (doneCount) $("#rev").onclick = startReview;
}

function reviewPanel(doneCount, weak){
  const due = dueReviews().length;
  if (!doneCount) return `<div class="panel"><h3>Daily review</h3><p>Finish your first lesson, then come back here to review it.</p>
    <button class="cta ghost" disabled>Start review</button></div>`;
  if (due) return `<div class="panel"><h3>Reviews due <span class="count">${due}</span></h3>
    <p>${plural(due, "lesson")} due today. Up to 15 questions${weak ? ", starting with ones you’ve missed before" : ""}.
    Get a lesson’s questions all right and it comes back later; miss one and it’s back tomorrow.</p>
    <button class="cta" id="rev">Start review</button></div>`;
  return `<div class="panel"><h3>No reviews due</h3><p>You’re up to date. Extra practice mixes questions from lessons you’ve finished${weak ? `, starting with ${weak} you’ve missed` : ""}.</p>
    <button class="cta ghost" id="rev">Extra practice</button></div>`;
}

/* ---------- plan ---------- */
const PLAN_LENGTHS = [14, 30, 45, 60];
const DEFAULT_PLAN_DAYS = 30, DEFAULT_REMIND = "19:00";
let draftDays = DEFAULT_PLAN_DAYS;

function plural(n, word){ return `${n} ${word}${n === 1 ? "" : "s"}`; }
function unitsOf(ids){ return [...new Set(ids.map(id => UNITS[BY_ID[id].ui].title))]; }

function unitPick(u, skip){
  const left = u.lessons.filter(l => !S.done[l.id]).length;
  return `<label class="upick"><input type="checkbox" data-skip="${u.ui}" ${skip.includes(u.ui) ? "" : "checked"}>
    <span>${esc(u.title)}</span><small>${left ? `${left} left` : "done"}</small></label>`;
}
function unitsPanel(){
  const skip = planSkip();
  const groups = L.SUBJECTS.map(([id, name]) => [name, L.unitsFor(UNITS, id)]).filter(([, us]) => us.length);
  return `<div class="panel"><h3>Units in your plan</h3>
    <p>Untick units you already know. They stay in the app but drop out of your daily count.</p>
    ${groups.map(([name, us]) => `<h4 class="subhead">${esc(name)}</h4><div class="upicks">${us.map(u => unitPick(u, skip)).join("")}</div>`).join("")}</div>`;
}

function planSetupHTML(secs){
  const left = Plan.planOrder(UNITS, planSkip()).filter(id => !S.done[id]).length;
  const pv = Plan.preview(Math.max(left, 1), draftDays, secs);
  return `<div class="panel"><h3>Finish everything in…</h3>
    <div class="seg">${PLAN_LENGTHS.map(n => `<button data-days="${n}" aria-pressed="${draftDays===n}">${n} days</button>`).join("")}</div>
    <div class="sumgrid">
      <div><b>${left}</b><small>lessons left</small></div>
      <div><b>${left ? pv.perDay : 0}</b><small>a day</small></div>
      <div><b>~${left ? pv.minutes : 0}</b><small>min a day</small></div>
    </div>
    <p>Done by <b>${Plan.dayLabel(today() + draftDays - 1)}</b>. Each lesson is a short read plus a few questions, about ${Math.round(secs / 60 * 10) / 10} min.
    If you do more or fewer on a day, the days after it adjust.</p>
    <button class="cta" id="startplan" ${left ? "" : "disabled"}>Start my plan</button></div>
    ${unitsPanel()}`;
}

function dayRowsHTML(s, secs){
  const t = today();
  const past = s.history.map(h => `<li class="drow past"><span class="dd">${Plan.dayLabel(h.day)}</span>
    <span class="dn">${h.did ? `Did ${plural(h.did, "lesson")}` : "Missed"}</span></li>`);
  const ahead = s.plan.map(d => {
    const isToday = d.day === t;
    const count = isToday ? s.todayTarget : d.ids.length;
    const what = isToday && !s.todayLeft ? `${s.doneToday}/${s.todayTarget} done ✓`
      : count ? `${plural(count, "lesson")} · ~${Plan.minutesFor(isToday ? s.todayLeft : count, secs)} min${isToday && s.doneToday ? " left" : ""}`
      : "Free day";
    return `<li class="drow${isToday ? " today" : ""}"><span class="dd">${isToday ? "Today" : Plan.dayLabel(d.day)}</span>
      <span class="dn">${what}</span>${d.ids.length ? `<span class="du">${esc(unitsOf(d.ids).join(", "))}</span>` : ""}</li>`;
  });
  return `<ul class="days">${[...past, ...ahead].join("")}</ul>`;
}

function paceHTML(s){
  if (s.overdue) return `Your deadline (${Plan.dayLabel(s.end)}) has passed, so everything left is due today. Pick a new length below.`;
  const base = `${s.doneInPlan} of ${s.total} done · ${plural(s.daysLeft, "day")} left, ends ${Plan.dayLabel(s.end)}.`;
  if (!s.pace || s.finishDay === null) return base;
  const diff = s.end - s.finishDay;
  const when = diff > 0 ? `, ${plural(diff, "day")} early` : diff < 0 ? `, ${plural(-diff, "day")} late` : ", right on time";
  return `${base} At your pace (${Math.round(s.pace * 10) / 10} a day) you’d finish ${Plan.dayLabel(s.finishDay)}${when}.`;
}

function planActiveHTML(s, secs){
  if (!s.total) {
    return `<div class="panel"><h3>No units selected</h3><p style="margin:0">Tick at least one unit below to plan your days.</p></div>${unitsPanel()}`;
  }
  if (!s.remaining) {
    return `<div class="panel"><h3>Plan complete 🎉</h3><p>You finished every lesson in your plan${s.end > today() ? `, ${plural(s.end - today(), "day")} early` : ""}.
      Keep it fresh with the daily review.</p><button class="cta ghost" id="endplan">Start a new plan</button></div>${unitsPanel()}`;
  }
  const pct = s.todayTarget ? Math.min(1, s.doneToday / s.todayTarget) : 1;
  const nxt = nextUp();
  return `<div class="panel"><div class="ring">${ringSVG(pct, `${s.doneToday}/${s.todayTarget}`)}
      <div><h3>${s.todayLeft ? "Today’s lessons" : "Today’s plan done"}</h3>
      <p style="margin:0">${s.todayLeft
        ? `${plural(s.todayLeft, "lesson")} to go, about ${Plan.minutesFor(s.todayLeft, secs)} min.`
        : "Anything extra today makes the rest of your plan lighter."}</p></div></div>
      ${nxt ? `<p style="margin:14px 0 12px">Next: ${unitLabel(nxt.ui)} · ${esc(nxt.title)}</p><button class="cta" id="plannext">Start lesson</button>` : ""}</div>
    <div class="panel"><h3>Pace</h3><p style="margin:0">${paceHTML(s)}</p></div>
    <div class="panel"><h3>Day by day</h3><p>Future days update every time you finish a lesson.</p>${dayRowsHTML(s, secs)}</div>
    ${s.overdue ? "" : `<div class="panel"><h3>Daily reminder</h3>
      <p>Adds a repeating event with an alert to your phone’s calendar, every day until your plan ends.</p>
      <div class="remind"><input type="time" id="remindat" value="${esc(S.plan.remind || DEFAULT_REMIND)}" aria-label="Reminder time">
      <button class="cta ghost" id="addremind">Add to calendar</button></div></div>`}
    <div class="panel"><h3>Change your plan</h3><p>Finish in this many days, counting from today.</p>
      <div class="seg">${PLAN_LENGTHS.map(n => `<button data-relen="${n}">${n}</button>`).join("")}</div>
      <button class="linkish" id="endplan" style="margin-top:8px">End plan</button></div>
    ${unitsPanel()}`;
}

function downloadReminder(s, secs){
  const ics = Plan.reminderICS({ fromDay: today(), endDay: s.end, time: S.plan.remind || DEFAULT_REMIND,
    minutes: Plan.minutesFor(s.todayTarget, secs), url: location.origin });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = "blop-reminder.ics";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Open the downloaded file to add the reminder.");
}

function bindPlan(s, secs){
  const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
  app.querySelectorAll("[data-days]").forEach(b => b.onclick = () => { draftDays = +b.dataset.days; render(); });
  app.querySelectorAll("[data-skip]").forEach(c => c.onchange = () => {
    const ui = +c.dataset.skip;
    if (S.plan) Object.assign(S, Plan.setUnit(S.plan, S.skip, ui, c.checked, UNITS.length));
    else S.skip = c.checked ? S.skip.filter(x => x !== ui) : [...S.skip, ui];
    save(); render();
  });
  app.querySelectorAll("[data-relen]").forEach(b => b.onclick = () => {
    S.plan = { ...S.plan, days: today() - S.plan.start + +b.dataset.relen }; save(); render();
    toast(`Plan now ends ${Plan.dayLabel(today() + +b.dataset.relen - 1)}.`);
  });
  on("#startplan", () => { S.plan = { start: today(), days: draftDays, remind: DEFAULT_REMIND, knownUnits: UNITS.length }; save(); render(); });
  on("#endplan", () => { if (confirm("End this plan? Your finished lessons stay finished.")) { S.plan = null; save(); render(); } });
  on("#plannext", () => { const n = nextUp(); if (n) startLesson(n); });
  on("#addremind", () => downloadReminder(s, secs));
  const t = $("#remindat");
  if (t) t.onchange = () => { if (t.value) { S.plan = { ...S.plan, remind: t.value }; save(); } };
}

function renderPlan(){
  if (!window.Plan) {
    app.innerHTML = `<div class="wrap"><div class="panel"><h3>Update ready</h3><p>Reload the app to open your study plan.</p>
      <button class="cta" id="reload">Reload</button></div></div>`;
    $("#reload").onclick = () => location.reload();
    return;
  }
  const secs = Plan.lessonSecs(S.times);
  const s = sched();
  app.innerHTML = `<div class="top"><div class="wrap"><h1>Study plan</h1>${statsRow()}</div></div>
    <div class="wrap">${s ? planActiveHTML(s, secs) : planSetupHTML(secs)}</div>`;
  bindPlan(s, secs);
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
    ? `<div class="panel"><h3>Daily goal</h3><p style="margin:0">Your study plan sets this each day. Change it in the Plan tab.</p></div>`
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
  if (tab === "learn") renderLearn(); else if (tab === "daily") renderDaily();
  else if (tab === "plan") renderPlan(); else renderProfile();
}
B.render = render;

render();
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
})();
