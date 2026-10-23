/* Core: content data, saved state, shared helpers, and the lesson/practice session runner.
   Everything is shared with qtypes.js and app.js through window.Blop. */
(() => {
const B = window.Blop = window.Blop || {};
const L = B.logic;
const KEY = "mlepath-v1";

/* ---------- data ---------- */
const UNITS = L.buildUnits(window.CURRICULUM);
const ALL = UNITS.flatMap(u => u.lessons);
const BY_ID = Object.fromEntries(ALL.map(l => [l.id, l]));
const QS = Object.fromEntries(ALL.flatMap(l => l.qs.map(q => [q.id, q])));

/* ---------- state ---------- */
function today(){ const d = new Date(); return Math.floor((d - d.getTimezoneOffset()*60000) / 864e5); }
const ST = window.BlopState;
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
/* A random id for this browser, kept in localStorage and never synced. XP earned here is counted under it. */
const DEVICE_KEY = "blop-device-id";
const DEVICE_ID = (() => {
  try {
    const v = localStorage.getItem(DEVICE_KEY);
    if (v && /^d[0-9a-f]{16,32}$/.test(v)) return v;
    const bytes = new Uint8Array(8);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
    const id = "d" + [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch (e) { return "dlocal"; }
})();
/* Fill defaults and upgrade old saved shapes. Also used on merged data from sync, which comes from another
   device and may be malformed: every field is checked and kept within bounds (BlopState.clean and each
   module's own sanitizer), and unknown fields are dropped. Returns a new object. */
function normalize(raw){
  const src = isObj(raw) ? raw : {};
  const st = Object.assign({ done:{}, xp:0, xpLog:{}, streak:0, last:-1, miss:{}, goal:2, day:-1, dayLessons:0, dayXp:0, open:null,
    doneOn:{}, times:[], plan:null, skip:[], subject:"ml", srs:{}, remind: ST.DEFAULT_REMIND,
    settingsUpdatedAt:0, updatedAt:0, resetAt:0, progressUpdatedAt:0, jobs:[], mock:[], jobTarget: window.Jobs ? Jobs.DEFAULT_TARGET : 15 }, ST.clean(src));
  st.skip = Array.isArray(st.skip) ? [...new Set(st.skip.filter(x => Number.isInteger(x) && x >= 0 && x < UNITS.length))].slice(0, UNITS.length) : [];
  if (!(st.open === null || (Number.isInteger(st.open) && st.open >= -1 && st.open < UNITS.length))) st.open = null;
  if (![1, 2, 3, 5].includes(st.goal)) st.goal = 2;
  st.srs = window.SRS ? SRS.clean(st.srs) : {};
  st.subject = L.validSubject(st.subject);
  // The reminder time used to live on the plan; it's a setting now.
  if (!("remind" in src) && isObj(src.plan) && typeof src.plan.remind === "string") st.remind = src.plan.remind;
  st.remind = ST.validTime(st.remind);
  if (window.Plan) {
    st.plan = Plan.migratePlan(st.plan, { unitCount: UNITS.length, lessonCount: ALL.length });
    if (Plan.isActive(st.plan) && !Number.isFinite(st.plan.startRemaining)) {
      const order = Plan.planOrder(UNITS, Plan.effectiveSkip(st.skip, st.plan.knownUnits, UNITS.length));
      st.plan = { ...st.plan, startRemaining: Plan.estimateStartRemaining(order, st.done, st.doneOn, st.plan.start) };
    }
  } else st.plan = null;
  if (window.SRS) { // only lessons that still exist get a schedule
    const known = Object.fromEntries(Object.keys(st.done).filter(id => st.done[id] && BY_ID[id]).map(id => [id, true]));
    st.srs = SRS.migrate(st.srs, known, today(), Date.now());
  }
  st.jobs = window.Jobs ? Jobs.sanitize(st.jobs) : [];
  st.jobTarget = window.Jobs ? Jobs.clampTarget(st.jobTarget) : 15;
  st.mock = window.Mock ? Mock.sanitize(st.mock) : [];
  return st;
}
function load(){
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch(e) {}
  return normalize(s);
}
const S = load(); // same object for the whole session; replaceState() refills it in place
function save(){ S.updatedAt = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e) {} }
/* Something worth syncing changed (a finished lesson or review, a job, the plan or a setting):
   save now and let sync push it a moment later. */
function commit(){ save(); if (B.sync && B.sync.soon) B.sync.soon(); }
function replaceState(next){
  Object.keys(S).forEach(k => delete S[k]);
  Object.assign(S, normalize(next));
}
/* Clears study progress on this device. Job applications and settings stay. The reset is stamped (resetAt), so
   syncing doesn't bring back progress from copies made before it. */
function reset(){ replaceState(ST.resetProgress(S, Date.now())); commit(); }
/* Forgets everything on this device (account switch, or "Sign out and clear this device"). */
function wipe(){
  replaceState({});
  save();
  try { localStorage.removeItem("blop-mock-drafts"); } catch (e) {}
}
/* Study progress changed; a sync merge compares this stamp with the latest reset. */
function touchProgress(){ S.progressUpdatedAt = Date.now(); }
/* Change settings (goal, jobTarget, subject, remind, skip) and stamp them for sync. */
function setSettings(patch){ replaceState(ST.withSettings(S, patch, Date.now())); commit(); }
function rollDay(){ if (S.day !== today()) { S.day = today(); S.dayLessons = 0; S.dayXp = 0; } }
function award(xp, isLesson){
  rollDay();
  Object.assign(S, ST.addXp(S, DEVICE_ID, xp));
  S.dayXp += xp;
  touchProgress();
  if (isLesson) S.dayLessons++;
  const t = today();
  if (S.last !== t) { S.streak = (S.last === t - 1) ? S.streak + 1 : 1; S.last = t; }
  commit();
}
function liveStreak(){ return (S.last >= today() - 1) ? S.streak : 0; }
const MAX_LESSON_SECS = 900, MIN_LESSON_SECS = 15, KEEP_TIMES = 20;
function recordTime(secs){
  S.times = [...S.times, Math.min(MAX_LESSON_SECS, Math.max(MIN_LESSON_SECS, Math.round(secs)))].slice(-KEEP_TIMES);
}

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
function esc(t){ return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function fmt(t){ return esc(t).replace(/`([^`]+)`/g, "<code>$1</code>"); }
function teachHTML(t){
  return t.split("\n\n").map(p => p.startsWith("$")
    ? `<pre><code>${esc(p.slice(1))}</code></pre>`
    : `<p>${fmt(p).replace(/\n/g,"<br>")}</p>`).join("");
}
function problemsHTML(l){
  if (!l.problems.length) return "";
  return `<div class="probs"><h3>Practice on LeetCode</h3><ul>${l.problems.map(p => `<li>${esc(p)}</li>`).join("")}</ul></div>`;
}
function shuffle(a){ a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; }
function toast(msg){
  const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; el.setAttribute("role","status");
  document.body.appendChild(el); setTimeout(() => el.remove(), 2200);
}
function unlocked(l){ return l.li === 0 || !!S.done[UNITS[l.ui].lessons[l.li - 1].id]; }
function nextInUnit(u){ return u.lessons.find(l => !S.done[l.id]); }
function nextOverall(){ return ALL.find(l => !S.done[l.id] && unlocked(l)); }
function unitLabel(ui){ const u = UNITS[ui]; return `${L.subjectName(u.tr)} · Unit ${u.num}`; }

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
  chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12.5a7.5 7.5 0 0 1-11 6.6L4 20.5l1.4-4.6A7.5 7.5 0 1 1 20 12.5z"/><path d="M9 11h6M9 14.5h4"/></svg>',
  case:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/></svg>',
  trophy:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z"/></svg>'
};

/* ---------- session starters ---------- */
function startLesson(l){
  const items = [{ k:"teach", l }, ...l.qs.map(q => ({ k:"q", q }))];
  const startedAt = Date.now();
  runSession(items, {
    kicker: `${unitLabel(l.ui)} · ${UNITS[l.ui].title}`,
    onFinish: (st) => {
      const first = !S.done[l.id];
      S.done[l.id] = true;
      if (first) S.doneOn[l.id] = today();
      if (window.SRS) S.srs = SRS.enter(S.srs, l.id, today(), Date.now());
      recordTime((Date.now() - startedAt) / 1000);
      const xp = (first ? 10 : 5) + (st.perfect ? 5 : 0);
      award(xp, true);
      const n = nextInUnit(UNITS[l.ui]); S.open = n ? l.ui : nextUnitIn(l.ui); save();
      return { title: first ? "Lesson complete" : "Lesson reviewed", xp, acc: st.acc };
    }
  });
}
/* After finishing a unit, open the next unit of the same subject (or stay on the last one). */
function nextUnitIn(ui){
  const same = L.unitsFor(UNITS, UNITS[ui].tr);
  const i = same.findIndex(u => u.ui === ui);
  return (same[i + 1] || same[i]).ui;
}
/* ---------- spaced repetition ---------- */
const reviewable = id => !!BY_ID[id] && BY_ID[id].qs.length > 0;
function dueReviews(){ return window.SRS ? SRS.dueIds(S.srs, today(), reviewable) : []; }
function isDue(id){ return !!(S.srs[id] && S.srs[id].due <= today()); }
/* Daily review: questions from due lessons, missed ones first. A reviewed lesson moves up the ladder
   when at least two of its questions (or all, if it has fewer) were asked and all were right first try;
   any miss makes it due again tomorrow; with fewer asked it stays as it was. */
function startReview(){
  const r = window.SRS ? SRS.pickReview({ srs: S.srs, today: today(), miss: S.miss, valid: reviewable,
    qsOf: id => shuffle(BY_ID[id].qs.map(q => q.id)) }) : { qids: [] };
  if (!r.qids.length) return startPractice("Extra practice");
  runSession(r.qids.map(id => ({ k:"q", q: QS[id] })), {
    kicker: "Daily review",
    onFinish: (st) => {
      const g = SRS.gradeDetail(S.srs, st.first, today(), Date.now(), id => BY_ID[id] ? BY_ID[id].qs.length : 0);
      S.srs = g.srs;
      const xp = 5 + (st.perfect ? 5 : 0); award(xp, false);
      return { title: "Review complete", xp, acc: st.acc, note: reviewNote(g) };
    }
  });
}
function reviewNote(g){
  const parts = [`${plural(g.up.length, "lesson")} moved further out`];
  if (g.back.length) parts.push(`${g.back.length} due again tomorrow`);
  if (g.kept.length) parts.push(`${g.kept.length} unchanged (too few of ${g.kept.length === 1 ? "its" : "their"} questions came up, so ${g.kept.length === 1 ? "it stays" : "they stay"} due)`);
  return parts.join(", ") + ".";
}
function startPractice(label){
  const kicker = typeof label === "string" ? label : "Practice";
  const pool = ALL.filter(l => S.done[l.id]).flatMap(l => l.qs);
  if (!pool.length) return toast("Finish a lesson first, then practice it here.");
  const missed = shuffle(pool.filter(q => S.miss[q.id] > 0));
  const rest = shuffle(pool.filter(q => !(S.miss[q.id] > 0)));
  const pick = [...missed, ...rest].slice(0, 10);
  runSession(shuffle(pick).map(q => ({ k:"q", q })), {
    kicker,
    onFinish: (st) => { const xp = 5 + (st.perfect ? 5 : 0); award(xp, false); return { title: "Practice complete", xp, acc: st.acc }; }
  });
}

/* ---------- session runner ---------- */
/* True when the key event's target is a text field, select or editable element. */
function isTyping(t){ return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "")); }
const PRAISE = ["Nice!","Correct!","You got it.","Exactly.","Great job."];
function runSession(items, opts){
  const queue = items.slice();
  const retried = new Set(), first = {}; // first: question id -> right on the first try
  const qTotal = items.filter(i => i.k === "q").length;
  let idx = 0, firstTry = 0, ctl = null;
  const el = document.createElement("div");
  el.className = "session"; el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true");
  document.body.appendChild(el);
  document.body.style.overflow = "hidden";

  function close(){ el.remove(); document.body.style.overflow = ""; B.render(); }
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
  function next(){ idx++; ctl = null; step(); }
  function step(){
    if (idx >= queue.length) return finish();
    const it = queue[idx];
    if (it.k === "teach") return teach(it.l);
    question(it.q, it.retry);
  }
  function teach(l){
    el.innerHTML = `${top()}<div class="s-body slide"><div class="kicker">${esc(opts.kicker)}</div>
      <h2>${esc(l.title)}</h2><div class="teach">${teachHTML(l.teach)}</div>${problemsHTML(l)}</div>
      <div class="s-foot"><div class="in"><button class="cta" id="go">Continue</button></div></div>`;
    bindQuit();
    el.querySelector("#go").onclick = next;
    el.querySelector(".s-body").scrollTop = 0;
  }
  function question(q, retry){
    const T = B.qtypes;
    el.innerHTML = `${top()}<div class="s-body slide"><div class="kicker">${retry ? "Try this one again" : T.kicker(q)}</div>
      ${T.codeHTML ? T.codeHTML(q) : ""}<div class="prompt" id="qp">${T.prompt(q)}</div><div class="qa" data-q="${q.id}"></div></div>
      <div class="s-foot" id="foot" aria-live="polite"><div class="in"><button class="cta" id="check" disabled>${T.checkLabel(q)}</button></div></div>`;
    bindQuit();
    const check = el.querySelector("#check");
    ctl = T.mount(el.querySelector(".qa"), q, { ready: on => { check.disabled = !on; }, answer: right => feedback(q, right) });
    check.onclick = () => ctl.check();
  }
  function feedback(q, right){
    if (!(q.id in first)) { first[q.id] = right; if (right) firstTry++; }
    if (right) { if (S.miss[q.id]) { S.miss[q.id] = Math.max(0, S.miss[q.id] - 1); touchProgress(); save(); } }
    else {
      S.miss[q.id] = Math.min(ST.LIMITS.COUNT, (S.miss[q.id] || 0) + 1); touchProgress(); save();
      if (!retried.has(q.id)) { retried.add(q.id); queue.push({ k:"q", q, retry:true }); }
      if (navigator.vibrate) navigator.vibrate(60);
    }
    const foot = el.querySelector("#foot");
    foot.className = "s-foot slide " + (right ? "good" : "bad");
    foot.innerHTML = `<div class="in"><div class="fb"><span class="ic">${right ? I.check : I.x}</span><div>
      <b>${right ? PRAISE[Math.floor(Math.random()*PRAISE.length)] : "Not quite"}</b>
      ${right ? (q.why ? `<span>${fmt(q.why)}</span>` : "") : `<span>${B.qtypes.answerHTML(q)}${q.why ? "<br>" + fmt(q.why) : ""}</span>`}
      </div></div><button class="cta ${right ? "" : "red"}" id="next">Continue</button></div>`;
    const nb = el.querySelector("#next"); nb.focus({ preventScroll:true });
    nb.onclick = next;
  }
  function finish(){
    const acc = qTotal ? Math.round(firstTry / qTotal * 100) : 100;
    const r = opts.onFinish({ acc, perfect: qTotal > 0 && acc === 100, first }); // no bonus for a lesson with no questions
    el.innerHTML = `<div class="s-body"><div class="finish slide">
      <div class="trophy">${I.trophy}</div><h2>${esc(r.title)}</h2>
      <div class="chips"><div class="chip"><small>XP earned</small><b>+${r.xp}</b></div>
      <div class="chip"><small>Accuracy</small><b>${r.acc}%</b></div>
      <div class="chip"><small>Streak</small><b>${liveStreak()} 🔥</b></div></div>${r.note ? `<p class="fnote">${esc(r.note)}</p>` : ""}</div></div>
      <div class="s-foot"><div class="in"><button class="cta" id="done">Continue</button></div></div>`;
    el.querySelector("#done").onclick = close;
  }
  document.addEventListener("keydown", function keys(e){
    if (!document.body.contains(el)) return document.removeEventListener("keydown", keys);
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Keys typed into a field belong to the field: no digit, letter or Backspace shortcuts. Enter in a one-line
    // field checks the answer; in a textarea it is a new line.
    if (isTyping(e.target)) {
      if (e.key === "Enter" && !e.isComposing && e.target.tagName === "INPUT") {
        const b = el.querySelector("#check:not([disabled])"); if (b) { e.preventDefault(); b.click(); }
      }
      return;
    }
    if (ctl && !el.querySelector("#next") && ctl.key(e)) return e.preventDefault();
    if (e.key === "Enter") { const b = el.querySelector("#next, #check:not([disabled]), #go, #done"); if (b) { e.preventDefault(); b.click(); } }
  });
  step();
}

/* ---------- plan and header helpers, shared by the tabs ---------- */
function plural(n, word){ return `${n} ${word}${n === 1 ? "" : "s"}`; }
/* Units left out of the plan: the ones the user unticked, plus units added since the plan was made. */
function activePlan(){ return window.Plan && Plan.isActive(S.plan) ? S.plan : null; }
function planSkip(){
  return activePlan() ? Plan.effectiveSkip(S.skip, S.plan.knownUnits, UNITS.length) : S.skip;
}
/* Today's schedule for the active plan, or null. Also remembers today's target for the calendar. */
function sched(){
  if (!activePlan()) return null; // Plan is missing for one load if an old cached index.html is served
  const t = today();
  let s;
  // A plan that still can't be scheduled (bad data that got past normalize) shows as no plan, never a crash.
  try {
    s = Plan.schedule({ order: Plan.planOrder(UNITS, planSkip()), done: S.done, doneOn: S.doneOn,
      today: t, start: S.plan.start, days: S.plan.days });
  } catch (e) { return null; }
  const targets = Plan.recordTarget(S.plan.targets, t, s.todayTarget);
  // A recorded target is derived data, so it doesn't bump plan.updatedAt; sync merges targets per day.
  if (targets !== S.plan.targets) { S.plan = { ...S.plan, targets }; save(); }
  return s;
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
function statsRow(extra){
  const g = dayGoal();
  return `<div class="stats">
    <span class="pill" title="Day streak">${I.flame}${liveStreak()}</span>
    <span class="pill" title="Total XP">${I.bolt}${S.xp} XP</span>
    <span class="pill" title="${g.plan ? "New lessons today in your plan" : "Lessons today"}">${I.target}${g.done}/${g.goal} today</span>${extra || ""}
  </div>`;
}
function ringSVG(pct, label){
  const r = 40, c = 2*Math.PI*r;
  return `<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--sunk)" stroke-width="10"/>
    <circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--green)" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c*(1-pct)}" transform="rotate(-90 48 48)"/>
    <text x="48" y="54" text-anchor="middle" font-size="20" font-weight="800" fill="var(--ink)" font-family="Lexend,sans-serif">${esc(label)}</text></svg>`;
}

Object.assign(B, { normalize, commit, replaceState, setSettings, activePlan, plural, planSkip, sched, dayGoal, nextUp, statsRow, ringSVG, KEY, DEVICE_ID, UNITS, ALL, BY_ID, QS, S, today, load, save, reset, wipe, touchProgress, rollDay, award, liveStreak, recordTime,
  $, esc, fmt, teachHTML, shuffle, isTyping, toast, unlocked, nextInUnit, nextOverall, unitLabel, I,
  startLesson, startPractice, startReview, dueReviews, isDue, runSession, render: () => {} });
})();
