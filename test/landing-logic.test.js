// Landing page decisions: who sees it, the URL left behind, and the curriculum counts it shows.
const test = require("node:test");
const assert = require("node:assert/strict");
const LL = require("../landing-logic.js");
const Logic = require("../logic.js");

const NEW = { state: { done: {}, xp: 0, jobs: [], mock: [], plan: null, srs: {} }, url: "https://bloplearn.space/", standalone: false, flag: false };

test("a new visitor with no progress and no flag sees the landing", () => {
  assert.equal(LL.shouldShowLanding(NEW), true);
  assert.equal(LL.shouldShowLanding({ ...NEW, url: "/" }), true);
  assert.equal(LL.shouldShowLanding({ ...NEW, state: undefined }), true);
});

test("returning visitors skip it: the flag, any progress, or a session", () => {
  assert.equal(LL.shouldShowLanding({ ...NEW, flag: true }), false);
  assert.equal(LL.shouldShowLanding({ ...NEW, signedIn: true }), false);
  const withState = patch => LL.shouldShowLanding({ ...NEW, state: { ...NEW.state, ...patch } });
  assert.equal(withState({ done: { u0l0: true } }), false);
  assert.equal(withState({ xp: 10 }), false);
  assert.equal(withState({ srs: { u0l0: { due: 1 } } }), false);
  assert.equal(withState({ jobs: [{ id: "j1" }] }), false);
  assert.equal(withState({ mock: [{ id: "m1" }] }), false);
  assert.equal(withState({ plan: { start: 1, days: 30 } }), false);
});

test("deleted tombstones and an ended plan don't count as progress", () => {
  const s = { ...NEW.state, jobs: [{ id: "j1", deleted: true }], mock: [{ id: "m", deleted: true }], plan: { ended: true } };
  assert.equal(LL.hasProgress(s), false);
  assert.equal(LL.shouldShowLanding({ ...NEW, state: s }), true);
  assert.equal(LL.hasProgress(null), false);
  assert.equal(LL.hasProgress([]), false);
});

test("/?welcome shows it again, even with progress and the flag", () => {
  const old = { ...NEW, state: { done: { u0l0: true }, xp: 50 }, flag: true, signedIn: true };
  assert.equal(LL.shouldShowLanding({ ...old, url: "https://bloplearn.space/?welcome" }), true);
  assert.equal(LL.shouldShowLanding({ ...old, url: "/?welcome=1" }), true);
  assert.equal(LL.shouldShowLanding({ ...old, url: "/?welcome", standalone: true }), true);
});

test("the installed app skips it: ?source=pwa or display-mode standalone", () => {
  assert.equal(LL.shouldShowLanding({ ...NEW, url: "/?source=pwa" }), false);
  assert.equal(LL.shouldShowLanding({ ...NEW, standalone: true }), false);
  assert.equal(LL.shouldShowLanding({ ...NEW, url: "/?source=email" }), true);
});

test("a sign-in redirect never shows it", () => {
  for (const url of ["/?code=abc", "/?error=access_denied&error_description=x", "/#access_token=t&type=bearer",
    "/?code=abc&welcome", "/#error_description=bad"]) {
    assert.equal(LL.shouldShowLanding({ ...NEW, url }), false, url);
  }
});

test("a malformed URL falls back to the state checks", () => {
  assert.equal(LL.shouldShowLanding({ ...NEW, url: "http://[bad" }), true);
  assert.equal(LL.shouldShowLanding({ ...NEW, url: "http://[bad", flag: true }), false);
  assert.equal(LL.shouldShowLanding(), true);
});

test("cleanUrl drops welcome and source=pwa and keeps everything else", () => {
  assert.equal(LL.cleanUrl("https://bloplearn.space/?welcome"), "/");
  assert.equal(LL.cleanUrl("/?source=pwa"), "/");
  assert.equal(LL.cleanUrl("/?welcome&tab=today#x"), "/?tab=today#x");
  assert.equal(LL.cleanUrl("/?source=email"), "/?source=email");
  assert.equal(LL.cleanUrl("/?code=abc"), "/?code=abc");
  assert.equal(LL.cleanUrl("http://[bad"), "/");
});

test("subject counts come from the real curriculum and add up to the totals", () => {
  // Load the content files the way index.html does, in a fake window (as test/content.test.js does).
  const prev = global.window;
  global.window = { CURRICULUM: undefined };
  for (const f of ["../content.js", "../content-code.js", "../content-sd.js", "../content-ml-deep.js", "../content-extra.js"]) {
    delete require.cache[require.resolve(f)]; require(f);
  }
  const curriculum = global.window.CURRICULUM;
  global.window = prev;
  const units = Logic.buildUnits(curriculum);
  const c = LL.subjectCounts(units, Logic.SUBJECTS);
  assert.deepEqual(Object.keys(c), ["ml", "code", "sd"]);
  const t = LL.totals(c);
  assert.equal(t.units, units.length);
  assert.equal(t.lessons, units.reduce((n, u) => n + u.lessons.length, 0));
  assert.ok(c.ml.units > 0 && c.code.units > 0 && c.sd.units > 0);
  assert.ok(t.questions > t.lessons);
});

