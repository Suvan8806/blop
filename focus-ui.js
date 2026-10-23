/* "What do you want to learn?": the three-step focus picker (goals, the path with units you already know,
   then a pace). Shown on first run and from Today and Profile. Path maths lives in paths.js. */
(() => {
if (!window.Blop || !window.Blop.S || !window.Paths) return; // an old cached index.html; app.js shows the reload screen
const B = window.Blop;
const { UNITS, S, I, esc, commit, setSettings, today, toast, plural, activePlan } = B;

const PLAN_LENGTHS = [14, 30, 45, 60];
const PER_DAY = [1, 2, 3, 5];
const DEFAULT_DAYS = 30;
let el = null;      // the open picker, or null
let auto = false;   // opened by itself on first run (closes itself if a sync brings a focus in)
let d = null;       // draft: { step, goals, known:Set, pace: "keep" | days | "free", perDay }

/* First run: nothing studied, no plan and a focus never picked (or skipped). */
function needsOnboarding(){ return S.focus === null && !Object.keys(S.done).length && !activePlan(); }

function draftFrom(){
  const f = Paths.isActive(S.focus) ? S.focus : null;
  return { step: 1, goals: f ? f.goals.slice() : [], known: new Set(S.focus ? S.focus.known : []),
    pace: activePlan() ? "keep" : DEFAULT_DAYS, perDay: PER_DAY.includes(S.goal) ? S.goal : 2 };
}
function path(){ return Paths.pathFor(UNITS, d.goals, { known: [...d.known], done: S.done, secs: Plan.lessonSecs(S.times) }); }
const secs = () => Plan.lessonSecs(S.times);
function hours(min){ return min < 60 ? `${min} min` : `${Math.round(min / 6) / 10} h`; }

/* ---------- step 1: goals ---------- */
function goalCard(g){
  const on = d.goals.includes(g.id);
  const p = Paths.pathFor(UNITS, [g.id], { known: [...d.known], done: S.done });
  return `<button class="gcard" data-fgoal="${g.id}" aria-pressed="${on}">
    <span class="gtick" aria-hidden="true">${on ? I.check : ""}</span>
    <b>${esc(g.title)}</b><span>${esc(g.blurb)}</span><small>${plural(p.lessons, "lesson")}</small></button>`;
}
function step1(){
  const groups = Paths.GROUPS.map(([id, name]) => [name, Paths.GOALS.filter(g => g.subject === id)]).filter(([, gs]) => gs.length);
  return `<h2 id="ftitle" tabindex="-1">What do you want to learn?</h2>
    <p class="fsub">Pick up to ${Paths.MAX_GOALS}. blop builds a path that starts with the basics each one needs, so you only do the lessons that get you there.</p>
    ${groups.map(([name, gs]) => `<h4 class="subhead">${esc(name)}</h4><div class="gcards">${gs.map(goalCard).join("")}</div>`).join("")}`;
}

/* ---------- step 2: the path ---------- */
function stepRow(st, i){
  const on = !st.known;
  return `<li><label class="pstep${on ? "" : " off"}" style="--hue:${UNITS[st.ui].hue}">
    <input type="checkbox" data-known="${esc(st.title)}" ${on ? "checked" : ""} aria-describedby="fhint">
    <span class="pnum" aria-hidden="true">${i + 1}</span>
    <span class="ptxt"><b>${esc(st.title)}</b><small>${st.target ? `<span class="gtag">Goal</span>` : "Prerequisite"} · ${
      st.left === st.lessons ? plural(st.lessons, "lesson") : st.left ? `${st.left} of ${st.lessons} left` : "done"}${on ? "" : " · you know this"}</small></span></label></li>`;
}
function step2(){
  const p = path();
  const units = p.steps.filter(s => !s.known).length;
  return `<h2 id="ftitle" tabindex="-1">Your path</h2>
    <p class="fsub">${esc(Paths.goalsLabel({ goals: d.goals }))}</p>
    <p class="fsub" id="fhint">Units in order, basics first. Untick any you already know: they stay in the app but leave your path.</p>
    <ol class="psteps">${p.steps.map(stepRow).join("")}</ol>
    <div class="sumgrid"><div><b>${units}</b><small>${units === 1 ? "unit" : "units"}</small></div>
      <div><b>${p.remaining}</b><small>lessons to go</small></div><div><b>~${hours(p.minutes)}</b><small>in total</small></div></div>`;
}

/* ---------- step 3: pace ---------- */
function step3(){
  const p = path(), left = p.remaining, t = today(), plan = activePlan();
  const opts = [...(plan ? [["keep", "Keep my plan"]] : []), ...PLAN_LENGTHS.map(n => [n, `${n} days`]), ["free", "No deadline"]];
  let perDay, line;
  if (d.pace === "free") {
    perDay = d.perDay;
    line = left ? `At ${plural(perDay, "lesson")} a day you’d finish in about ${plural(Math.ceil(left / perDay), "day")}.` : "Nothing left on this path.";
  } else {
    const end = d.pace === "keep" ? plan.start + plan.days - 1 : t + d.pace - 1;
    const days = Math.max(1, end - t + 1);
    perDay = left ? Math.ceil(left / days) : 0;
    line = `Done by <b>${Plan.dateLabel(end, t)}</b>. If you do more or fewer on a day, the days after it adjust.`;
  }
  return `<h2 id="ftitle" tabindex="-1">Pick your pace</h2>
    <p class="fsub">Finish your path in…</p>
    <div class="seg" role="group" aria-label="Deadline">${opts.map(([v, label]) => `<button data-pace="${v}" aria-pressed="${d.pace === v}">${label}</button>`).join("")}</div>
    ${d.pace === "free" ? `<p class="fsub" style="margin-top:14px">Lessons a day</p>
      <div class="seg" role="group" aria-label="Lessons a day">${PER_DAY.map(n => `<button data-per="${n}" aria-pressed="${d.perDay === n}">${n}</button>`).join("")}</div>` : ""}
    <div class="sumgrid"><div><b>${left}</b><small>lessons left</small></div><div><b>${perDay}</b><small>a day</small></div>
      <div><b>~${Plan.minutesFor(perDay, secs())}</b><small>min a day</small></div></div>
    <p class="fsub">${line}</p>`;
}

/* ---------- shell ---------- */
function foot(){
  const label = d.step === 3 ? "Start my path" : "Continue";
  const ok = d.step === 1 ? d.goals.length > 0 : path().steps.some(s => !s.known);
  const alt = d.step !== 1 ? "" : Paths.isActive(S.focus)
    ? `<button class="linkish soft" id="fclear">Remove my focus and study everything</button>`
    : `<button class="linkish soft" id="fskip">Skip for now, show me everything</button>`;
  return `<div class="in"><button class="cta" id="fnext" ${ok ? "" : "disabled"}>${label}</button>${alt}</div>`;
}
function draw(){
  const body = d.step === 1 ? step1() : d.step === 2 ? step2() : step3();
  const back = d.step === 1 ? `<button id="fback" aria-label="Close">${I.x}</button>` : `<button id="fback" aria-label="Back">‹</button>`;
  el.innerHTML = `<div class="s-top">${back}<div class="pbar" role="progressbar" aria-label="Step ${d.step} of 3" aria-valuenow="${d.step}" aria-valuemin="1" aria-valuemax="3"><span style="width:${d.step / 3 * 100}%"></span></div></div>
    <div class="s-body"><div class="kicker">Step ${d.step} of 3</div>${body}</div><div class="s-foot">${foot()}</div>`;
  bind();
}
function redraw(focusSel){
  const y = el.querySelector(".s-body").scrollTop;
  draw();
  el.querySelector(".s-body").scrollTop = y;
  const f = focusSel && el.querySelector(focusSel); if (f) f.focus({ preventScroll: true });
}
function go(step){
  d.step = step; draw();
  el.querySelector(".s-body").scrollTop = 0;
  el.querySelector("#ftitle").focus({ preventScroll: true });
}
function bind(){
  const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.onclick = fn; };
  el.querySelectorAll("[data-fgoal]").forEach(b => b.onclick = () => {
    const id = b.dataset.fgoal, has = d.goals.includes(id);
    if (!has && d.goals.length >= Paths.MAX_GOALS) return toast(`Pick up to ${Paths.MAX_GOALS} goals. Untick one first.`);
    d.goals = has ? d.goals.filter(g => g !== id) : [...d.goals, id];
    redraw(`[data-fgoal="${id}"]`);
  });
  el.querySelectorAll("[data-known]").forEach(c => c.onchange = () => {
    const t = c.dataset.known;
    if (c.checked) d.known.delete(t); else d.known.add(t);
    redraw(`[data-known="${CSS.escape(t)}"]`);
  });
  el.querySelectorAll("[data-pace]").forEach(b => b.onclick = () => {
    const v = b.dataset.pace; d.pace = v === "keep" || v === "free" ? v : +v; redraw(`[data-pace="${v}"]`);
  });
  el.querySelectorAll("[data-per]").forEach(b => b.onclick = () => { d.perDay = +b.dataset.per; redraw(`[data-per="${b.dataset.per}"]`); });
  on("#fback", () => d.step === 1 ? (needsOnboarding() ? skip() : close()) : go(d.step - 1));
  on("#fnext", () => d.step < 3 ? go(d.step + 1) : finish());
  on("#fskip", skip);
  on("#fclear", () => { S.focus = Paths.makeFocus([], [...d.known], Date.now()); commit(); close(); toast("Focus removed. Every unit is back in your plan."); });
}

/* No focus, and don't ask again on this account. */
function skip(){ S.focus = Paths.makeFocus([], [], Date.now()); commit(); close(); }
function finish(){
  const now = Date.now();
  S.focus = Paths.makeFocus(d.goals, [...d.known], now);
  const left = Paths.pathFor(UNITS, d.goals, { known: [...d.known], done: S.done }).remaining;
  if (d.pace === "free") {
    if (activePlan()) S.plan = Plan.ended(now);
    setSettings({ goal: d.perDay }); // also commits the focus
  } else {
    if (d.pace !== "keep") S.plan = Plan.create({ start: today(), days: d.pace, knownUnits: UNITS.length, startRemaining: left, now });
    commit();
  }
  close();
  if (B.goTab) B.goTab("today");
  toast("Your path is ready.");
}

function onKey(e){ if (e.key === "Escape" && el) { e.preventDefault(); el.querySelector("#fback").click(); } }
function open(opts){
  if (el) return;
  auto = !!(opts && opts.auto);
  d = draftFrom();
  el = document.createElement("div");
  el.className = "onb"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "ftitle");
  document.body.appendChild(el);
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", onKey);
  draw();
  el.querySelector("#ftitle").focus({ preventScroll: true });
}
function close(){
  if (!el) return;
  el.remove(); el = null; auto = false;
  document.body.style.overflow = "";
  document.removeEventListener("keydown", onKey);
  B.render();
}
/* Called on every render: open on first run, and close a first-run picker if a sync brought progress or a focus in. */
function maybeOnboard(){
  if (!el && needsOnboarding() && !document.querySelector(".session")) open({ auto: true });
  else if (el && auto && !needsOnboarding()) close();
}

B.openFocus = () => open({ auto: false });
B.maybeOnboard = maybeOnboard;
B.focusNeedsOnboarding = needsOnboarding;
})();
