/* The landing page: the first screen for a new visitor (or /?welcome), shown in #landing over the app shell.
   landing-logic.js decided in <head> whether it shows (html.lp-on). Starting without an account sets the
   blop-seen-landing flag and calls B.afterLanding(); "Sign in" opens sync-ui's panel in a sheet. All text is
   static or from the curriculum, and nothing here is bound inline (the CSP has no 'unsafe-inline' for scripts). */
(() => {
const LL = window.LandingLogic;
const root = document.getElementById("landing");
if (!window.Blop || !window.Blop.S || !LL || !root) return;
const B = window.Blop, L = B.logic;
const { esc, I } = B;

/* Where "Start learning" goes. A later onboarding step can replace this; it defaults to the dashboard. */
if (typeof B.afterLanding !== "function") B.afterLanding = () => { if (B.goTab) B.goTab("learn"); };

if (!LL.early) { root.remove(); return; }

const SUBJECT_COPY = {
  ml: { name: "Machine learning", hue: L.HUES[0],
    blurb: "From the math primer and backprop to transformers, RAG, agents, evaluation and MLOps." },
  code: { name: "Coding patterns", hue: L.HUES[1],
    blurb: "The LeetCode patterns: two pointers, sliding window, graphs, DP and more, each with a Python template." },
  sd: { name: "System design", hue: L.HUES[2],
    blurb: "Classic system design, ML system design and LLM systems, with step-ordering and matching drills." }
};
const IC = {
  offline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 18.5h3M12 7v6m-2.5-2.5L12 13l2.5-2.5"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.6-4.4M4 4v3.5h3.5M4 13a8 8 0 0 0 14.6 4.4M20 20v-3.5h-3.5"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'
};

/* ---------- numbers from the curriculum ---------- */
const COUNTS = LL.subjectCounts(B.UNITS, L.SUBJECTS);
const TOTAL = LL.totals(COUNTS);
const MOCKS = window.MockPrompts && Array.isArray(MockPrompts.PROMPTS) ? MockPrompts.PROMPTS.length : 0;
const num = n => Number(n).toLocaleString("en-US");
/* A few unit titles to show on a subject card: the highlights below when they exist (titles can change), else
   titles spread across the path. */
const HIGHLIGHTS = {
  ml: ["Classical ML Algorithms", "Transformers & LLMs", "Retrieval-Augmented Generation", "MLOps"],
  sd: ["Scaling the Request Path", "ML System Design", "RAG Systems End to End", "LLM Serving Infrastructure"]
};
function sampleTopics(subject, n){
  const titles = L.unitsFor(B.UNITS, subject).map(u => u.title);
  const picked = (HIGHLIGHTS[subject] || []).filter(t => titles.includes(t));
  if (picked.length >= 2) return picked.slice(0, n);
  const base = titles.filter(t => !/^Deep Dive/i.test(t));
  if (base.length <= n) return base;
  return Array.from({ length: n }, (_, i) => base[Math.round(i * (base.length - 1) / (n - 1))]);
}

/* ---------- sections ---------- */
const CTAS = `<div class="lp-ctas">
    <button class="cta lp-go" data-act="start">Start learning<span class="lp-go-sub"><span class="lp-comma">,</span> no account needed</span></button>
    <button class="cta ghost" data-act="signin">Sign in</button>
  </div>`;

function heroHTML(){
  return `<section class="lp-hero" aria-labelledby="lp-h1">
    <div class="lp-wrap lp-hero-grid">
      <div class="lp-hero-copy">
        <p class="lp-eyebrow">Interview prep, two minutes at a time</p>
        <h1 id="lp-h1">Get ready for ML, coding and system design interviews.</h1>
        <p class="lp-lede">blop turns interview prep into short daily lessons with quick questions, reviews that come back
          before you forget, and mock interviews graded with AI feedback.</p>
        ${CTAS}
        <p class="lp-already">Used blop before? <button class="lp-link" data-act="signin">I already have an account</button></p>
        <ul class="lp-stats" aria-label="What’s inside">
          <li><b>${num(TOTAL.lessons)}</b> lessons</li><li><b>${num(TOTAL.questions)}</b> questions</li>
          <li><b>${num(TOTAL.units)}</b> units</li>${MOCKS ? `<li><b>${MOCKS}</b> mock prompts</li>` : ""}
        </ul>
      </div>
      ${questionMock()}
    </div>
  </section>`;
}
/* The hero's preview: a question card like the real lesson screen, built in HTML. */
function questionMock(){
  return `<div class="lp-phone" role="img" aria-label="Preview of a blop question: which pattern fits the longest substring without repeating characters? Sliding window is marked correct.">
    <div class="lp-phone-in" aria-hidden="true">
      <div class="s-top lp-stop"><span class="lp-x">${I.x}</span><div class="pbar"><span class="lp-fill"></span></div></div>
      <div class="lp-qbody">
        <div class="kicker">Coding · Sliding window</div>
        <div class="prompt">Longest substring without repeating characters. Which pattern fits?</div>
        <div class="opts">
          <div class="opt right lp-pick"><span class="k">1</span>Sliding window</div>
          <div class="opt"><span class="k">2</span>Binary search</div>
          <div class="opt"><span class="k">3</span>Topological sort</div>
        </div>
      </div>
      <div class="s-foot good lp-sfoot"><div class="fb"><span class="ic">${I.check}</span><div><b>Nice!</b>
        <span>Grow the window to the right; shrink it from the left when a character repeats.</span></div></div></div>
    </div>
  </div>`;
}

function learnHTML(){
  const cards = L.SUBJECTS.map(([id]) => {
    const c = COUNTS[id], copy = SUBJECT_COPY[id];
    if (!c || !copy || !c.units) return "";
    const topics = sampleTopics(id, 4);
    return `<article class="lp-subj" style="--hue:${copy.hue}">
      <div class="lp-subj-band"><span class="lp-subj-num" aria-hidden="true">${c.lessons}</span>
        <h3>${esc(copy.name)}</h3><p>${c.units} ${c.units === 1 ? "unit" : "units"} · ${c.lessons} lessons</p></div>
      <div class="lp-subj-body"><p>${esc(copy.blurb)}</p>
        ${topics.length ? `<ul>${topics.map(t => `<li>${esc(t)}</li>`).join("")}${c.units > topics.length ? `<li class="lp-more">and ${c.units - topics.length} more units</li>` : ""}</ul>` : ""}
        <p class="lp-fine">${num(c.questions)} questions</p></div>
    </article>`;
  }).join("");
  return `<section class="lp-sec" aria-labelledby="lp-learn"><div class="lp-wrap">
    <h2 id="lp-learn">What you’ll learn</h2>
    <p class="lp-sub">Three subjects, each a path of units. Every lesson is a short explanation followed by a few questions.</p>
    <div class="lp-subjs">${cards}</div></div></section>`;
}

const STEPS = [
  ["Set a daily plan", "Pick 14, 30, 45 or 60 days. blop spreads the lessons you have left across them and rebalances when you miss a day."],
  ["Do bite-sized lessons", "About two minutes each: a short read, then multiple choice, fill-the-gap, put-in-order and match-the-pairs questions."],
  ["Review before you forget", "Finished lessons come back after 1, 3, 7, 21 and 60 days, with the questions you missed first."],
  ["Practise the real thing", "Answer open-ended interview prompts in your own words and get a score for each rubric area."]
];
function howHTML(){
  return `<section class="lp-sec lp-alt" aria-labelledby="lp-how"><div class="lp-wrap">
    <h2 id="lp-how">How it works</h2>
    <ol class="lp-steps">${STEPS.map(([t, d], i) => `<li><span class="lp-stepn" aria-hidden="true">${i + 1}</span>
      <div><h3>${t}</h3><p>${d}</p></div></li>`).join("")}</ol></div></section>`;
}

function featuresHTML(){
  const F = [
    [I.cal, "Study plan and calendar", "Today’s lessons, how far ahead or behind you are, and a month view coloured by how each day went."],
    [I.chat, "Mock interviews with AI feedback", `${MOCKS || "Dozens of"} prompts in ML, system design, coding and behavioural. Scores, strengths, gaps and a model outline. Needs sign-in.`],
    [I.case, "Job application tracker", "Log an application in one tap, move it through OA, phone screen and onsite, and see your response rate."],
    [IC.offline, "Works offline, installs like an app", "Add blop to your home screen and keep studying on a plane or the subway."],
    [IC.sync, "Sync across devices (optional)", "Sign in with Google or an email code to keep phone and laptop in step."],
    [IC.bell, "Daily reminders", "A push reminder at your chosen time, only on days you haven’t hit your goal yet. Needs sign-in."]
  ];
  return `<section class="lp-sec" aria-labelledby="lp-feat"><div class="lp-wrap">
    <h2 id="lp-feat">Everything in one place</h2>
    <ul class="lp-feats">${F.map(([ic, t, d]) => `<li><span class="lp-fic" aria-hidden="true">${ic}</span>
      <h3>${t}</h3><p>${d}</p></li>`).join("")}</ul></div></section>`;
}

function previewsHTML(){
  return `<section class="lp-sec lp-alt" aria-labelledby="lp-prev"><div class="lp-wrap">
    <h2 id="lp-prev">A look inside</h2>
    <p class="lp-sub">Real question types and screens, simplified.</p>
    <div class="lp-prevs">
      <figure class="lp-prev">${gapMock()}<figcaption><b>Fill the gap</b> Tap a word to complete the sentence or code.</figcaption></figure>
      <figure class="lp-prev">${calendarMock()}<figcaption><b>Your month</b> Every plan day is coloured: met, partly done, missed or upcoming.</figcaption></figure>
      <figure class="lp-prev">${feedbackMock()}<figcaption><b>Mock interview feedback</b> An example of the score breakdown you get back.</figcaption></figure>
    </div></div></section>`;
}
function gapMock(){
  return `<div class="lp-card" role="img" aria-label="A fill-the-gap question: use a set for O(1) membership checks.">
    <div aria-hidden="true"><div class="kicker">Fill the gap</div>
    <p class="lp-gapq">Use a <span class="blank filled right">set</span> for O(1) membership checks.</p>
    <div class="opts words"><div class="opt placed"><span class="k">1</span>set</div><div class="opt"><span class="k">2</span>list</div><div class="opt"><span class="k">3</span>tuple</div></div></div></div>`;
}
function calendarMock(){
  const marks = "dddpddmddpdddddtuuuuuuuuuuuuuu";
  const cls = { d: "st-done", p: "st-partial", m: "st-missed", t: "st-today is-today", u: "st-upcoming" };
  const days = [...marks].map((m, i) => `<span class="cd ${cls[m]}"><span class="dn">${i + 1}</span></span>`).join("");
  return `<div class="lp-card" role="img" aria-label="A month calendar: most past days met the target, two partly done, one missed, the rest upcoming.">
    <div aria-hidden="true"><div class="lp-calh"><b>This month</b><span>3 lessons today</span></div>
    <div class="cal lp-cal"><span class="cd pad"></span><span class="cd pad"></span>${days}</div></div></div>`;
}
function feedbackMock(){
  const rows = [["Requirements and scope", 4], ["Algorithm choice", 5], ["Distributed counting", 3]];
  return `<div class="lp-card" role="img" aria-label="Example mock interview feedback for Design a rate limiter: overall 4 out of 5.">
    <div aria-hidden="true"><div class="kicker">Example · System design</div><p class="lp-mt">Design a rate limiter</p>
    <div class="mover"><b>4.0</b><span>/ 5 overall</span></div>
    <ul class="mscores">${rows.map(([t, s]) => `<li><div class="mrow"><span>${t}</span><b>${s}/5</b></div>
      <div class="mbar"><i class="s${s}" style="width:${s * 20}%"></i></div></li>`).join("")}</ul></div></div>`;
}

function privacyHTML(){
  return `<section class="lp-sec" aria-labelledby="lp-priv"><div class="lp-wrap">
    <div class="lp-privacy"><span class="lp-fic" aria-hidden="true">${IC.shield}</span><div>
      <h2 id="lp-priv">Works without an account</h2>
      <p>Your progress stays on your device unless you sign in. No ads, and no tracking or analytics cookies.
        Signing in is only for syncing between devices, reminders and mock interview grading.
        <a href="/privacy.html">Read the privacy policy</a>.</p></div></div></div></section>`;
}

const FAQ = [
  ["Is blop free?", "Yes. blop is currently free to use, with no ads."],
  ["Do I need an account?", "No. Lessons, reviews, the study plan, the calendar and the job tracker all work without one, and your progress is saved in this browser. An account adds sync across devices, daily push reminders and mock interview grading."],
  ["What happens to my progress if I sign in later?", "The progress already on this device is merged into your account the first time you sign in, so nothing is lost."],
  ["Does it work offline?", "Yes. After the first visit, lessons and reviews work without a connection. If you’re signed in, changes sync when you’re back online. Mock interview grading needs a connection."],
  ["How are mock interviews graded?", "Your answer is sent to an AI model with the question’s rubric. It scores each rubric area from 0 to 5 and lists strengths, gaps and a model-answer outline. Grading needs sign-in and allows 20 grades a day."],
  ["How do I install it on my phone?", "On iPhone, open blop in Safari, tap Share, then Add to Home Screen. On Android, open it in Chrome and tap Install app from the ⋮ menu."]
];
function faqHTML(){
  return `<section class="lp-sec lp-alt" aria-labelledby="lp-faq"><div class="lp-wrap lp-narrow">
    <h2 id="lp-faq">Questions</h2>
    <div class="lp-faqs">${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>
    </div></section>`;
}
function endHTML(){
  return `<section class="lp-sec lp-end" aria-labelledby="lp-endh"><div class="lp-wrap lp-narrow">
    <h2 id="lp-endh">Start your first lesson now</h2>
    <p class="lp-sub">It takes about two minutes. You can sign in any time later.</p>${CTAS}</div></section>`;
}
function footerHTML(){
  return `<footer class="lp-foot"><div class="lp-wrap">
    <span class="lp-brand lp-brand-sm"><img src="/icons/icon-192.png" alt="" width="24" height="24">blop</span>
    <nav aria-label="Legal and contact"><a href="/privacy.html">Privacy Policy</a><a href="/terms.html">Terms of Service</a>
      <a href="mailto:blop@bloplearn.space">blop@bloplearn.space</a></nav></div></footer>`;
}
function headerHTML(){
  return `<header class="lp-top"><div class="lp-wrap lp-top-in">
    <span class="lp-brand"><img src="/icons/icon-192.png" alt="" width="32" height="32">blop</span>
    <button class="lp-link lp-top-signin" data-act="signin">Sign in</button></div></header>`;
}

/* ---------- sign-in sheet (sync-ui's own panel) ---------- */
let sheet = null, opener = null;
function openSignIn(btn){
  if (!B.syncPanelHTML || !B.sync) { finish(); if (B.goTab) B.goTab("profile"); return; }
  opener = btn || null;
  sheet = document.createElement("div");
  sheet.className = "lp-sheet";
  sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", "Sign in");
  sheet.innerHTML = `<div class="lp-sheet-in"><button class="lp-close" id="lp-close" aria-label="Close sign-in">${IC.close}</button>
    ${B.syncPanelHTML()}<p class="lp-fine lp-sheet-note">Or <button class="lp-link" data-act="start">continue without an account</button>.</p></div>`;
  document.body.appendChild(sheet);
  root.inert = true;
  B.bindSyncPanel(sheet);
  sheet.querySelector("#lp-close").onclick = closeSignIn;
  sheet.querySelector('[data-act="start"]').onclick = () => { closeSignIn(); start(); };
  sheet.addEventListener("click", e => { if (e.target === sheet) closeSignIn(); });
  const first = ["#sgoogle:not([disabled])", "#scode input", "#semail input", "#lp-close"].map(s => sheet.querySelector(s)).find(Boolean);
  if (first) first.focus();
}
function closeSignIn(){
  if (!sheet) return;
  sheet.remove(); sheet = null; root.inert = false;
  if (opener && document.contains(opener)) opener.focus();
}
document.addEventListener("keydown", e => { if (e.key === "Escape" && sheet) { e.preventDefault(); closeSignIn(); } });
/* Signed in from the sheet (email code; Google returns through a redirect, which skips the landing): go to the app. */
if (B.sync && B.sync.onChange) B.sync.onChange(s => { if (s.user && sheet) { closeSignIn(); finish(); if (B.goTab) B.goTab("learn"); } });

/* ---------- leaving the landing ---------- */
function setFlag(){ try { localStorage.setItem(LL.FLAG_KEY, "1"); } catch (e) {} }
function finish(){
  setFlag();
  document.documentElement.classList.remove("lp-on");
  root.remove();
  window.scrollTo(0, 0);
}
function start(){ finish(); B.afterLanding(); }

function render(){
  root.innerHTML = `${headerHTML()}<main>${heroHTML()}${learnHTML()}${howHTML()}${featuresHTML()}${previewsHTML()}${privacyHTML()}${faqHTML()}${endHTML()}</main>${footerHTML()}`;
  root.querySelectorAll('[data-act="start"]').forEach(b => { b.onclick = start; });
  root.querySelectorAll('[data-act="signin"]').forEach(b => { b.onclick = () => openSignIn(b); });
}
render();
B.landing = { visible: () => document.documentElement.classList.contains("lp-on"), start, openSignIn };
})();
