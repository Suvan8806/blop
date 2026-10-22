// Run with: node --test test/
const test = require("node:test");
const assert = require("node:assert/strict");
const Plan = require("../plan.js");

const ids = n => Array.from({ length: n }, (_, i) => `l${i}`);
const sum = a => a.reduce((x, y) => x + y, 0);
const markDone = (list, day) => ({
  done: Object.fromEntries(list.map(id => [id, true])),
  doneOn: Object.fromEntries(list.map(id => [id, day]))
});
const START = 20000;

test("fresh 30-day plan for 157 lessons asks for 6 today and covers every lesson", () => {
  const order = ids(157);
  const s = Plan.schedule({ order, done: {}, doneOn: {}, today: START, start: START, days: 30 });
  assert.equal(s.todayTarget, 6);
  assert.equal(s.plan.length, 30);
  assert.equal(sum(s.plan.map(d => d.ids.length)), 157);
  assert.ok(s.plan.every(d => d.ids.length === 5 || d.ids.length === 6));
  assert.deepEqual(s.plan[0].ids, order.slice(0, 6));
});

test("today's target stays fixed while you work through it", () => {
  const order = ids(157);
  const { done, doneOn } = markDone(order.slice(0, 3), START);
  const s = Plan.schedule({ order, done, doneOn, today: START, start: START, days: 30 });
  assert.equal(s.todayTarget, 6);
  assert.equal(s.doneToday, 3);
  assert.equal(s.todayLeft, 3);
  assert.deepEqual(s.plan[0].ids, order.slice(3, 6));
});

test("doing extra today lowers every future day", () => {
  const order = ids(157);
  const { done, doneOn } = markDone(order.slice(0, 20), START); // the whole Python unit in one sitting
  const s = Plan.schedule({ order, done, doneOn, today: START, start: START, days: 30 });
  assert.equal(s.todayLeft, 0);
  assert.equal(sum(s.plan.map(d => d.ids.length)), 137);
  assert.ok(s.plan.slice(1).every(d => d.ids.length <= 5)); // 137 over 29 days
  const tomorrow = Plan.schedule({ order, done, doneOn, today: START + 1, start: START, days: 30 });
  assert.equal(tomorrow.todayTarget, 5);
});

test("skipping days raises the daily target", () => {
  const order = ids(157);
  const s = Plan.schedule({ order, done: {}, doneOn: {}, today: START + 5, start: START, days: 30 });
  assert.equal(s.daysLeft, 25);
  assert.equal(s.todayTarget, 7); // ceil(157 / 25)
  assert.equal(s.history.length, 5);
  assert.ok(s.history.every(h => h.did === 0));
});

test("past days record what you actually did", () => {
  const order = ids(157);
  const a = markDone(order.slice(0, 4), START), b = markDone(order.slice(4, 12), START + 1);
  const s = Plan.schedule({ order, done: { ...a.done, ...b.done }, doneOn: { ...a.doneOn, ...b.doneOn },
    today: START + 2, start: START, days: 30 });
  assert.deepEqual(s.history.map(h => h.did), [4, 8]);
  assert.equal(s.pace, 4); // 12 lessons over 3 days counting today
});

test("a fast pace projects an earlier finish than the deadline", () => {
  const order = ids(100);
  const { done, doneOn } = markDone(order.slice(0, 20), START);
  const s = Plan.schedule({ order, done, doneOn, today: START, start: START, days: 30 });
  assert.equal(s.pace, 20);
  assert.equal(s.finishDay, START + 3); // 80 left at 20/day
  assert.ok(s.finishDay < s.end);
});

test("finishing everything ends the plan early", () => {
  const order = ids(10);
  const { done, doneOn } = markDone(order, START + 2);
  const s = Plan.schedule({ order, done, doneOn, today: START + 2, start: START, days: 30 });
  assert.equal(s.remaining, 0);
  assert.equal(s.finishDay, START + 2);
  assert.ok(s.plan.every(d => d.ids.length === 0));
});

test("after the deadline everything left is due today", () => {
  const order = ids(40);
  const s = Plan.schedule({ order, done: {}, doneOn: {}, today: START + 31, start: START, days: 30 });
  assert.equal(s.overdue, true);
  assert.equal(s.todayTarget, 40);
  assert.equal(s.plan.length, 1);
});

test("lessons finished before the plan count as done but not as today's progress", () => {
  const order = ids(30);
  const s = Plan.schedule({ order, done: { l0: true, l1: true }, doneOn: {}, today: START, start: START, days: 7 });
  assert.equal(s.remaining, 28);
  assert.equal(s.doneToday, 0);
  assert.equal(s.todayTarget, 4);
});

test("planOrder leaves out skipped units", () => {
  const units = [
    { lessons: [{ id: "u0l0" }] },
    { lessons: [{ id: "u1l0" }, { id: "u1l1" }] },
    { lessons: [{ id: "u2l0" }] }
  ];
  assert.deepEqual(Plan.planOrder(units, [1]), ["u0l0", "u2l0"]);
  assert.deepEqual(Plan.planOrder(units, []), ["u0l0", "u1l0", "u1l1", "u2l0"]);
});

test("lesson time uses the default until there are enough samples, then the median", () => {
  assert.equal(Plan.lessonSecs([]), 120);
  assert.equal(Plan.lessonSecs([60, 90]), 120);
  assert.equal(Plan.lessonSecs([60, 90, 300]), 90);
  assert.equal(Plan.lessonSecs([60, 80, 100, 400]), 90);
  assert.equal(Plan.minutesFor(6, 120), 12);
  assert.equal(Plan.minutesFor(0, 120), 0);
});

test("spread front-loads the remainder", () => {
  assert.deepEqual(Plan.spread(10, 4), [3, 3, 2, 2]);
  assert.deepEqual(Plan.spread(0, 3), [0, 0, 0]);
  assert.deepEqual(Plan.spread(5, 0), []);
});

test("reminder file repeats daily until the deadline at the chosen time", () => {
  const ics = Plan.reminderICS({ fromDay: 0, endDay: 29, time: "19:30", minutes: 12, url: "https://example.test" });
  assert.match(ics, /DTSTART:19700101T193000\r\n/);
  assert.match(ics, /RRULE:FREQ=DAILY;UNTIL=19700130T235959\r\n/);
  assert.match(ics, /DURATION:PT12M/);
  assert.match(ics, /BEGIN:VALARM[\s\S]*TRIGGER:PT0M[\s\S]*END:VALARM/);
});
