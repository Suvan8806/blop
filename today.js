/* Today tab: one obvious next step (the hero's Continue button), reviews when they're due, and everything else
   folded away: today's lesson list, the month calendar and the plan settings. Schedule maths lives in plan.js;
   this file only renders and binds. */
(() => {
if (!window.Blop || !window.Blop.S) return; // an old cached index.html; app.js shows the reload screen
const B = window.Blop, L = B.logic;
const { UNITS, BY_ID, S, I, $, esc, commit, setSettings, today, toast, unlocked, unitLabel, startLesson, startReview, startPractice,
  dueReviews, plural, planSkip, planIds, hasFocus, pathNext, sched, dayGoal, nextUp, statsRow, estSecs, estLabel } = B;

const PLAN_LENGTHS = [14, 30, 45, 60];
const MINUTES = [5, 10, 20];
const DEFAULT_MINUTES = 10;
const CALENDAR_FROM_DAYS = 2;   // the month view appears once you've studied on this many different days
const REVIEW_QUESTIONS = 15, REVIEW_Q_SECS = 20;
const OPEN_KEY = "blop-today-open"; // which folded panels are open, on this device only
let calMonth = null; // { year, month } shown in the calendar; null means this month

/* ---------- folded panels ---------- */
function openSet(){ try { const v = JSON.parse(localStorage.getItem(OPEN_KEY)); return new Set(Array.isArray(v) ? v : []); } catch (e) { return new Set(); } }
function remember(id, isOpen){
  const s = openSet(); if (isOpen) s.add(id); else s.delete(id);
  try { localStorage.setItem(OPEN_KEY, JSON.stringify([...s])); } catch (e) {}
}
function fold(id, summary, body){
  return `<details class="panel fold" data-fold="${id}" ${openSet().has(id) ? "open" : ""}><summary>${summary}</summary><div class="fold-in">${body}</div></details>`;
}

/* ---------- today's lessons ---------- */
function todayIds(s){
  const t = today();
  const doneToday = planIds().filter(id => S.done[id] && S.doneOn[id] === t);
  return [...doneToday, ...s.plan[0].ids];
}
/* The next n unfinished lessons on the learning path. */
function nextOnPath(n){
  const out = [];
  for (const id of B.pathIds() || []) { if (out.length >= n) break; if (!S.done[id]) out.push(id); }
  return out;
}
const secsFor = ids => ids.reduce((a, id) => a + estSecs(BY_ID[id]), 0);
const avgSecs = ids => ids.length ? secsFor(ids) / ids.length : 120;
function lessonItem(id, isNext){
  const l = BY_ID[id], done = !!S.done[id], lock = !done && !unlocked(l);
  const cls = done ? "done" : lock ? "locked" : isNext ? "cur" : "";
  const ic = done ? I.check : lock ? I.lock : isNext ? I.play : I.book;
  const state = done ? "Done" : lock ? "After the one above" : isNext ? "Up next" : "Ready";
  return `<li><button class="lesson ${cls}" data-start="${id}" style="--hue:${UNITS[l.ui].hue}"><span class="node">${ic}</span>
    <span><div class="lt">${esc(l.title)}</div><div class="ls">${state} · ${esc(unitLabel(l.ui))} · ${estLabel(estSecs(l))}</div></span></button></li>`;
}

/* ---------- the hero: one button ---------- */
function paceLine(s){
  const date = d => Plan.dateLabel(d, today());
  if (s.overdue) return "Your deadline has passed. Pick a new one in Plan settings.";
  const a = Plan.aheadBy(s, S.plan.start, S.plan.days, today());
  return a < 0 ? `${-a} behind. An extra lesson or two this week catches you up.` : `On track for ${date(s.end)}`;
}
function doneHTML(title, text, btn){
  return `<div class="panel hero"><h3>${title}</h3><p>${text}</p>${btn || ""}</div>`;
}
function heroHTML(s){
  if (s && !s.total) return doneHTML("No units in your plan", "Open Plan settings below and tick at least one unit.");
  const pathDone = hasFocus() && !pathNext();
  if (pathDone) return doneHTML("Path complete 🎉", "You finished every lesson on your path. Choose a new goal, or keep it fresh with reviews.",
    `<button class="cta" id="focusnew">Choose a new goal</button>`);
  if (s && !s.remaining) return doneHTML("Plan complete 🎉", `You finished every lesson in your plan${
    s.end > today() ? `, ${plural(s.end - today(), "day")} early` : ""}. Keep it fresh with reviews, or end the plan in Plan settings.`);
  const next = nextUp();
  if (!next) return doneHTML("All done 🎉", "You’ve finished every lesson. Keep it fresh with reviews.");
  const g = dayGoal(), met = g.done >= g.goal;
  const verb = met ? "Keep going" : Object.keys(S.done).length ? "Continue" : "Start";
  // The header pill already shows "N of M today"; the hero adds only where the plan stands.
  const line = s ? paceLine(s) : "";
  return `<div class="panel hero">${met ? `<h3>Today’s done 🎉</h3>` : ""}
    <button class="cta hcta${met ? " ghost" : ""}" id="cont"><span class="hl">${verb}: ${esc(next.title)}</span>
      <span class="hs">${esc(unitLabel(next.ui))} · ${estLabel(estSecs(next))}</span></button>
    ${line ? `<p class="hline">${esc(line)}</p>` : ""}</div>`;
}
/* No goal: one quiet card. Someone who was never asked (an existing user from before goals) can say "Not now"; after
   that, or after "I'll browse on my own", it stays only while there's no plan either. */
function goalCardHTML(){
  if (!window.Paths || !B.openFocus || hasFocus() || (S.focus !== null && B.activePlan())) return "";
  return `<div class="panel nudge"><p>Want a plan? <button class="linkish soft inl" id="focusopen">Choose a goal</button> (takes 20 seconds)</p>
    ${S.focus === null ? `<button class="linkish soft" id="focusno">Not now</button>` : ""}</div>`;
}
/* Reviews: hidden until something is due. Primary only once today's lessons are done (one primary button). */
function reviewHTML(){
  const due = dueReviews().length, doneCount = Object.keys(S.done).length;
  if (!doneCount) return "";
  if (!due) return `<p class="caught">All caught up on reviews · <button class="linkish soft inl" id="practise">Practise anyway</button></p>`;
  const g = dayGoal(), met = g.done >= g.goal;
  const mins = Math.max(1, Math.round(Math.min(REVIEW_QUESTIONS, due * 3) * REVIEW_Q_SECS / 60));
  return `<div class="panel rev"><div class="revrow"><p><b>Quick review</b> · ${plural(due, "lesson")} · ~${mins} min</p>
      <button class="cta${met ? "" : " ghost"} revgo" id="rev">Review</button></div>
    <details class="how"><summary>How reviews work</summary><p>Finished lessons come back after 1, 3, 7, 21 and 60 days, missed questions first.
      Get a lesson’s questions right and it moves further out; miss one and it’s back tomorrow.</p></details></div>`;
}

/* ---------- calendar ---------- */
const MARK = { done: "✓", partial: "◐", missed: "✕", today: "•", rest: "–", upcoming: "", off: "" };
const LEGEND = [["done", "Target met"], ["partial", "Partly done"], ["missed", "Missed"], ["upcoming", "Upcoming"], ["rest", "Rest day"]];
function studyDays(){ return new Set(Object.keys(S.done).filter(id => S.done[id]).map(id => S.doneOn[id]).filter(d => d != null)).size; }
function lessonsByDay(s){
  const ids = s ? planIds() : Object.keys(S.done);
  const did = {};
  ids.forEach(id => { const d = S.doneOn[id]; if (S.done[id] && d != null) did[d] = (did[d] || 0) + 1; });
  return did;
}
/* Lessons expected on a day: recorded target for past plan days, the live target today, the schedule ahead.
   Without a plan, only days you studied (and today) are judged against your daily goal. */
function targetFn(s, did){
  const t = today();
  if (!s) return d => d === t ? S.goal : d < t && did[d] ? S.goal : null;
  const { start, days, targets, startRemaining } = S.plan;
  return d => {
    if (d === t) return s.todayTarget;
    if (d < start || d > s.end) return null;
    if (d < t) return Plan.pastTarget({ targets, day: d, startRemaining, days, total: s.total });
    const row = s.plan[d - t];
    return row ? row.ids.length : 0;
  };
}
function cellLabel(d, st, did, target){
  const date = Plan.dayLabel(d, { weekday: "long", month: "long", day: "numeric" });
  const of = `${did} of ${plural(target || 0, "lesson")}`;
  const text = { done: `target met, ${of}`, partial: `partly done, ${of}`, missed: `missed, ${of}`, today: `today, ${of}`,
    upcoming: `${plural(target, "lesson")} planned`, rest: "rest day", off: did ? plural(did, "lesson") : "nothing planned" }[st];
  return `${date}: ${text}`;
}
function calendarBody(s){
  const t = today(), cur = calMonth || Plan.monthOf(t);
  const m = Plan.monthInfo(cur.year, cur.month);
  const did = lessonsByDay(s), targetOf = targetFn(s, did);
  const cells = [];
  for (let i = 0; i < m.lead; i++) cells.push(`<div class="cd pad" aria-hidden="true"></div>`);
  for (let d = m.first; d < m.first + m.count; d++) {
    const n = did[d] || 0, target = targetOf(d);
    const st = Plan.dayStatus({ day: d, today: t, did: n, target });
    const mark = st === "upcoming" ? String(target) : MARK[st];
    cells.push(`<div class="cd st-${st}${d === t ? " is-today" : ""}" role="img" aria-label="${esc(cellLabel(d, st, n, target))}">
      <span class="dn">${d - m.first + 1}</span><span class="mk" aria-hidden="true">${mark}</span></div>`);
  }
  const title = Plan.dayLabel(m.first, { month: "long", year: "numeric" });
  const wds = ["S", "M", "T", "W", "T", "F", "S"].map(w => `<div class="wd">${w}</div>`).join("");
  return `<div class="calhead"><button class="calnav" data-cal="-1" aria-label="Previous month">‹</button>
      <h3 aria-live="polite">${esc(title)}</h3><button class="calnav" data-cal="1" aria-label="Next month">›</button></div>
    <div class="cal" role="group" aria-label="${esc(title)}"><div class="wds" aria-hidden="true">${wds}</div>${cells.join("")}</div>
    <ul class="legend">${LEGEND.map(([st, label]) => `<li><span class="cd st-${st} sw" aria-hidden="true"><span class="mk">${st === "upcoming" ? "2" : MARK[st]}</span></span>${label}</li>`).join("")}</ul>
    ${s ? "" : `<p style="margin:10px 0 0">Days you studied are judged against your daily goal. Start a plan to see upcoming days.</p>`}`;
}
function shiftMonth(delta){
  const cur = calMonth || Plan.monthOf(today());
  const k = cur.year * 12 + cur.month + delta;
  calMonth = { year: Math.floor(k / 12), month: k % 12 };
}

/* ---------- plan settings ---------- */
function unitPick(u, skip){
  const left = u.lessons.filter(l => !S.done[l.id]).length;
  return `<label class="upick"><input type="checkbox" data-skip="${u.ui}" ${skip.includes(u.ui) ? "" : "checked"}>
    <span>${esc(u.title)}</span><small>${left ? `${left} left` : "done"}</small></label>`;
}
function unitsBody(){
  const skip = planSkip();
  const groups = L.SUBJECTS.map(([id, name]) => [name, L.unitsFor(UNITS, id)]).filter(([, us]) => us.length);
  return `<p>Untick units you already know. They stay in the app but drop out of your daily count.</p>
    ${groups.map(([name, us]) => `<h4 class="subhead">${esc(name)}</h4><div class="upicks">${us.map(u => unitPick(u, skip)).join("")}</div>`).join("")}`;
}
const leftIds = () => planIds().filter(id => !S.done[id]);
function minutesSeg(current){
  return `<div class="seg" role="group" aria-label="Time a day">${MINUTES.map(m =>
    `<button data-min="${m}" aria-pressed="${current === m}">${m} min</button>`).join("")}</div>`;
}
/* Which "time a day" choice matches the plan's current daily target, if any. */
function currentMinutes(s, secs){
  return MINUTES.find(m => Paths.perDayFor(m, secs) === s.todayTarget) || null;
}
function settingsBody(s, secs){
  if (!s) {
    const left = leftIds().length;
    return `<h4 class="fh">Make a study plan</h4>
      <p>Pick a time a day. blop spreads ${hasFocus() ? "your path" : "everything"} (${plural(left, "lesson")}) across the days and adjusts if you miss one.</p>
      ${minutesSeg(null)}${hasFocus() ? "" : fold("units", "Edit units", unitsBody())}`;
  }
  const date = Plan.dateLabel(s.end, today());
  return `<h4 class="fh">Time a day</h4>${minutesSeg(currentMinutes(s, secs))}
    <h4 class="fh">Deadline <span class="soft">· ends ${esc(date)}</span></h4>
    <div class="seg" role="group" aria-label="Deadline">${PLAN_LENGTHS.map(n => `<button data-relen="${n}">${n} days</button>`).join("")}</div>
    ${s.overdue || !s.remaining ? "" : `<h4 class="fh">Add to my calendar</h4>
      <p>A daily event with an alert until your plan ends. For a reminder only on days you haven’t studied, use Reminders in Profile.</p>
      <div class="remind"><input type="time" id="remindat" value="${esc(S.remind)}" aria-label="Reminder time">
      <button class="cta ghost" id="addremind">Add to calendar</button></div>`}
    ${hasFocus() ? "" : fold("units", "Edit units", unitsBody())}
    <button class="linkish" id="endplan">End plan</button>`;
}
function downloadReminder(s, secs){
  const ics = Plan.reminderICS({ fromDay: today(), endDay: s.end, time: S.remind,
    minutes: Plan.minutesFor(s.todayTarget, secs), url: location.origin });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = "blop-reminder.ics";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Open the downloaded file to add the reminder.");
}
/* A plan whose remaining lessons take `perDay` a day from today, keeping its start (a very old plan restarts). */
function replanned(perDay){
  const left = leftIds().length, len = Math.max(1, Math.ceil(left / Math.max(1, perDay)));
  const days = today() - S.plan.start + len;
  return days <= Plan.MAX_DAYS ? { ...S.plan, days, updatedAt: Date.now() }
    : { ...S.plan, start: today(), days: len, targets: {}, startRemaining: left, updatedAt: Date.now() };
}

/* ---------- render and bind ---------- */
function lessonsFold(s){
  const ids = s ? todayIds(s) : hasFocus() ? nextOnPath(Math.max(1, dayGoal().goal - dayGoal().done)) : [];
  if (!ids.length) return "";
  const next = ids.find(id => !S.done[id]);
  return fold("lessons", `Today’s lessons (${ids.length})`, `<ul class="lessons tlist">${ids.map(id => lessonItem(id, id === next)).join("")}</ul>`);
}
function bind(app, s, secs, render){
  const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
  app.querySelectorAll("[data-fold]").forEach(f => f.ontoggle = () => remember(f.dataset.fold, f.open));
  app.querySelectorAll("[data-skip]").forEach(c => c.onchange = () => {
    const ui = +c.dataset.skip;
    if (B.activePlan()) {
      const r = Plan.setUnit(S.plan, S.skip, ui, c.checked, UNITS.length, Date.now());
      S.plan = r.plan; setSettings({ skip: r.skip });
    } else setSettings({ skip: c.checked ? S.skip.filter(x => x !== ui) : [...S.skip, ui] });
    render();
  });
  app.querySelectorAll("[data-min]").forEach(b => b.onclick = () => {
    const perDay = Paths.perDayFor(+b.dataset.min, secs);
    if (B.activePlan()) S.plan = replanned(perDay);
    else {
      const left = leftIds().length;
      S.plan = Plan.create({ start: today(), days: Math.min(Plan.MAX_DAYS, Math.max(1, Math.ceil(left / perDay))), knownUnits: UNITS.length,
        startRemaining: left, now: Date.now() });
    }
    commit(); render();
    toast(`About ${b.dataset.min} min a day. Done ${Plan.dateLabel(S.plan.start + S.plan.days - 1, today())}.`);
  });
  app.querySelectorAll("[data-relen]").forEach(b => b.onclick = () => {
    // A plan can't run longer than Plan.MAX_DAYS in total; a very old plan restarts from today instead.
    const len = +b.dataset.relen, days = today() - S.plan.start + len;
    S.plan = days <= Plan.MAX_DAYS ? { ...S.plan, days, updatedAt: Date.now() } : { ...S.plan, start: today(), days: len, targets: {},
      startRemaining: leftIds().length, updatedAt: Date.now() };
    commit(); render();
    toast(`Plan now ends ${Plan.dateLabel(today() + len - 1, today())}.`);
  });
  app.querySelectorAll("[data-start]").forEach(b => b.onclick = () => {
    const l = BY_ID[b.dataset.start];
    if (!unlocked(l)) return toast("Finish the lesson before this one to unlock it.");
    startLesson(l);
  });
  app.querySelectorAll("[data-cal]").forEach(b => b.onclick = () => {
    shiftMonth(+b.dataset.cal); render();
    const f = app.querySelector(`[data-cal="${b.dataset.cal}"]`); if (f) f.focus({ preventScroll: true });
  });
  on("#endplan", () => { if (confirm("End this plan? Your finished lessons stay finished.")) { S.plan = Plan.ended(Date.now()); commit(); render(); } });
  on("#cont", () => { const n = nextUp(); if (n) startLesson(n); });
  ["#focusopen", "#focusnew"].forEach(sel => on(sel, () => B.openFocus()));
  on("#focusno", () => { S.focus = Paths.makeFocus([], [], Date.now(), { deep: false }); commit(); render(); toast("OK. Choose a goal any time from Profile."); });
  on("#rev", startReview);
  on("#practise", () => startPractice("Practice"));
  on("#addremind", () => downloadReminder(s, secs));
  const t = $("#remindat");
  if (t) t.onchange = () => { if (t.value) setSettings({ remind: t.value }); };
}

function renderToday(app, render){
  if (!window.Plan) {
    app.innerHTML = `<div class="wrap"><div class="panel"><h3>Update ready</h3><p>Reload the app to open today’s plan.</p>
      <button class="cta" id="reload">Reload</button></div></div>`;
    $("#reload").onclick = () => location.reload();
    return;
  }
  const secs = avgSecs(leftIds());
  const s = sched();
  app.innerHTML = `<div class="top"><div class="wrap"><h1>Today</h1>${statsRow()}</div></div><div class="wrap">
    ${heroHTML(s)}
    ${reviewHTML()}
    ${goalCardHTML()}
    ${lessonsFold(s)}
    ${studyDays() >= CALENDAR_FROM_DAYS ? fold("month", "Your month", calendarBody(s)) : ""}
    ${fold("settings", "Plan settings", settingsBody(s, secs))}</div>`;
  bind(app, s, secs, render);
}

B.renderToday = renderToday;
})();
