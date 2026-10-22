/* Today tab: today's plan lessons, reviews due, the month calendar, and plan setup and settings.
   Schedule maths lives in plan.js; this file only renders and binds. */
(() => {
if (!window.Blop || !window.Blop.S) return; // an old cached index.html; app.js shows the reload screen
const B = window.Blop, L = B.logic;
const { UNITS, BY_ID, QS, S, I, $, esc, commit, setSettings, today, toast, unlocked, unitLabel, startLesson, startReview, dueReviews,
  plural, planSkip, sched, dayGoal, nextUp, statsRow, ringSVG } = B;

const PLAN_LENGTHS = [14, 30, 45, 60];
const DEFAULT_PLAN_DAYS = 30;
let draftDays = DEFAULT_PLAN_DAYS;
let calMonth = null; // { year, month } shown in the calendar; null means this month

/* ---------- today's lessons ---------- */
function todayIds(s){
  const t = today();
  const doneToday = Plan.planOrder(UNITS, planSkip()).filter(id => S.done[id] && S.doneOn[id] === t);
  return [...doneToday, ...s.plan[0].ids];
}
function lessonItem(id, isNext){
  const l = BY_ID[id], done = !!S.done[id], lock = !done && !unlocked(l);
  const cls = done ? "done" : lock ? "locked" : isNext ? "cur" : "";
  const ic = done ? I.check : lock ? I.lock : isNext ? I.play : I.book;
  const state = done ? "Done" : lock ? "Locked" : isNext ? "Up next" : "Ready";
  return `<li><button class="lesson ${cls}" data-start="${id}" style="--hue:${UNITS[l.ui].hue}"><span class="node">${ic}</span>
    <span><div class="lt">${esc(l.title)}</div><div class="ls">${state} · ${esc(unitLabel(l.ui))}</div></span></button></li>`;
}
function paceText(s){
  if (s.overdue) return `Your deadline (${Plan.dayLabel(s.end)}) has passed, so everything left is due today. Pick a new length below.`;
  const base = `${s.doneInPlan} of ${s.total} done · ${plural(s.daysLeft, "day")} left, ends ${Plan.dayLabel(s.end)}.`;
  if (!s.pace || s.finishDay === null) return base;
  const diff = s.end - s.finishDay;
  const when = diff > 0 ? `, ${plural(diff, "day")} early` : diff < 0 ? `, ${plural(-diff, "day")} late` : ", right on time";
  return `${base} At your pace (${Math.round(s.pace * 10) / 10} a day) you’d finish ${Plan.dayLabel(s.finishDay)}${when}.`;
}
function aheadHTML(s){
  const a = s.overdue ? -s.remaining : Plan.aheadBy(s, S.plan.start, S.plan.days, today());
  const [cls, head] = a > 0 ? ["ahead", `▲ ${plural(a, "lesson")} ahead of schedule`]
    : a < 0 ? ["behind", `▼ ${plural(-a, "lesson")} behind schedule`] : ["on", "● On schedule"];
  return `<div class="pace ${cls}"><b>${head}</b><span>${paceText(s)}</span></div>`;
}
function todayPlanHTML(s, secs){
  const pct = s.todayTarget ? Math.min(1, s.doneToday / s.todayTarget) : 1;
  const ids = todayIds(s);
  const next = ids.find(id => !S.done[id]);
  return `<div class="panel"><div class="ring">${ringSVG(pct, `${s.doneToday}/${s.todayTarget}`)}
      <div><h3>${s.todayLeft ? "Today’s plan" : "Today’s plan done"}</h3>
      <p style="margin:0">${s.todayLeft
        ? `${plural(s.todayLeft, "lesson")} to go, about ${Plan.minutesFor(s.todayLeft, secs)} min.`
        : "Anything extra today makes the rest of your plan lighter."}</p></div></div>
    ${ids.length ? `<ul class="lessons tlist">${ids.map(id => lessonItem(id, id === next)).join("")}</ul>` : ""}
    ${aheadHTML(s)}</div>`;
}
function goalHTML(){
  const g = dayGoal(), pct = Math.min(1, g.done / g.goal), left = g.goal - g.done, nxt = nextUp();
  return `<div class="panel"><div class="ring">${ringSVG(pct, `${g.done}/${g.goal}`)}
    <div><h3>${pct >= 1 ? "Daily goal reached" : "Today’s goal"}</h3>
    <p style="margin:0">${pct >= 1 ? "Nice. Anything else today is bonus XP."
      : `Finish ${plural(left, "more lesson")} to hit your goal.`}</p></div></div>
    ${nxt ? `<p style="margin:14px 0 12px">Next: ${esc(unitLabel(nxt.ui))} · ${esc(nxt.title)}</p>
    <button class="cta" id="cont">Start lesson</button>` : ""}</div>`;
}
function reviewPanel(){
  const doneCount = Object.keys(S.done).length;
  const weak = Object.keys(S.miss).filter(k => S.miss[k] > 0 && QS[k]).length;
  const due = dueReviews().length;
  if (!doneCount) return `<div class="panel"><h3>Reviews</h3><p>Finish your first lesson, then come back here to review it.</p>
    <button class="cta ghost" disabled>Start review</button></div>`;
  if (due) return `<div class="panel"><h3>Reviews due today <span class="count">${due}</span></h3>
    <p>${plural(due, "lesson")} to review, up to 15 questions${weak ? ", missed ones first" : ""}.
    A lesson comes back later once at least two of its questions (or its only one) came up and you got them all right; miss one and it’s back tomorrow. If fewer came up, it stays due.</p>
    <button class="cta" id="rev">Start review</button></div>`;
  return `<div class="panel"><h3>No reviews due</h3><p>You’re up to date. Extra practice mixes questions from lessons you’ve finished${weak ? `, starting with ${weak} you’ve missed` : ""}.</p>
    <button class="cta ghost" id="rev">Extra practice</button></div>`;
}

/* ---------- calendar ---------- */
const MARK = { done: "✓", partial: "◐", missed: "✕", today: "•", rest: "–", upcoming: "", off: "" };
const LEGEND = [["done", "Target met"], ["partial", "Partly done"], ["missed", "Missed"], ["upcoming", "Upcoming"], ["rest", "Rest day"]];
function lessonsByDay(s){
  const ids = s ? Plan.planOrder(UNITS, planSkip()) : Object.keys(S.done);
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
function calendarHTML(s){
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
  return `<div class="panel"><div class="calhead"><button class="calnav" data-cal="-1" aria-label="Previous month">‹</button>
      <h3 aria-live="polite">${esc(title)}</h3><button class="calnav" data-cal="1" aria-label="Next month">›</button></div>
    <div class="cal" role="group" aria-label="${esc(title)}"><div class="wds" aria-hidden="true">${wds}</div>${cells.join("")}</div>
    <ul class="legend">${LEGEND.map(([st, label]) => `<li><span class="cd st-${st} sw" aria-hidden="true"><span class="mk">${st === "upcoming" ? "2" : MARK[st]}</span></span>${label}</li>`).join("")}</ul>
    ${s ? "" : `<p style="margin:10px 0 0">Days you studied are judged against your daily goal. Start a plan to see upcoming days.</p>`}</div>`;
}
function shiftMonth(delta){
  const cur = calMonth || Plan.monthOf(today());
  const k = cur.year * 12 + cur.month + delta;
  calMonth = { year: Math.floor(k / 12), month: k % 12 };
}

/* ---------- plan setup and settings ---------- */
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
  return `<div class="panel"><h3>Make a study plan</h3><p>Finish everything in…</p>
    <div class="seg">${PLAN_LENGTHS.map(n => `<button data-days="${n}" aria-pressed="${draftDays===n}">${n} days</button>`).join("")}</div>
    <div class="sumgrid">
      <div><b>${left}</b><small>lessons left</small></div>
      <div><b>${left ? pv.perDay : 0}</b><small>a day</small></div>
      <div><b>~${left ? pv.minutes : 0}</b><small>min a day</small></div>
    </div>
    <p>Done by <b>${Plan.dayLabel(today() + draftDays - 1)}</b>. Each lesson is a short read plus a few questions, about ${Math.round(secs / 60 * 10) / 10} min.
    If you do more or fewer on a day, the days after it adjust.</p>
    <button class="cta" id="startplan" ${left ? "" : "disabled"}>Start my plan</button></div>`;
}
function planSettingsHTML(s){
  return `${s.overdue || !s.remaining ? "" : `<div class="panel"><h3>Daily reminder</h3>
      <p>Adds a repeating event with an alert to your phone’s calendar, every day until your plan ends.</p>
      <div class="remind"><input type="time" id="remindat" value="${esc(S.remind)}" aria-label="Reminder time">
      <button class="cta ghost" id="addremind">Add to calendar</button></div></div>`}
    <div class="panel"><h3>Change your plan</h3><p>Finish in this many days, counting from today.</p>
      <div class="seg">${PLAN_LENGTHS.map(n => `<button data-relen="${n}">${n}</button>`).join("")}</div>
      <button class="linkish" id="endplan" style="margin-top:8px">End plan</button></div>`;
}
function planStateHTML(s, secs){
  if (!s.total) return `<div class="panel"><h3>No units selected</h3><p style="margin:0">Tick at least one unit below to plan your days.</p></div>`;
  if (!s.remaining) return `<div class="panel"><h3>Plan complete 🎉</h3><p style="margin:0">You finished every lesson in your plan${
    s.end > today() ? `, ${plural(s.end - today(), "day")} early` : ""}. Keep it fresh with the daily review, or end the plan below to start a new one.</p></div>`;
  return todayPlanHTML(s, secs);
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

/* ---------- render and bind ---------- */
function bind(app, s, secs, render){
  const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
  app.querySelectorAll("[data-days]").forEach(b => b.onclick = () => { draftDays = +b.dataset.days; render(); });
  app.querySelectorAll("[data-skip]").forEach(c => c.onchange = () => {
    const ui = +c.dataset.skip;
    if (B.activePlan()) {
      const r = Plan.setUnit(S.plan, S.skip, ui, c.checked, UNITS.length, Date.now());
      S.plan = r.plan; setSettings({ skip: r.skip });
    } else setSettings({ skip: c.checked ? S.skip.filter(x => x !== ui) : [...S.skip, ui] });
    render();
  });
  app.querySelectorAll("[data-relen]").forEach(b => b.onclick = () => {
    S.plan = { ...S.plan, days: today() - S.plan.start + +b.dataset.relen, updatedAt: Date.now() }; commit(); render();
    toast(`Plan now ends ${Plan.dayLabel(today() + +b.dataset.relen - 1)}.`);
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
  on("#startplan", () => {
    const left = Plan.planOrder(UNITS, planSkip()).filter(id => !S.done[id]).length;
    S.plan = Plan.create({ start: today(), days: draftDays, knownUnits: UNITS.length, startRemaining: left, now: Date.now() });
    commit(); render();
  });
  on("#endplan", () => { if (confirm("End this plan? Your finished lessons stay finished.")) { S.plan = Plan.ended(Date.now()); commit(); render(); } });
  on("#cont", () => { const n = nextUp(); if (n) startLesson(n); });
  on("#rev", startReview);
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
  const secs = Plan.lessonSecs(S.times);
  const s = sched();
  app.innerHTML = `<div class="top"><div class="wrap"><h1>Today</h1>${statsRow()}</div></div><div class="wrap">
    ${s ? planStateHTML(s, secs) : goalHTML()}
    ${reviewPanel()}
    ${calendarHTML(s)}
    ${s ? planSettingsHTML(s) : planSetupHTML(secs)}
    ${unitsPanel()}</div>`;
  bind(app, s, secs, render);
}

B.renderToday = renderToday;
})();
