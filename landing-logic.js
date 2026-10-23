/* Landing page decisions with no DOM: whether to show the landing, the URL to leave behind afterwards, and the
   curriculum counts the landing shows. Tested in node (test/landing-logic.test.js). landing.js does the rest. */
(function (root) {
const FLAG_KEY = "blop-seen-landing";
const WELCOME_PARAM = "welcome";        // /?welcome shows the landing again (Profile → About blop)
const SOURCE_PARAM = "source";          // /?source=pwa is the installed app's start_url
const AUTH_QUERY = ["code", "error", "error_description"];
const AUTH_HASH = ["access_token", "error", "error_description"];

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
function parse(url) {
  try { return new URL(String(url), "https://blop.invalid"); } catch (e) { return null; }
}
function hashParams(u) { return new URLSearchParams(u.hash.replace(/^#/, "")); }

/* True when this device already has study or tracker data: a returning user. */
function hasProgress(state) {
  if (!isObj(state)) return false;
  const some = o => isObj(o) && Object.keys(o).length > 0;
  const live = l => Array.isArray(l) && l.some(x => x && !x.deleted);
  return some(state.done) || some(state.srs) || (Number.isFinite(state.xp) && state.xp > 0)
    || live(state.jobs) || live(state.mock) || (isObj(state.plan) && !state.plan.ended);
}

/* Show the landing to a new visitor, or to anyone who opens /?welcome. Never on a sign-in redirect (?code=,
   #access_token=, or an auth error), never in the installed app (?source=pwa or display-mode standalone), and
   never to someone who is signed in, has progress, or has already been through it (flag). */
function shouldShowLanding({ state, url, standalone, flag, signedIn } = {}) {
  const u = parse(url || "/");
  if (u) {
    const h = hashParams(u);
    if (AUTH_QUERY.some(k => u.searchParams.has(k)) || AUTH_HASH.some(k => h.has(k))) return false;
    if (u.searchParams.has(WELCOME_PARAM)) return true;
    if (u.searchParams.get(SOURCE_PARAM) === "pwa") return false;
  }
  if (standalone || signedIn || flag) return false;
  return !hasProgress(state);
}

/* The address without the landing's own parameters (welcome, source=pwa), as a path for history.replaceState.
   Everything else (?tab=, sign-in parameters, the hash) is left for the code that reads it. */
function cleanUrl(url) {
  const u = parse(url || "/");
  if (!u) return "/";
  u.searchParams.delete(WELCOME_PARAM);
  if (u.searchParams.get(SOURCE_PARAM) === "pwa") u.searchParams.delete(SOURCE_PARAM);
  const q = u.searchParams.toString();
  return u.pathname + (q ? "?" + q : "") + u.hash;
}

/* Units, lessons and questions per subject, from the built units (logic.js buildUnits). */
function subjectCounts(units, subjects) {
  const out = {};
  (subjects || []).forEach(([id]) => { out[id] = { units: 0, lessons: 0, questions: 0 }; });
  (Array.isArray(units) ? units : []).forEach(u => {
    if (!u || !out[u.tr]) return;
    const ls = Array.isArray(u.lessons) ? u.lessons : [];
    out[u.tr].units++;
    out[u.tr].lessons += ls.length;
    out[u.tr].questions += ls.reduce((n, l) => n + (l && Array.isArray(l.qs) ? l.qs.length : 0), 0);
  });
  return out;
}
function totals(counts) {
  return Object.values(counts || {}).reduce((t, c) =>
    ({ units: t.units + c.units, lessons: t.lessons + c.lessons, questions: t.questions + c.questions }),
  { units: 0, lessons: 0, questions: 0 });
}

const LandingLogic = { FLAG_KEY, hasProgress, shouldShowLanding, cleanUrl, subjectCounts, totals };
if (typeof module !== "undefined" && module.exports) module.exports = LandingLogic; else root.LandingLogic = LandingLogic;

/* In the browser this file loads in <head>, so the decision is made before anything paints: html.lp-on shows
   #landing and hides the app shell (landing.css). Then ?welcome and ?source=pwa are dropped from the address, so
   a reload doesn't repeat them and app.js only sees its own ?tab=. If storage is blocked, the landing only shows
   for /?welcome (it couldn't remember being dismissed). */
if (typeof document !== "undefined" && root.location) {
  let show = false;
  const href = root.location.href;
  try {
    const ls = root.localStorage;
    let state = null;
    try { state = JSON.parse(ls.getItem("mlepath-v1")); } catch (e) { state = null; }
    const standalone = !!(root.matchMedia && root.matchMedia("(display-mode: standalone)").matches) || root.navigator.standalone === true;
    show = shouldShowLanding({ state, url: href, standalone, flag: ls.getItem(FLAG_KEY) === "1", signedIn: !!ls.getItem("blop-auth") });
  } catch (e) {
    show = !!parse(href) && parse(href).searchParams.has(WELCOME_PARAM) && shouldShowLanding({ url: href });
  }
  LandingLogic.early = show;
  document.documentElement.classList.toggle("lp-on", show);
  try {
    const clean = cleanUrl(href), now = root.location.pathname + root.location.search + root.location.hash;
    if (clean !== now) root.history.replaceState(root.history.state, "", clean);
  } catch (e) {}
}
})(typeof window !== "undefined" ? window : globalThis);
