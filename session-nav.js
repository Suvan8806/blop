/* Lesson-session navigation: go back to earlier steps (read only), "Show lesson", and the report button.
   NavLogic (history index and arrow keys) is pure and tested in node (test/session-nav.test.js).
   core.js's runSession hooks in through create(el) -> { topHTML, bind, record, key }:
     topHTML()   extra top-bar buttons (back, forward, report), inside .s-top
     bind(item)  after each live step renders (bindQuit): wires the buttons and the "Show lesson" link
     record()    in next(), before moving on: snapshots the finished step
     key(e)      first thing in the keydown handler; true means the key is taken (arrows, review mode) */
(function () {
"use strict";

/* h: number of finished steps in the history; view: the index being reviewed, or -1 for the live step. */
const NavLogic = {
  start: () => ({ h: 0, view: -1 }),
  push: s => ({ h: s.h + 1, view: -1 }),
  back: s => s.view === -1 ? (s.h > 0 ? { ...s, view: s.h - 1 } : s) : { ...s, view: Math.max(0, s.view - 1) },
  forward: s => s.view === -1 ? s : { ...s, view: s.view + 1 >= s.h ? -1 : s.view + 1 },
  live: s => ({ ...s, view: -1 }),
  canBack: s => s.view === -1 ? s.h > 0 : s.view > 0,
  canForward: s => s.view !== -1,
  reviewing: s => s.view !== -1,
  /* "back", "forward" or null for a keydown. inField: focus is in a text field or a widget that uses arrows. */
  keyAction(e, inField) {
    if (!e || inField || e.ctrlKey || e.metaKey || e.shiftKey) return null;
    return e.key === "ArrowLeft" ? "back" : e.key === "ArrowRight" ? "forward" : null;
  },
  /* "u3l2q5" -> "u3l2" (the lesson a question belongs to). */
  lessonOf: qid => String(qid).replace(/q\d+$/, "")
};

if (typeof window === "undefined") { module.exports = NavLogic; return; }
const B = window.Blop;
if (!B || !B.I) return;

const SVG = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const IC = {
  back: SVG('<path d="M15 5l-7 7 7 7"/>'),
  fwd: SVG('<path d="M9 5l7 7-7 7"/>'),
  flag: SVG('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>')
};
const FIELD = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-arrows], .seq, .pool, .match";
const MAX_SHOWN = 2000;

/* A sheet over the session (Show lesson, Report). Escape or the backdrop closes it, focus stays inside and
   returns to where it was. Keys inside it never reach the session's handler. Returns close(), with the sheet element as close.el. */
function sheet(host, { label, html, focus }) {
  const prev = document.activeElement;
  const sh = document.createElement("div");
  sh.className = "nsheet";
  sh.setAttribute("role", "dialog"); sh.setAttribute("aria-modal", "true"); sh.setAttribute("aria-label", label);
  sh.innerHTML = `<div class="nsheet-in"><div class="nsheet-h"><h2>${B.esc(label)}</h2>
    <button class="nx" aria-label="Close">${B.I.x}</button></div>${html}</div>`;
  const behind = [...host.children].filter(c => !c.inert);
  behind.forEach(c => { c.inert = true; });
  host.appendChild(sh);
  function close() {
    if (!sh.isConnected) return;
    sh.remove();
    behind.forEach(c => { c.inert = false; });
    if (prev && prev.isConnected) prev.focus({ preventScroll: true });
  }
  sh.addEventListener("click", e => { if (e.target === sh) close(); });
  sh.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const f = [...sh.querySelectorAll("button:not([disabled]), textarea, a[href], [tabindex='0']")];
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  });
  sh.querySelector(".nx").onclick = close;
  (sh.querySelector(focus || ".nx") || sh.querySelector(".nx")).focus({ preventScroll: true });
  close.el = sh;
  return close;
}

function lessonSheet(host, l) {
  if (!l) return;
  sheet(host, { label: l.title, focus: ".nsheet-body",
    html: `<div class="nsheet-body" tabindex="0"><div class="kicker">${B.esc(B.unitLabel(l.ui))}</div>
      <div class="teach">${B.teachHTML(l.teach)}</div></div>` });
}

