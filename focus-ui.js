/* The goal picker, in two screens: "What are you preparing for?" (a track) and "Your plan" (the path headline, time a
   day, skip chips, topics, Go deeper and the full unit list, all defaults the learner can leave alone). "Edit topics"
   is an optional third view. Shown on first run and from Today, Learn and Profile. Path maths lives in paths.js. */
(() => {
if (!window.Blop || !window.Blop.S || !window.Paths) return; // an old cached index.html; app.js shows the reload screen
const B = window.Blop;
const { UNITS, S, I, esc, commit, today, toast, plural, activePlan } = B;

const MINUTES = [5, 10, 20];
const DEFAULT_MINUTES = 10;
const PLAN_LENGTHS = [14, 30, 45, 60];
let el = null;      // the open picker, or null
let auto = false;   // opened by itself on first run (closes itself if a sync brings a focus in)
/* draft: { step: 1 | 2 | "topics", track, goals, known: Set, deep, minutes, deadline: null | "keep" | days,
   showDeadline, editing (changing an existing goal), direct (opened straight on screen 2) } */
let d = null;

/* First run: nothing studied, no plan and a goal never picked (or skipped). */
function needsOnboarding(){ return S.focus === null && !Object.keys(S.done).length && !activePlan(); }

function draftFrom(opts){
  const f = Paths.isActive(S.focus) ? S.focus : null;
  const edit = !!(opts && opts.edit && f);
  return { step: edit ? 2 : 1, track: f ? f.track || Paths.trackFor(f.goals) : null, goals: f ? f.goals.slice() : [],
    known: new Set(f ? f.known : []), deep: f ? f.deep : false, minutes: DEFAULT_MINUTES,
    deadline: activePlan() ? "keep" : null, showDeadline: false, editing: !!f, direct: edit };
}
function path(){ return Paths.pathFor(UNITS, d.goals, { known: [...d.known], done: S.done, secsOf: B.estSecs, deep: d.deep }); }
const avgSecs = p => (p.remaining ? p.secs / p.remaining : 120);
const track = () => Paths.trackById(d.track);
/* The track's name while its preset topics are unchanged, otherwise the topics (Paths.focusLabel). */
const trackLabel = () => Paths.focusLabel({ goals: d.goals, track: d.track }) || (track() ? track().label || track().title : "Your plan");

/* Lessons a day and days to finish, from the time a day or the deadline. */
function pace(p){
  const t = today(), plan = activePlan();
  if (d.deadline === "keep" && plan) {
    const days = Math.max(1, plan.start + plan.days - t);
    return { perDay: p.remaining ? Math.ceil(p.remaining / days) : 0, days, end: t + days - 1 };
  }
  if (Number.isInteger(d.deadline)) return { perDay: p.remaining ? Math.ceil(p.remaining / d.deadline) : 0, days: d.deadline, end: t + d.deadline - 1 };
  const perDay = Paths.perDayFor(d.minutes, avgSecs(p));
  const days = Math.min(Plan.MAX_DAYS, Math.max(1, Math.ceil(p.remaining / perDay)));
  return { perDay, days, end: t + days - 1 };
}
function headline(p){
  const s = Paths.summary(p, 1), pc = pace(p);
  const min = d.deadline === null ? d.minutes : Plan.minutesFor(pc.perDay, avgSecs(p));
  const when = d.deadline === null ? Paths.durationText(pc.days) : `done by ${Plan.dateLabel(pc.end, today())}`;
  return `<div class="fhead" aria-live="polite"><b>${plural(s.units, "unit")} · ${Paths.hoursText(s.minutes)}</b>
    <span>${p.remaining ? `~${min} min a day · ${when}` : "Nothing left to study here"}</span></div>`;
}

/* ---------- screen 1: what are you preparing for? ---------- */
function trackRow(t){
  return `<li><button class="trow${t.id === "essentials" ? " soft" : ""}" data-track="${t.id}" aria-pressed="${d.track === t.id}">
    <span><b>${esc(t.title)}</b><small>${esc(t.blurb)}</small></span><span class="chev" aria-hidden="true">›</span></button></li>`;
}
function step1(){
  return `<h2 id="ftitle" tabindex="-1">What are you preparing for?</h2>
    <p class="fsub">Pick one. You can fine-tune it next.</p>
    <ul class="trows">${Paths.TRACKS.map(trackRow).join("")}</ul>
    <button class="linkish soft fbrowse" id="fskip">${d.editing ? "Remove my goal and browse on my own" : "I’ll browse on my own"}</button>`;
}

/* ---------- screen 2: your plan ---------- */
function deadlineHTML(){
  const plan = activePlan();
  const opts = [...(plan ? [["keep", "Keep my date"]] : []), ...PLAN_LENGTHS.map(n => [n, `${n} days`])];
  return `<div class="seg fseg" role="group" aria-label="Deadline">${opts.map(([v, label]) =>
    `<button data-dead="${v}" aria-pressed="${d.deadline === v}">${label}</button>`).join("")}</div>`;
}
function chipsHTML(p){
  const chips = Paths.basicsChips(p);
  if (!chips.length) return "";
  return `<h3 class="fh">Already know some of this? Skip it:</h3>
    <div class="nchips" role="group" aria-label="Units to skip">${chips.map(([label, t]) =>
      `<button class="nchip" data-chip="${esc(t)}" aria-pressed="${d.known.has(t)}">${esc(label)}</button>`).join("")}</div>`;
}
function topicsLine(){
  const names = d.goals.map(Paths.goalById).filter(Boolean).map(g => g.title).join(", ");
  const link = d.track === "essentials" ? `<button class="linkish soft" id="fretrack">Pick a track instead</button>`
    : `<button class="linkish soft" id="ftopics">Edit topics ›</button>`;
  return `<div class="ftopics"><p><span>Topics:</span> ${esc(names)}</p>${link}</div>`;
}
function deepHTML(p){
  if (!p.deepExtra.length) return ""; // Coding and System design have no related deep dives
  const n = p.deepExtra.length, lessons = p.deepExtra.reduce((a, x) => a + x.lessons, 0);
  const sub = d.deep ? `${plural(n, "in-depth unit")} added to your plan` : `Add ${plural(n, "optional in-depth unit")} · +${plural(lessons, "lesson")}`;
  return `<div class="fdeep"><label class="switch dswitch"><span class="dtxt"><b>Go deeper</b><small>${sub}</small></span>
      <input type="checkbox" role="switch" id="fdeep" ${d.deep ? "checked" : ""} aria-describedby="fdeephelp"></label>
    <p class="fine" id="fdeephelp">Deep-dive units go further than most interviews ask. Turn this on if you have time or want to stand out.</p></div>`;
}
function unitRow(st, i){
  const on = !st.known;
  return `<li><label class="pstep${on ? "" : " off"}" style="--hue:${UNITS[st.ui].hue}">
    <input type="checkbox" data-known="${esc(st.title)}" ${on ? "checked" : ""}>
    <span class="pnum" aria-hidden="true">${i + 1}</span>
    <span class="ptxt"><b>${esc(Paths.shortTitle(st.title))}</b><small>${st.target ? "Your topic" : "Basics"}${st.deep ? " · in depth" : ""}${
      st.left ? "" : " · done"}${on ? "" : " · skipped"}</small></span></label></li>`;
}
function allUnitsHTML(p){
  return `<details class="fall" ${d.allOpen ? "open" : ""}><summary>See all ${plural(p.steps.length, "unit")}</summary>
    <p class="fine">In order, basics first. Untick any you already know: they stay in Browse but leave your plan.</p>
    <ol class="psteps">${p.steps.map(unitRow).join("")}</ol></details>`;
}
function step2(){
  const p = path();
  return `<div class="ftrack"><h2 id="ftitle" tabindex="-1">${esc(trackLabel())}</h2>
      ${d.direct ? "" : `<button class="linkish soft" id="fchange">Change</button>`}</div>
    ${headline(p)}
    <h3 class="fh">Time a day</h3>
    <div class="seg fseg" role="group" aria-label="Time a day">${MINUTES.map(m =>
      `<button data-min="${m}" aria-pressed="${d.deadline === null && d.minutes === m}">${m} min</button>`).join("")}</div>
    <button class="linkish soft fdeadlink" id="fdead" aria-expanded="${d.showDeadline}">${activePlan() ? "Deadline" : "Have an interview date? Set a deadline"}</button>
    ${d.showDeadline ? deadlineHTML() : ""}
    ${chipsHTML(p)}
    ${topicsLine()}
    ${deepHTML(p)}
    ${allUnitsHTML(p)}`;
}

/* ---------- optional: edit topics ---------- */
const CORE_UNITS = (() => { try { return Paths.pathFor(UNITS, [Paths.ALL_GOAL], { deep: false }).steps.length; } catch (e) { return 0; } })();
function topicCard(id){
  const g = Paths.goalById(id);
  if (!g) return "";
  const on = d.goals.includes(id);
  const title = id === Paths.ALL_GOAL ? `Everything (all ${CORE_UNITS} core units)` : g.title;
  return `<button class="gcard" data-fgoal="${g.id}" aria-pressed="${on}">
    <span class="gtick" aria-hidden="true">${on ? I.check : ""}</span><b>${esc(title)}</b><span>${esc(g.blurb)}</span></button>`;
}
function topicsStep(){
  const t = track();
  const ids = t ? t.topics : Paths.GOALS.filter(g => !g.deepGoal && g.id !== Paths.ALL_GOAL && g.id !== "essentials").map(g => g.id);
  const deepOn = d.goals.some(g => Paths.DEEP_TOPICS.includes(g));
  return `<h2 id="ftitle" tabindex="-1">Edit topics</h2>
    <p class="fsub">Pick up to ${Paths.MAX_GOALS}. blop adds the basics each one needs.</p>
    <div class="gcards">${ids.map(topicCard).join("")}</div>
    <details class="fall" ${deepOn ? "open" : ""}><summary>Go deeper topics</summary>
      <div class="gcards">${Paths.DEEP_TOPICS.map(topicCard).join("")}</div></details>
    <div class="gcards fevery">${topicCard(Paths.ALL_GOAL)}</div>`;
}

/* ---------- shell ---------- */
function foot(){
  if (d.step === 1) return "";
  if (d.step === "topics") return `<div class="in"><button class="cta" id="fdone" ${d.goals.length ? "" : "disabled"}>Done</button></div>`;
  const ok = path().included.length > 0;
  return `<div class="in"><button class="cta" id="fnext" ${ok ? "" : "disabled"}>${d.editing ? "Save my plan" : "Start first lesson"}</button></div>`;
}
function draw(){
  const body = d.step === 1 ? step1() : d.step === 2 ? step2() : topicsStep();
  const n = d.step === 1 ? 1 : 2;
  const closes = d.step === 1 || (d.step === 2 && d.direct);
  const back = closes ? `<button id="fback" aria-label="Close">${I.x}</button>` : `<button id="fback" aria-label="Back">‹</button>`;
  el.innerHTML = `<div class="s-top">${back}<div class="pbar" role="progressbar" aria-label="Step ${n} of 2" aria-valuenow="${n}" aria-valuemin="1" aria-valuemax="2"><span style="width:${n / 2 * 100}%"></span></div></div>
    <div class="s-body">${d.step === 2 ? `<div class="kicker">Your plan</div>` : ""}${body}</div>${d.step === 1 ? "" : `<div class="s-foot">${foot()}</div>`}`;
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
function pickTrack(id){
  const t = Paths.trackById(id);
  if (!t) return;
  if (d.track !== id || !d.goals.length) d.goals = t.preset.slice();
  d.track = id;
  go(2);
}
function toggleGoal(id){
  const has = d.goals.includes(id), all = Paths.ALL_GOAL;
  if (has) d.goals = d.goals.filter(g => g !== id);
  else if (id === all) d.goals = [all];
  else {
    const rest = d.goals.filter(g => g !== all);
    if (rest.length >= Paths.MAX_GOALS) return toast(`Pick up to ${Paths.MAX_GOALS} topics. Untick one first.`);
    d.goals = [...rest, id];
  }
  redraw(`[data-fgoal="${id}"]`);
}
function back(){
  if (d.step === "topics") return go(2);
  if (d.step === 2 && !d.direct) return go(1);
  return needsOnboarding() ? skip() : close();
}
function bind(){
  const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.onclick = fn; };
  el.querySelectorAll("[data-track]").forEach(b => b.onclick = () => pickTrack(b.dataset.track));
  el.querySelectorAll("[data-fgoal]").forEach(b => b.onclick = () => toggleGoal(b.dataset.fgoal));
  el.querySelectorAll("[data-min]").forEach(b => b.onclick = () => { d.minutes = +b.dataset.min; d.deadline = null; redraw(`[data-min="${b.dataset.min}"]`); });
  el.querySelectorAll("[data-dead]").forEach(b => b.onclick = () => {
    const v = b.dataset.dead; d.deadline = v === "keep" ? v : +v; redraw(`[data-dead="${v}"]`);
  });
  el.querySelectorAll("[data-chip]").forEach(b => b.onclick = () => {
    const t = b.dataset.chip;
    if (d.known.has(t)) d.known.delete(t); else d.known.add(t);
    redraw(`[data-chip="${CSS.escape(t)}"]`);
  });
  el.querySelectorAll("[data-known]").forEach(c => c.onchange = () => {
    const t = c.dataset.known;
    if (c.checked) d.known.delete(t); else d.known.add(t);
    d.allOpen = true;
    redraw(`[data-known="${CSS.escape(t)}"]`);
  });
  const all = el.querySelector(".fall"); if (all && d.step === 2) all.ontoggle = () => { d.allOpen = all.open; };
  const deep = el.querySelector("#fdeep"); if (deep) deep.onchange = () => { d.deep = deep.checked; redraw("#fdeep"); };
  on("#fdead", () => { d.showDeadline = !d.showDeadline; redraw("#fdead"); });
  on("#fchange", () => go(1));
  on("#fretrack", () => go(1));
  on("#ftopics", () => go("topics"));
  on("#fdone", () => go(2));
  on("#fback", back);
  on("#fnext", finish);
  on("#fskip", () => { const had = d.editing; skip(); if (had) toast("Goal removed. Browse anything in Learn."); });
}

/* No goal, and don't ask again on this account: Learn's Browse view. */
function skip(){ S.focus = Paths.makeFocus([], [], Date.now(), { deep: false }); commit(); close(); if (B.goTab) B.goTab("learn"); }
function finish(){
  const now = Date.now(), p = path(), pc = pace(p);
  S.focus = Paths.makeFocus(d.goals, [...d.known], now, { deep: d.deep, track: d.track });
  if (d.deadline !== "keep" || !activePlan()) {
    S.plan = Plan.create({ start: today(), days: Math.min(Plan.MAX_DAYS, Math.max(1, pc.days)), knownUnits: UNITS.length,
      startRemaining: p.remaining, now });
  }
  commit();
  const editing = d.editing;
  close();
  if (B.goTab) B.goTab("today");
  if (editing) return toast("Your plan is updated.");
  const first = B.pathNext && B.pathNext();
  if (first) B.startLesson(first);
}

function onKey(e){ if (e.key === "Escape" && el) { e.preventDefault(); back(); } }
function open(opts){
  if (el) return;
  auto = !!(opts && opts.auto);
  d = draftFrom(opts);
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
/* ---------- after the landing (landing.js calls B.afterLanding) ---------- */
const SYNC_WAIT_MS = 10000;
let holding = false; // signed in from the landing: no picker until the account's first sync has settled
const landingVisible = () => !!(B.landing && B.landing.visible());
/* The dashboard (Today), with the picker over it when LandingLogic.afterLandingStep says so. */
function afterLandingGo(viaSignIn){
  const LL = window.LandingLogic;
  const step = LL ? LL.afterLandingStep(S, { viaSignIn }) : needsOnboarding() ? "picker" : "dashboard";
  if (B.goTab) B.goTab("today"); // on first run this render already opens the picker
  if (step === "picker" && !el) open({ auto: needsOnboarding() });
}
/* Wait for the sync that follows sign-in (or its error, a sign-out, or a timeout), then decide. */
function afterSignInSync(){
  const sync = B.sync;
  if (!sync || !sync.onChange || !sync.state) return afterLandingGo(true);
  const started = Date.now();
  let settled = false, off = null, timer = null;
  const done = () => {
    if (settled) return;
    settled = true; holding = false;
    if (off) off();
    clearTimeout(timer);
    afterLandingGo(true);
  };
  const check = s => { if (!s.user || s.syncError || (!s.syncing && s.lastSynced >= started)) done(); };
  holding = true;
  if (B.goTab) B.goTab("today");
  off = sync.onChange(check);
  timer = setTimeout(done, SYNC_WAIT_MS);
  check(sync.state());
}
B.afterLanding = opts => opts && opts.viaSignIn ? afterSignInSync() : afterLandingGo(false);

/* Called on every render: open on first run, and close a first-run picker if a sync brought progress or a goal in.
   Never under the landing (it opens after "Start learning"), nor while a landing sign-in waits for its first sync. */
function maybeOnboard(){
  if (holding || landingVisible()) return;
  if (!el && needsOnboarding() && !document.querySelector(".session")) open({ auto: true });
  else if (el && auto && !needsOnboarding()) close();
}

/* B.openFocus(): the picker from screen 1. B.openFocus({ edit: true }): straight to "Your plan" for the current goal. */
B.openFocus = opts => open({ auto: false, edit: !!(opts && opts.edit) });
B.maybeOnboard = maybeOnboard;
B.focusNeedsOnboarding = needsOnboarding;
})();
