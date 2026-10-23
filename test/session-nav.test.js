// The lesson-session history index and arrow-key logic (session-nav.js NavLogic).
const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../session-nav.js");

const after = (n) => { let s = N.start(); for (let i = 0; i < n; i++) s = N.push(s); return s; };

test("the first step can't go back; each finished step adds one to the history", () => {
  const s = N.start();
  assert.equal(N.canBack(s), false);
  assert.equal(N.back(s), s);
  assert.deepEqual(after(3), { h: 3, view: -1 });
  assert.equal(N.canBack(after(1)), true);
});

test("back walks to earlier steps and stops at the first", () => {
  let s = after(3);
  s = N.back(s); assert.equal(s.view, 2); assert.equal(N.reviewing(s), true);
  s = N.back(s); assert.equal(s.view, 1);
  s = N.back(s); assert.equal(s.view, 0); assert.equal(N.canBack(s), false);
  assert.equal(N.back(s).view, 0);
});

test("forward walks back step by step and past the last record returns to the live step", () => {
  let s = N.back(N.back(after(2)));
  assert.equal(s.view, 0);
  s = N.forward(s); assert.equal(s.view, 1); assert.equal(N.canForward(s), true);
  s = N.forward(s); assert.equal(s.view, -1); assert.equal(N.reviewing(s), false);
  assert.equal(N.canForward(s), false);
  assert.equal(N.forward(s), s);
});

test("live jumps straight back, and finishing a step always lands on the live step", () => {
  const s = N.back(N.back(after(4)));
  assert.deepEqual(N.live(s), { h: 4, view: -1 });
  assert.deepEqual(N.push(N.live(s)), { h: 5, view: -1 });
});

test("navigation never mutates the state it is given", () => {
  const s = Object.freeze(after(2));
  assert.doesNotThrow(() => { N.back(s); N.forward(N.back(s)); N.live(s); N.push(s); });
});

test("arrow keys map to back/forward, Alt allowed, never in fields or with Ctrl/Meta/Shift", () => {
  assert.equal(N.keyAction({ key: "ArrowLeft" }, false), "back");
  assert.equal(N.keyAction({ key: "ArrowRight" }, false), "forward");
  assert.equal(N.keyAction({ key: "ArrowLeft", altKey: true }, false), "back");
  assert.equal(N.keyAction({ key: "ArrowLeft" }, true), null);
  assert.equal(N.keyAction({ key: "ArrowLeft", ctrlKey: true }, false), null);
  assert.equal(N.keyAction({ key: "ArrowRight", metaKey: true }, false), null);
  assert.equal(N.keyAction({ key: "ArrowRight", shiftKey: true }, false), null);
  assert.equal(N.keyAction({ key: "Enter" }, false), null);
  assert.equal(N.keyAction(null, false), null);
});

test("a question id maps to its lesson id", () => {
  assert.equal(N.lessonOf("u3l2q5"), "u3l2");
  assert.equal(N.lessonOf("u12l0q10"), "u12l0");
});
