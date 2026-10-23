/* Job tracker (a screen inside Profile): one-tap "+1 Applied", today's count against a target, stats once there are
   enough applications, and a filterable list with status chips. Nothing is counted before the first application.
   Logic lives in jobs.js; all user text goes through esc(). */
(() => {
if (!window.Blop || !window.Blop.S || !window.Jobs) return; // an old cached index.html; app.js shows the reload screen
const B = window.Blop;
const { S, I, $, esc, commit, setSettings, today, toast } = B;
const STATS_FROM = 5; // the stats panel appears once this many applications are logged

let view = { status: "all", q: "" };
let form = null;   // null, or { id: null for a new one / the id being edited, draft: what's typed so far }
let picking = null; // id whose status picker is open

const newId = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Jobs.newId();
const dateText = day => Plan.dayLabel(day, { month: "short", day: "numeric", year: day < today() - 300 ? "numeric" : undefined });

/* ---------- pieces ---------- */
const hasJobs = () => Jobs.live(S.jobs).length > 0;
function headerHTML(){
  const week = hasJobs() ? Jobs.stats(S.jobs, today()).thisWeek : 0;
  return `<div class="top"><div class="wrap"><button class="linkish soft mback" id="jback">‹ Profile</button><h1>Job tracker</h1>
    ${hasJobs() ? `<div class="stats"><span class="pill" title="Applications this week (weeks start Monday)">${I.case}${week} applied this week</span></div>` : ""}</div></div>`;
}
function todayHTML(){
  if (!hasJobs()) return `<div class="panel"><h3>Track your applications</h3><p>Tap +1 Applied each time you send one. Add the company and role if you like, then move it along as you hear back.</p>
    <button class="cta jplus" id="plus1">+1 Applied</button>
    <div class="jrow"><button class="linkish soft" id="details" aria-expanded="${!!form && !form.id}">${form && !form.id ? "Hide details" : "+ Add details"}</button></div>
    ${form && !form.id ? formHTML(null) : ""}</div>`;
  const n = Jobs.countOn(S.jobs, today()), pct = Math.min(100, Math.round(n / S.jobTarget * 100));
  return `<div class="panel"><div class="jcount"><b>${n}</b><span>of ${S.jobTarget} today${n >= S.jobTarget ? " · target hit 🎉" : ""}</span></div>
    <div class="jbar" role="progressbar" aria-label="Applications today" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${S.jobTarget}"><span style="width:${Math.max(2, pct)}%"></span></div>
    <button class="cta jplus" id="plus1">+1 Applied</button>
    <div class="jrow"><button class="linkish soft" id="details" aria-expanded="${!!form && !form.id}">${form && !form.id ? "Hide details" : "+ Add details"}</button>
      <div class="stepper" role="group" aria-label="Daily target"><span>Target</span>
        <button data-tgt="-1" aria-label="Lower daily target">−</button><b>${S.jobTarget}</b><button data-tgt="1" aria-label="Raise daily target">+</button></div></div>
    ${form && !form.id ? formHTML(null) : ""}</div>`;
}
function formHTML(j){
  // What's been typed survives re-renders (filter taps, search, sync) until Save or Cancel.
  const v = { ...(j || { company: "", role: "", link: "", day: today() }), ...(form && form.draft) };
  return `<form class="jform" id="jform" novalidate>
    <label>Company<input name="company" maxlength="120" autocomplete="off" value="${esc(v.company)}"></label>
    <label>Role<input name="role" maxlength="120" autocomplete="off" value="${esc(v.role)}"></label>
    <label>Link<input name="link" inputmode="url" maxlength="500" autocomplete="off" placeholder="https://" value="${esc(v.link)}"></label>
    <label>Date applied<input name="day" type="date" value="${Jobs.isoFromDay(v.day)}" max="${Jobs.isoFromDay(today())}"></label>
    <div class="jfbtns"><button type="button" class="cta ghost" id="jcancel">Cancel</button><button type="submit" class="cta">${j ? "Save" : "Log application"}</button></div></form>`;
}
function statsHTML(){
  if (Jobs.live(S.jobs).length < STATS_FROM) return "";
  const s = Jobs.stats(S.jobs, today());
  const diff = s.thisWeek - s.lastWeek;
  return `<div class="panel"><h3>Stats</h3><div class="sumgrid">
    <div><b>${s.total}</b><small>total applied</small></div>
    <div><b>${s.rate}%</b><small>response rate</small></div>
    <div><b>${s.thisWeek}</b><small>this week (${diff >= 0 ? "+" : "−"}${Math.abs(diff)} vs last)</small></div></div>
    <p class="fine">Response rate counts any reply: online assessment, phone screen, onsite, offer or rejection.</p></div>`;
}
function chipHTML(j){
  return `<button class="schip st-${j.status}" data-pick="${esc(j.id)}" aria-expanded="${picking === j.id}" aria-label="Status: ${esc(longName(j.status))}. Change"${j.status === "oa" ? ` title="Online assessment"` : ""}>
    ${esc(Jobs.statusName(j.status))}<span aria-hidden="true">▾</span></button>`;
}
const longName = id => (id === "oa" ? "Online assessment" : Jobs.statusName(id));
function pickerHTML(j){
  return `<div class="spick" role="group" aria-label="Set status">${Jobs.STATUSES.map(([id]) =>
    `<button class="schip st-${id}" data-set="${esc(j.id)}" data-status="${id}" aria-pressed="${j.status === id}">${esc(longName(id))}</button>`).join("")}</div>`;
}
function itemHTML(j){
  if (form && form.id === j.id) return `<li class="job editing">${formHTML(j)}</li>`;
  const sub = [j.role, dateText(j.day)].filter(Boolean).map(esc).join(" · ");
  return `<li class="job"><div class="jtop"><div class="jmain"><b>${j.company ? esc(j.company) : `<span class="soft">Application</span>`}</b>
      <span>${sub}</span>${j.link ? `<a href="${esc(j.link)}" target="_blank" rel="noopener noreferrer">Job posting ↗</a>` : ""}</div>
      ${chipHTML(j)}</div>
    ${picking === j.id ? pickerHTML(j) : ""}
    <div class="jacts"><button data-edit="${esc(j.id)}">Edit</button><button data-del="${esc(j.id)}">Delete</button></div></li>`;
}
function listHTML(){
  const list = Jobs.filter(S.jobs, view);
  // The application being edited stays in the list even if the search or filter no longer matches it.
  const editing = form && form.id && S.jobs.find(j => j.id === form.id && !j.deleted);
  if (editing && !list.includes(editing)) list.unshift(editing);
  if (!Jobs.live(S.jobs).length) return `<p class="empty">No applications yet. Tap +1 Applied each time you send one.</p>`;
  if (!list.length) return `<p class="empty">Nothing matches.</p>`;
  return `<ul class="jobs">${list.map(itemHTML).join("")}</ul>`;
}
function filtersHTML(){
  const c = Jobs.counts(S.jobs);
  const opts = [["all", "All", Jobs.live(S.jobs).length], ...Jobs.STATUSES.map(([id, name]) => [id, name, c[id]])];
  return `<input type="search" id="jq" class="jsearch" placeholder="Search company" aria-label="Search by company" value="${esc(view.q)}">
    <div class="jfilt" role="group" aria-label="Filter by status">${opts.map(([id, name, n]) =>
      `<button data-filter="${id}" aria-pressed="${view.status === id}">${esc(name)} <small>${n}</small></button>`).join("")}</div>`;
}

/* ---------- actions ---------- */
function readForm(el){
  const f = new FormData(el);
  return { company: f.get("company"), role: f.get("role"), link: String(f.get("link") || ""),
    day: Jobs.dayFromISO(String(f.get("day") || "")), rawLink: String(f.get("link") || "").trim() };
}
function submit(el, render){
  const v = readForm(el);
  if (v.rawLink && !Jobs.safeLink(v.rawLink)) { toast("Links must be web addresses (http or https)."); return; }
  if (v.day !== null && v.day > today()) { toast("The date can't be in the future."); return; }
  const now = Date.now();
  if (form.id) S.jobs = Jobs.update(S.jobs, form.id, { company: v.company, role: v.role, link: v.link, ...(v.day !== null ? { day: v.day } : {}) }, now);
  else S.jobs = [...S.jobs, Jobs.create(v, { id: newId(), day: today(), now })];
  const added = !form.id;
  form = null; commit(); render();
  if (added) toast(`Logged · ${Jobs.countOn(S.jobs, today())} of ${S.jobTarget} today`);
}
function bindForm(render){
  const fe = $("#jform");
  if (!fe) return;
  fe.onsubmit = e => { e.preventDefault(); submit(fe, render); };
  fe.oninput = () => {
    if (!form) return;
    const f = new FormData(fe), day = Jobs.dayFromISO(String(f.get("day") || ""));
    form = { ...form, draft: { company: String(f.get("company") || ""), role: String(f.get("role") || ""),
      link: String(f.get("link") || ""), ...(day !== null ? { day } : {}) } };
  };
  $("#jcancel").onclick = () => { form = null; render(); };
}
function bindList(app, render){
  bindForm(render);
  const list = app.querySelector("#jlist");
  list.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => {
    picking = picking === b.dataset.pick ? null : b.dataset.pick; render();
    const p = app.querySelector(`[data-set="${CSS.escape(b.dataset.pick)}"][aria-pressed="true"]`); if (p) p.focus({ preventScroll: true });
  });
  list.querySelectorAll("[data-set]").forEach(b => b.onclick = () => {
    S.jobs = Jobs.update(S.jobs, b.dataset.set, { status: b.dataset.status }, Date.now());
    picking = null; commit(); render();
    const c = app.querySelector(`[data-pick="${CSS.escape(b.dataset.set)}"]`); if (c) c.focus({ preventScroll: true });
  });
  list.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => {
    form = { id: b.dataset.edit, draft: null }; picking = null; render();
    const first = app.querySelector("#jform input"); if (first) first.focus({ preventScroll: true });
  });
  list.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
    const j = S.jobs.find(x => x.id === b.dataset.del && !x.deleted);
    if (j && confirm(`Delete ${j.company ? `the ${j.company} application` : "this application"}? This can’t be undone.`)) {
      S.jobs = Jobs.remove(S.jobs, j.id, Date.now());
      if (form && form.id === j.id) form = null;
      commit(); render();
    }
  });
}
function bind(app, render){
  $("#jback").onclick = () => B.goTab("profile");
  $("#plus1").onclick = () => {
    S.jobs = [...S.jobs, Jobs.create(null, { id: newId(), day: today(), now: Date.now() })]; commit(); render();
    toast(`Logged · ${Jobs.countOn(S.jobs, today())} of ${S.jobTarget} today`);
  };
  $("#details").onclick = () => {
    form = form && !form.id ? null : { id: null, draft: null }; picking = null; render();
    const first = app.querySelector("#jform input"); if (first) first.focus({ preventScroll: true });
  };
  if (!hasJobs()) return bindForm(render);
  app.querySelectorAll("[data-tgt]").forEach(b => b.onclick = () => { setSettings({ jobTarget: Jobs.clampTarget(S.jobTarget + +b.dataset.tgt) }); render(); });
  app.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => {
    view = { ...view, status: b.dataset.filter }; render();
    const f = app.querySelector(`[data-filter="${b.dataset.filter}"]`); if (f) f.focus({ preventScroll: true });
  });
  const q = $("#jq");
  q.oninput = () => { // only the list re-renders, so the search box keeps focus
    view = { ...view, q: q.value };
    const list = app.querySelector("#jlist");
    const open = list.querySelector("li.editing"); // an open edit form is kept as is, focus and all
    list.innerHTML = listHTML();
    const slot = list.querySelector("li.editing");
    if (open && slot) slot.replaceWith(open);
    bindList(app, render);
  };
  bindList(app, render);
}

function renderJobs(app, render){
  app.innerHTML = `${headerHTML()}<div class="wrap">${todayHTML()}${statsHTML()}
    ${hasJobs() ? `<div class="panel"><h3>Applications</h3>${filtersHTML()}<div id="jlist">${listHTML()}</div></div>` : ""}</div>`;
  bind(app, render);
}

B.renderJobs = renderJobs;
})();
