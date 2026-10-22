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
  return Object.assign({ done:{}, xp:0, streak:0, last:-1, miss:{}, goal:2, day:-1, dayLessons:0, dayXp:0, open:null }, s || {});
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
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/></svg>',
  trophy:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z"/></svg>'
};

/* ---------- tabs ---------- */
let tab = "track";
function renderTabs(){
  const t = [["track","Track",I.path],["daily","Daily",I.sun],["profile","Profile",I.user]];
  $("#tabs").innerHTML = t.map(([k,label,ic]) =>
    `<button data-tab="${k}" ${tab===k?'aria-current="page"':""}><span class="ti">${ic}</span>${label}</button>`).join("");
  $("#tabs").querySelectorAll("button").forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); window.scrollTo(0,0); });
}
function statsRow(){
  rollDay();
  return `<div class="stats">
    <span class="pill" title="Day streak">${I.flame}${liveStreak()}</span>
    <span class="pill" title="Total XP">${I.bolt}${S.xp} XP</span>
    <span class="pill" title="Lessons today">${I.target}${S.dayLessons}/${S.goal} today</span>
  </div>`;
}

/* ---------- track ---------- */
function renderTrack(){
  if (S.open === null) { const n = nextOverall(); S.open = n ? n.ui : 0; }
  let h = `<div class="top"><div class="wrap"><h1>Your track</h1>${statsRow()}</div></div><div class="wrap">`;
  h += `<button class="cta ghost" id="practice" style="margin-top:4px">Practice what you’ve learned</button>`;
  UNITS.forEach((u, ui) => {
    const done = u.lessons.filter(l => S.done[l.id]).length;
    const open = S.open === ui;
    const nxt = nextInUnit(u);
    h += `<section class="unit" style="--hue:${u.hue}">
      <button class="banner" data-unit="${ui}" aria-expanded="${open}">
        <span class="num" aria-hidden="true">${ui+1}</span>
        <small>Unit ${ui+1}</small><h2>${esc(u.title)}</h2>
        <span class="meta">${done} of ${u.lessons.length} complete</span>
        <div class="ubar"><span style="width:${done/u.lessons.length*100}%"></span></div>
      </button>`;
    if (open) {
      h += `<ul class="lessons">`;
      u.lessons.forEach(l => {
        const isDone = !!S.done[l.id], isCur = nxt && nxt.id === l.id, lock = !unlocked(l);
        const cls = isDone ? "done" : isCur ? "cur" : lock ? "locked" : "";
        const ic = isDone ? I.check : isCur ? I.play : lock ? I.lock : I.book;
        const sub = isDone ? "Done · tap to redo" : isCur ? "Up next · 3 questions" : lock ? "Finish the lesson before this to unlock" : "Ready";
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
function renderDaily(){
  rollDay();
  const pct = Math.min(1, S.dayLessons / S.goal), r = 40, c = 2*Math.PI*r;
  const doneCount = Object.keys(S.done).length;
  const weak = Object.keys(S.miss).filter(k => S.miss[k] > 0 && QS[k]).length;
  const nxt = nextOverall();
  let h = `<div class="top"><div class="wrap"><h1>Daily</h1>${statsRow()}</div></div><div class="wrap">
  <div class="panel"><div class="ring">
    <svg viewBox="0 0 96 96"><circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--sunk)" stroke-width="10"/>
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--green)" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c*(1-pct)}" transform="rotate(-90 48 48)"/>
      <text x="48" y="54" text-anchor="middle" font-size="20" font-weight="800" fill="var(--ink)" font-family="Lexend,sans-serif">${S.dayLessons}/${S.goal}</text></svg>
    <div><h3>${pct >= 1 ? "Daily goal reached" : "Today’s goal"}</h3>
    <p style="margin:0">${pct >= 1 ? "Nice. Anything else today is bonus XP." : `Finish ${S.goal - S.dayLessons} more lesson${S.goal - S.dayLessons === 1 ? "" : "s"} to hit your goal.`}</p></div>
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
  <div class="panel"><h3>Daily goal</h3><p>Lessons per day. Each takes about two minutes.</p>
    <div class="seg">${[1,2,3,5].map(n => `<button data-goal="${n}" aria-pressed="${S.goal===n}">${n}</button>`).join("")}</div></div>
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
  if (tab === "track") renderTrack(); else if (tab === "daily") renderDaily(); else renderProfile();
}

/* ---------- session (lesson or practice) ---------- */
function startLesson(l){
  const items = [{ k:"teach", l }, ...l.qs.map(q => ({ k:"q", q }))];
  runSession(items, {
    kicker: `Unit ${l.ui+1} · ${UNITS[l.ui].title}`,
    onFinish: (st) => {
      const first = !S.done[l.id];
      S.done[l.id] = true;
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