test("subject counts ignore unknown subjects and bad input", () => {
  const subs = [["ml", "ML"], ["sd", "SD"]];
  const units = [{ tr: "ml", lessons: [{ qs: [1, 2] }, { qs: [3] }] }, { tr: "xx", lessons: [{ qs: [1] }] }, null, { tr: "sd", lessons: [{}] }];
  assert.deepEqual(LL.subjectCounts(units, subs), { ml: { units: 1, lessons: 2, questions: 3 }, sd: { units: 1, lessons: 1, questions: 0 } });
  assert.deepEqual(LL.subjectCounts(null, subs), { ml: { units: 0, lessons: 0, questions: 0 }, sd: { units: 0, lessons: 0, questions: 0 } });
  assert.deepEqual(LL.totals({}), { units: 0, lessons: 0, questions: 0 });
});

test("after the landing: no focus opens the picker, any focus goes to the dashboard", () => {
  const fresh = { ...NEW.state, focus: null };
  assert.equal(LL.afterLandingStep(fresh), "picker");
  assert.equal(LL.afterLandingStep({ ...NEW.state }), "picker"); // focus missing (older saved state)
  assert.equal(LL.afterLandingStep(undefined), "picker");
  assert.equal(LL.afterLandingStep({ ...fresh, focus: { goals: ["cnn"], known: [], updatedAt: 1 } }), "dashboard");
  // A skipped focus ({goals: []}) means "don't ask again".
  assert.equal(LL.afterLandingStep({ ...fresh, focus: { goals: [], known: [], updatedAt: 1 } }), "dashboard");
  assert.equal(LL.afterLandingStep({ ...fresh, focus: { goals: [] } }, { viaSignIn: true }), "dashboard");
});

test("after the landing: Start learning opens the picker even with progress, if no focus was picked", () => {
  const s = { ...NEW.state, focus: null, done: { u0l0: true }, plan: { start: 1, days: 30 } };
  assert.equal(LL.afterLandingStep(s), "picker");
  assert.equal(LL.afterLandingStep(s, { viaSignIn: false }), "picker");
});

test("after signing in from the landing: the picker only when the synced state has no focus and no progress", () => {
  const empty = { ...NEW.state, focus: null };
  assert.equal(LL.afterLandingStep(empty, { viaSignIn: true }), "picker");
  assert.equal(LL.afterLandingStep({ ...empty, done: { u0l0: true } }, { viaSignIn: true }), "dashboard");
  assert.equal(LL.afterLandingStep({ ...empty, xp: 5 }, { viaSignIn: true }), "dashboard");
  assert.equal(LL.afterLandingStep({ ...empty, plan: { start: 1, days: 30 } }, { viaSignIn: true }), "dashboard");
  assert.equal(LL.afterLandingStep({ ...empty, jobs: [{ id: "j1" }] }, { viaSignIn: true }), "dashboard");
  // Tombstones and an ended plan are not progress.
  assert.equal(LL.afterLandingStep({ ...empty, jobs: [{ id: "j1", deleted: true }], plan: { ended: true } }, { viaSignIn: true }), "picker");
});

test("corePath: core minutes per subject leave deep dives out and flag that they exist", () => {
  const subs = [["ml", "ML"], ["sd", "System Design"]];
  const units = [
    { tr: "ml", title: "Foundations", lessons: [{}, {}] },
    { tr: "ml", title: "Deep Dive: Backprop", lessons: [{}, {}, {}] },
    { tr: "sd", title: "System Design", lessons: [{}] },
    { tr: "nope", title: "X", lessons: [{}] }, null
  ];
  assert.deepEqual(LL.corePath(units, subs, t => t.startsWith("Deep Dive:"), () => 90),
    { ml: { minutes: 3, deep: true }, sd: { minutes: 2, deep: false } });
  assert.deepEqual(LL.corePath(null, subs), { ml: { minutes: 0, deep: false }, sd: { minutes: 0, deep: false } });
  // The real curriculum: ML's core path is a few hours, with deep dives on top.
  const P = require("../paths.js"), E = require("../estimate.js");
  const prev = global.window;
  global.window = { CURRICULUM: undefined };
  for (const f of ["../content.js", "../content-code.js", "../content-sd.js", "../content-ml-deep.js", "../content-extra.js"]) {
    delete require.cache[require.resolve(f)]; require(f);
  }
  const real = Logic.buildUnits(global.window.CURRICULUM);
  global.window = prev;
  const c = LL.corePath(real, Logic.SUBJECTS, P.isDeep, l => E.lessonSecs(l));
  assert.equal(c.ml.deep, true);
  assert.equal(c.code.deep, false);
  assert.ok(c.ml.minutes > 120 && c.ml.minutes < 600, String(c.ml.minutes));
});
