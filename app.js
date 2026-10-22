(() => {
const HUES = ["#2A9D8F","#6A5AE0","#E0724F","#3A7FD5","#C98A12","#D0507F"];
const KEY = "mlepath-v1";

/* ---------- data ---------- */
const UNITS = window.CURRICULUM.map((u, ui) => ({
  title: u.t,
  hue: HUES[ui % HUES.length],
  lessons: u.ls.map((l, li) => ({
    id: `u${ui}l${li}`, ui, li, title: l[0], teach: l[1],
    qs: l[2].map((q, qi) => ({ id: `u${ui}l${li}q${qi}`, p: q[0], ok: q[1][0], opts: q[1], why: q[2] || "" }))
  }))
}));
const ALL = UNITS.flatMap(u => u.lessons);
const BY_ID = Object.fromEntries(ALL.map(l => [l.id, l]));
const QS = Object.fromEntries(ALL.flatMap(l => l.qs.map(q => [q.id, q])));

/* ---------- state ---------- */
function today(){ const d = new Date(); return Math.floor((d - d.getTimezoneOffset()*60000) / 864e5); }
function load(){
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch(e) {}
  return Object.assign({ done:{}, xp:0, streak:0, last:-1, miss:{}, goal:2, day:-1, dayLessons:0, dayXp:0, open:null,
    doneOn:{}, times:[], plan:null, skip:[] }, s || {});
}
let S = load();
function save(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e) {} }
function rollDay(){ if (S.day !== today()) { S.day = today(); S.dayLessons = 0; S.dayXp = 0; } }
function award(xp, isLesson){
  rollDay();
  S.xp += xp; S.dayXp += xp;
  if (isLesson) S.dayLessons++;
  const t = today();
  if (S.last !== t) { S.streak = (S.last === t - 1) ? S.streak + 1 : 1; S.last = t; }
  save();
}
function liveStreak(){ return (S.last >= today() - 1) ? S.streak : 0; }

/* ---------- plan ---------- */
const MAX_LESSON_SECS = 900, MIN_LESSON_SECS = 15, KEEP_TIMES = 20;
function sched(){
  if (!S.plan || !window.Plan) return null; // Plan is missing for one load if an old cached index.html is served
  return Plan.schedule({ order: Plan.planOrder(UNITS, S.skip), done: S.done, doneOn: S.doneOn,
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
function recordTime(secs){
  S.times = [...S.times, Math.min(MAX_LESSON_SECS, Math.max(MIN_LESSON_SECS, Math.round(secs)))].slice(-KEEP_TIMES);
}

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const app = $("#app");
function esc(t){ return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function fmt(t){ return esc(t).replace(/`([^`]+)`/g, "<code>$1</code>"); }
function teachHTML(t){
  return t.split("\n\n").map(p => p.startsWith("$")
    ? `<pre><code>${esc(p.slice(1))}</code></pre>`
    : `<p>${fmt(p).replace(/\n/g,"<br>")}</p>`).join("");
}
function shuffle(a){ a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; }
function toast(msg){
  const el = document.createElement("div"); el.className = "toast"; el.textContent = msg;
  document.body.appendChild(el); setTimeout(() => el.remove(), 2200);
}
function unlocked(l){ return l.li === 0 || !!S.done[UNITS[l.ui].lessons[l.li - 1].id]; }
function nextInUnit(u){ return u.lessons.find(l => !S.done[l.id]); }
function nextOverall(){ return ALL.find(l => !S.done[l.id] && unlocked(l)); }

const I = {
  flame:'<svg viewBox="0 0 24 24" fill="#E3A019"><path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.8 2-5 .3 1.6 1 2.6 2 3 0-3 1-6 1-8z"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" fill="#6A5AE0"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="#1F9D61" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="#1F9D61"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
  book:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20"/></svg>',
  path:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="5" r="2.5"/><circle cx="18" cy="12" r="2.5"/><circle cx="6" cy="19" r="2.5"/><path d="M8.3 6.2l7.4 4.6M15.7 13.2l-7.4 4.6"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/></svg>',
  trophy:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z"/></svg>'
};

/* ---------- tabs ---------- */
let tab = "track";
function renderTabs(){
  const t = [["track","Track",I.path],["daily","Daily",I.sun],["plan","Plan",I.cal],["profile","Profile",I.user]];
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

/* ---------- track ---------- */
function renderTrack(){
  if (S.open === null) { const n = nextOverall(); S.open = n ? n.ui : 0; }
  let h = `<div class="top"><div class="wrap"><h1>Your track</h1>${statsRow()}</div></div><div class="wrap">`;
  h += `<button class="cta ghost" id="practice" style="margin-top:4px">Practice what you’ve learned</button>`;
  const s = sched();
  const todaySet = new Set(s ? s.plan[0].ids : []);
  UNITS.forEach((u, ui) => {
    const done = u.lessons.filter(l => S.done[l.id]).length;
    const open = S.open === ui;
    const nxt = nextInUnit(u);
    const skipped = s && S.skip.includes(ui);
    h += `<section class="unit" style="--hue:${u.hue}">
      <button class="banner" data-unit="${ui}" aria-expanded="${open}">
        <span class="num" aria-hidden="true">${ui+1}</span>
        <small>Unit ${ui+1}</small><h2>${esc(u.title)}</h2>
        <span class="meta">${done} of ${u.lessons.length} complete${skipped ? " · skipped in your plan" : ""}</span>
        <div class="ubar"><span style="width:${done/u.lessons.length*100}%"></span></div>
      </button>`;
    if (open) {
      h += `<ul class="lessons">`;
      u.lessons.forEach(l => {
        const isDone = !!S.done[l.id], isCur = nxt && nxt.id === l.id, lock = !unlocked(l);
        const cls = isDone ? "done" : isCur ? "cur" : lock ? "locked" : "";
        const ic = isDone ? I.check : isCur ? I.play : lock ? I.lock : I.book;
        const inToday = !isDone && todaySet.has(l.id) ? " · in today’s plan" : "";
        const sub = (isDone ? "Done · tap to redo" : isCur ? "Up next · 3 questions" : lock ? "Finish the lesson before this to unlock" : "Ready") + inToday;
        h += `<li><button class="lesson ${cls}" data-lesson="${l.id}"><span class="node">${ic}</span>
          <span><div class="lt">${esc(l.title)}</div><div class="ls">${sub}</div></span></button></li>`;
      });
      h += `</ul>`;
    }
    h += `</section>`;
  });
  h += `</div>`;
  app.innerHTML = h;
  $("#practice").onclick = startPractice;
  app.querySelectorAll("[data-unit]").forEach(b => b.onclick = () => {
    const ui = +b.dataset.unit; S.open = (S.open === ui) ? -1 : ui; save(); render();
    if (S.open === ui) b.scrollIntoView({ block: "start", behavior: "smooth" });
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
  if (nxt) h += `<div class="panel"><h3>Continue your track</h3><p>Unit ${nxt.ui+1} · ${esc(nxt.title)}</p>
    <button class="cta" id="cont">Start lesson</button></div>`;
  h += `<div class="panel"><h3>Daily review</h3><p>${doneCount
      ? `10 quick questions from lessons you’ve finished${weak ? `, starting with ${weak} you’ve missed before` : ""}.`
      : "Finish your first lesson, then come back here to review it."}</p>
    <button class="cta ghost" id="rev" ${doneCount ? "" : "disabled"}>Start review</button></div></div>`;
  app.innerHTML = h;
  if (nxt) $("#cont").onclick = () => startLesson(nxt);
  if (doneCount) $("#rev").onclick = startPractice;
}

/* ---------- plan ---------- */
const PLAN_LENGTHS = [14, 30, 45, 60];
const DEFAULT_PLAN_DAYS = 30, DEFAULT_REMIND = "19:00";
let draftDays = DEFAULT_PLAN_DAYS;

function plural(n, word){ return `${n} ${word}${n === 1 ? "" : "s"}`; }
function unitsOf(ids){ return [...new Set(ids.map(id => UNITS[BY_ID[id].ui].title))]; }

function unitsPanel(){
  return `<div class="panel"><h3>Units in your plan</h3>
    <p>Untick units you already know. They stay in the app but drop out of your daily count.</p>
    <div class="upicks">${UNITS.map((u, ui) => {
      const left = u.lessons.filter(l => !S.done[l.id]).length;
      return `<label class="upick"><input type="checkbox" data-skip="${ui}" ${S.skip.includes(ui) ? "" : "checked"}>
        <span>${esc(u.title)}</span><small>${left ? `${left} left` : "done"}</small></label>`;
    }).join("")}</div></div>`;
}

function planSetupHTML(secs){
  const left = Plan.planOrder(UNITS, S.skip).filter(id => !S.done[id]).length;
  const pv = Plan.preview(Math.max(left, 1), draftDays, secs);
  return `<div class="panel"><h3>Finish everything in…</h3>
    <div class="seg">${PLAN_LENGTHS.map(n => `<button data-days="${n}" aria-pressed="${draftDays===n}">${n} days</button>`).join("")}</div>
    <div class="sumgrid">
      <div><b>${left}</b><small>lessons left</small></div>
      <div><b>${left ? pv.perDay : 0}</b><small>a day</small></div>
      <div><b>~${left ? pv.minutes : 0}</b><small>min a day</small></div>
    </div>
    <p>Done by <b>${Plan.dayLabel(today() + draftDays - 1)}</b>. Each lesson is a short read plus 3 questions, about ${Math.round(secs / 60 * 10) / 10} min.
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
      ${nxt ? `<p style="margin:14px 0 12px">Next: Unit ${nxt.ui+1} · ${esc(nxt.title)}</p><button class="cta" id="plannext">Start lesson</button>` : ""}</div>
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
  const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
  app.querySelectorAll("[data-days]").forEach(b => b.onclick = () => { draftDays = +b.dataset.days; render(); });
  app.querySelectorAll("[data-skip]").forEach(c => c.onchange = () => {
    const ui = +c.dataset.skip;
    S.skip = c.checked ? S.skip.filter(x => x !== ui) : [...S.skip, ui]; save(); render();
  });
  app.querySelectorAll("[data-relen]").forEach(b => b.onclick = () => {
    S.plan = { ...S.plan, days: today() - S.plan.start + +b.dataset.relen }; save(); render();
    toast(`Plan now ends ${Plan.dayLabel(today() + +b.dataset.relen - 1)}.`);
  });
  on("#startplan", () => { S.plan = { start: today(), days: draftDays, remind: DEFAULT_REMIND }; save(); render(); });
  on("#endplan", () => { if (confirm("End this plan? Your finished lessons stay finished.")) { S.plan = null; save(); render(); } });
  on("#plannext", () => { const n = nextUp(); if (n) startLesson(n); });
  on("#addremind", () => downloadReminder(s, secs));
  const t = $("#remindat");
  if (t) t.onchange = () => { if (t.value) { S.plan = { ...S.plan, remind: t.value }; save(); } };
}

/* ---------- profile ---------- */
function renderProfile(){
  const doneCount = Object.keys(S.done).length;
  const unitsDone = UNITS.filter(u => u.lessons.every(l => S.done[l.id])).length;
  let h = `<div class="top"><div class="wrap"><h1>Profile</h1>${statsRow()}</div></div><div class="wrap">
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
  app.innerHTML = h;
  app.querySelectorAll("[data-goal]").forEach(b => b.onclick = () => { S.goal = +b.dataset.goal; save(); render(); });
  $("#reset").onclick = () => {
    if (confirm("Reset all progress? This can’t be undone.")) {
      const goal = S.goal; localStorage.removeItem(KEY); S = load(); S.goal = goal; save(); render();
    }
  };
}

function render(){
  renderTabs();
  if (tab === "track") renderTrack(); else if (tab === "daily") renderDaily();
  else if (tab === "plan") renderPlan(); else renderProfile();
}

/* ---------- session (lesson or practice) ---------- */
function startLesson(l){
  const items = [{ k:"teach", l }, ...l.qs.map(q => ({ k:"q", q }))];
  const startedAt = Date.now();
  runSession(items, {
    kicker: `Unit ${l.ui+1} · ${UNITS[l.ui].title}`,
    onFinish: (st) => {
      const first = !S.done[l.id];
      S.done[l.id] = true;
      if (first) S.doneOn[l.id] = today();
      recordTime((Date.now() - startedAt) / 1000);
      const xp = (first ? 10 : 5) + (st.perfect ? 5 : 0);
      award(xp, true);
      const n = nextInUnit(UNITS[l.ui]); S.open = n ? l.ui : Math.min(l.ui + 1, UNITS.length - 1); save();
      return { title: first ? "Lesson complete" : "Lesson reviewed", xp, acc: st.acc };
    }
  });
}
function startPractice(){
  const pool = ALL.filter(l => S.done[l.id]).flatMap(l => l.qs);
  if (!pool.length) return toast("Finish a lesson first, then practice it here.");
  const missed = shuffle(pool.filter(q => S.miss[q.id] > 0));
  const rest = shuffle(pool.filter(q => !(S.miss[q.id] > 0)));
  const pick = [...missed, ...rest].slice(0, 10);
  runSession(shuffle(pick).map(q => ({ k:"q", q })), {
    kicker: "Practice",
    onFinish: (st) => { const xp = 5 + (st.perfect ? 5 : 0); award(xp, false); return { title: "Practice complete", xp, acc: st.acc }; }
  });
}

function runSession(items, opts){
  const queue = items.slice();
  const retried = new Set();
  const qTotal = items.filter(i => i.k === "q").length;
  let idx = 0, firstTry = 0;
  const firstSeen = new Set();
  const el = document.createElement("div");
  el.className = "session"; el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true");
  document.body.appendChild(el);
  document.body.style.overflow = "hidden";

  function close(){ el.remove(); document.body.style.overflow = ""; render(); }
  function top(){
    const pct = Math.round(idx / queue.length * 100);
    return `<div class="s-top"><button id="quit" aria-label="Quit">${I.x}</button>
      <div class="pbar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.max(4,pct)}%"></span></div></div>`;
  }
  function bindQuit(){
    el.querySelector("#quit").onclick = () => {
      if (idx === 0 || confirm("Quit? Progress in this lesson won’t be saved.")) close();
    };
  }
  function step(){
    if (idx >= queue.length) return finish();
    const it = queue[idx];
    if (it.k === "teach") {
      el.innerHTML = `${top()}<div class="s-body slide"><div class="kicker">${esc(opts.kicker)}</div>
        <h2>${esc(it.l.title)}</h2><div class="teach">${teachHTML(it.l.teach)}</div></div>
        <div class="s-foot"><div class="in"><button class="cta" id="go">Continue</button></div></div>`;
      bindQuit();
      el.querySelector("#go").onclick = () => { idx++; step(); };
      el.querySelector(".s-body").scrollTop = 0;
      return;
    }
    const q = it.q, choices = shuffle(q.opts);
    let sel = -1;
    el.innerHTML = `${top()}<div class="s-body slide"><div class="kicker">${it.retry ? "Try this one again" : "Choose the right answer"}</div>
      <div class="prompt">${fmt(q.p)}</div>
      <div class="opts">${choices.map((c,i) => `<button class="opt" data-i="${i}"><span class="k">${i+1}</span><span>${fmt(c)}</span></button>`).join("")}</div></div>
      <div class="s-foot" id="foot"><div class="in"><button class="cta" id="check" disabled>Check</button></div></div>`;
    bindQuit();
    const btns = [...el.querySelectorAll(".opt")];
    btns.forEach(b => b.onclick = () => {
      sel = +b.dataset.i; btns.forEach(x => x.classList.toggle("sel", x === b));
      el.querySelector("#check").disabled = false;
    });
    el.querySelector("#check").onclick = () => {
      if (sel < 0) return;
      const right = choices[sel] === q.ok;
      btns.forEach((b,i) => { b.disabled = true; b.classList.remove("sel");
        if (choices[i] === q.ok) b.classList.add("right"); else if (i === sel) b.classList.add("wrong"); });
      if (!firstSeen.has(q.id)) { firstSeen.add(q.id); if (right) firstTry++; }
      if (right) { if (S.miss[q.id]) { S.miss[q.id] = Math.max(0, S.miss[q.id] - 1); save(); } }
      else {
        S.miss[q.id] = (S.miss[q.id] || 0) + 1; save();
        if (!retried.has(q.id)) { retried.add(q.id); queue.push({ k:"q", q, retry:true }); }
        if (navigator.vibrate) navigator.vibrate(60);
      }
      const praise = ["Nice!","Correct!","You got it.","Exactly.","Great job."];
      const foot = el.querySelector("#foot");
      foot.className = "s-foot slide " + (right ? "good" : "bad");
      foot.innerHTML = `<div class="in"><div class="fb"><span class="ic">${right ? I.check : I.x}</span><div>
        <b>${right ? praise[Math.floor(Math.random()*praise.length)] : "Not quite"}</b>
        ${right ? (q.why ? `<span>${fmt(q.why)}</span>` : "") : `<span>Answer: ${fmt(q.ok)}${q.why ? "<br>" + fmt(q.why) : ""}</span>`}
        </div></div><button class="cta ${right ? "" : "red"}" id="next">Continue</button></div>`;
      const nb = el.querySelector("#next"); nb.focus({ preventScroll:true });
      nb.onclick = () => { idx++; step(); };
    };
  }
  function finish(){
    const acc = qTotal ? Math.round(firstTry / qTotal * 100) : 100;
    const r = opts.onFinish({ acc, perfect: acc === 100 });
    el.innerHTML = `<div class="s-body"><div class="finish slide">
      <div class="trophy">${I.trophy}</div><h2>${esc(r.title)}</h2>
      <div class="chips"><div class="chip"><small>XP earned</small><b>+${r.xp}</b></div>
      <div class="chip"><small>Accuracy</small><b>${r.acc}%</b></div>
      <div class="chip"><small>Streak</small><b>${liveStreak()} 🔥</b></div></div></div></div>
      <div class="s-foot"><div class="in"><button class="cta" id="done">Continue</button></div></div>`;
    el.querySelector("#done").onclick = close;
  }
  document.addEventListener("keydown", function keys(e){
    if (!document.body.contains(el)) return document.removeEventListener("keydown", keys);
    const n = parseInt(e.key, 10);
    const opt = el.querySelector(`.opt[data-i="${n-1}"]:not([disabled])`);
    if (opt) opt.click();
    if (e.key === "Enter") { const b = el.querySelector("#next, #check:not([disabled]), #go, #done"); if (b) { e.preventDefault(); b.click(); } }
  });
  step();
}

render();
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
})();