function create(el) {
  let s = NavLogic.start(), hist = [], cur = null, live = null; // live: the live step's nodes while reviewing
  const $ = q => el.querySelector(q);
  const lessonOfItem = it => it.k === "teach" ? it.l : B.BY_ID[NavLogic.lessonOf(it.q.id)];
  const viewed = () => NavLogic.reviewing(s) ? hist[s.view].item : cur;

  function topHTML() {
    return `<button id="nback" aria-label="Previous step"${NavLogic.canBack(s) ? "" : " disabled"}>${IC.back}</button>
      <button id="nfwd" aria-label="Next step" hidden>${IC.fwd}</button>
      <button id="nflag" class="nflag" aria-label="Report a problem with this question">${IC.flag}</button>`;
  }
  /* "Show lesson" under the kicker of a question (live or a snapshot). */
  function lessonLink(body, item) {
    if (!body || item.k !== "q") return;
    let b = body.querySelector(".nlesson");
    if (!b) {
      b = document.createElement("button");
      b.className = "nlesson"; b.type = "button"; b.textContent = "Show lesson";
      const k = body.querySelector(".kicker");
      if (k) k.after(b); else body.prepend(b);
    }
    b.onclick = () => lessonSheet(el, lessonOfItem(item));
  }
  function bind(item) {
    cur = item;
    $("#nback").onclick = () => go(NavLogic.back(s), "#nback");
    $("#nfwd").onclick = () => go(NavLogic.forward(s), "#nfwd");
    $("#nflag").onclick = report;
    lessonLink($(".s-body"), item);
  }
  /* The live step is done (Continue): keep a read-only copy of what it showed. Typed values are written into
     the markup so the copy shows them. */
  function record() {
    const body = $(".s-body"), foot = $(".s-foot");
    if (!cur || !body) return;
    body.querySelectorAll("input, textarea").forEach(i => {
      if (i.tagName === "TEXTAREA") i.textContent = i.value; else i.setAttribute("value", i.value);
    });
    const fb = foot && foot.querySelector(".fb");
    const tone = foot && foot.classList.contains("good") ? "good" : foot && foot.classList.contains("bad") ? "bad" : "";
    hist = [...hist, { item: cur, body: body.innerHTML, fb: fb ? fb.outerHTML : "", tone }];
    s = NavLogic.push(s);
  }
  function reviewNodes(r) {
    const wrap = document.createElement("div");
    wrap.innerHTML = `<div class="s-body nrev"><p class="nrev-note">Earlier step ${s.view + 1} of ${s.h} · read only</p>${r.body}</div>
      <div class="s-foot ${r.tone}"><div class="in">${r.fb}<button class="cta ghost" id="nlive">Back to current</button></div></div>`;
    const [body, foot] = wrap.children;
    body.querySelectorAll(".qa").forEach(q => { q.inert = true; });
    body.querySelectorAll(".qa button, .qa input, .qa textarea").forEach(x => { x.disabled = true; });
    lessonLink(body, r.item);
    foot.querySelector("#nlive").onclick = () => go(NavLogic.live(s), "#nback");
    return [body, foot];
  }
  function go(next, focusSel) {
    if (next.view === s.view) return;
    s = next;
    const body = $(".s-body"), foot = $(".s-foot");
    if (NavLogic.reviewing(s)) {
      if (!live) live = [body, foot];
      const [rb, rf] = reviewNodes(hist[s.view]);
      body.replaceWith(rb); foot.replaceWith(rf);
      rb.scrollTop = 0;
    } else if (live) {
      body.replaceWith(live[0]); foot.replaceWith(live[1]);
      live = null;
    }
    const back = $("#nback"), fwd = $("#nfwd");
    back.disabled = !NavLogic.canBack(s);
    fwd.hidden = !NavLogic.canForward(s);
    const want = $(focusSel);
    (want && !want.disabled && !want.hidden ? want : !back.disabled ? back : !fwd.hidden ? fwd : $("#quit")).focus({ preventScroll: true });
  }
  function key(e) {
    if (!$("#nback")) return false; // the finish screen
    const inField = !!(e.target && e.target.closest && e.target.closest(FIELD));
    const a = NavLogic.keyAction(e, inField);
    if (a === "back" && NavLogic.canBack(s)) { e.preventDefault(); go(NavLogic.back(s), "#nback"); return true; }
    if (a === "forward" && NavLogic.canForward(s)) { e.preventDefault(); go(NavLogic.forward(s), "#nfwd"); return true; }
    if (!NavLogic.reviewing(s)) return false;
    // Reviewing: the hidden live step must not react. Enter (not on a button) goes back to it.
    if (e.key === "Enter" && !(e.target && e.target.closest && e.target.closest("button, a, textarea"))) { e.preventDefault(); go(NavLogic.live(s), "#nback"); }
    return true;
  }
  /* What the report is about: the step on screen (reviewed or live). */
  function report() {
    const it = viewed(), body = $(".s-body");
    if (!it || !B.report) return;
    const isQ = it.k === "q";
    const text = isQ
      ? [body && body.querySelector(".prompt"), ...(body ? body.querySelectorAll(".qa .opt") : [])]
        .filter(Boolean).map(n => (n.classList.contains("opt") ? n.lastElementChild || n : n).textContent.replace(/\s+/g, " ").trim()).join("\n")
      : it.l.title;
    B.report.open(el, { lessonId: isQ ? NavLogic.lessonOf(it.q.id) : it.l.id, questionId: isQ ? it.q.id : "teach",
      shownText: text.slice(0, MAX_SHOWN) });
  }
  return { topHTML, bind, record, key };
}

B.sessionNav = { create, sheet, NavLogic };
})();
