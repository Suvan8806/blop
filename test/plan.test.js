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

test("history only shows the last week after a long break", () => {
  const s = Plan.schedule({ order: ids(10), done: {}, doneOn: {}, today: START + 90, start: START, days: 30 });
  assert.equal(s.history.length, 7);
  assert.equal(s.history[0].day, START + 83);
});

test("reminder never ends before it starts", () => {
  const ics = Plan.reminderICS({ fromDay: 40, endDay: 29, time: "08:00", minutes: 10, url: "https://example.test" });
  assert.match(ics, /DTSTART:19700210T080000/);
  assert.match(ics, /UNTIL=19700210T235959/);
});

test("an on-schedule user isn't called late before today's first lesson", () => {
  const order = ids(10);
  const a = markDone(order.slice(0, 2), START), b = markDone(order.slice(2, 4), START + 1);
  const s = Plan.schedule({ order, done: { ...a.done, ...b.done }, doneOn: { ...a.doneOn, ...b.doneOn }, today: START + 2, start: START, days: 5 });
  assert.equal(s.pace, 2);
  assert.equal(s.paceDays, 2);
  assert.equal(s.projection, "date");
  assert.equal(s.finishDay, s.end);
});

test("long calendar lines are folded at 75 octets", () => {
  const ics = Plan.reminderICS({ fromDay: 0, endDay: 1, time: "08:00", minutes: 10, url: "https://a-very-long-preview-host-name.example.test/path" });
  assert.ok(ics.split("\r\n").every(l => l.length <= 75));
  assert.match(ics, /\r\n /);
});

test("past days record what you actually did", () => {
  const order = ids(157);
  const a = markDone(order.slice(0, 4), START), b = markDone(order.slice(4, 12), START + 1);
  const s = Plan.schedule({ order, done: { ...a.done, ...b.done }, doneOn: { ...a.doneOn, ...b.doneOn },
    today: START + 2, start: START, days: 30 });
  assert.deepEqual(s.history.map(h => h.did), [4, 8]);
  assert.equal(s.pace, 6); // 12 lessons over the 2 finished days; today doesn't count until you start
});

test("a fast pace projects an earlier finish than the deadline", () => {
  const order = ids(100);
  const a = markDone(order.slice(0, 20), START), b = markDone(order.slice(20, 40), START + 1);
  const s = Plan.schedule({ order, done: { ...a.done, ...b.done }, doneOn: { ...a.doneOn, ...b.doneOn }, today: START + 1, start: START, days: 30 });
  assert.equal(s.pace, 20);
  assert.equal(s.projection, "date");
  assert.equal(s.finishDay, START + 3); // 60 left at 20/day, counting today
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

test("units added after a plan was made are skipped until ticked", () => {
  assert.deepEqual(Plan.effectiveSkip([2], 4, 6), [2, 4, 5]);
  assert.deepEqual(Plan.effectiveSkip([], 6, 6), []);
  const units = Array.from({ length: 6 }, (_, ui) => ({ lessons: [{ id: `u${ui}l0` }] }));
  assert.deepEqual(Plan.planOrder(units, Plan.effectiveSkip([], 4, 6)), ["u0l0", "u1l0", "u2l0", "u3l0"]);
});

test("ticking a new unit adds only that unit and marks every unit known", () => {
  const plan = { start: 1, days: 30, knownUnits: 4 };
  const r = Plan.setUnit(plan, [1], 5, true, 7);
  assert.equal(r.plan.knownUnits, 7);
  assert.deepEqual(r.skip, [1, 4, 6]);
  assert.equal(plan.knownUnits, 4); // input untouched
});

test("unticking an old unit keeps new units skipped", () => {
  const r = Plan.setUnit({ start: 1, days: 30, knownUnits: 4 }, [], 0, false, 6);
  assert.deepEqual(r.skip, [0, 4, 5]);
  assert.equal(r.plan.knownUnits, 6);
  const back = Plan.setUnit(r.plan, r.skip, 0, true, 6);
  assert.deepEqual(back.skip, [4, 5]);
});

test("old plans migrate: knownUnits 18, updatedAt 0, a stable id and empty targets", () => {
  assert.deepEqual(Plan.migratePlan({ start: 5, days: 30 }), { start: 5, days: 30, knownUnits: 18, updatedAt: 0, id: "p5", targets: {} });
  const p = { id: "x", start: 5, days: 30, knownUnits: 22, updatedAt: 9, targets: { 5: 2 } };
  assert.equal(Plan.migratePlan(p), p);
  assert.equal(Plan.migratePlan(null), null);
  assert.equal(Plan.migratePlan({ days: 30 }), null);
  assert.deepEqual(Plan.migratePlan({ ended: true }), { ended: true, updatedAt: 0 });
  const e = { ended: true, updatedAt: 7 };
  assert.equal(Plan.migratePlan(e), e);
});

test("plans are created with an id, start size and updatedAt; ending leaves a stamped marker", () => {
  const p = Plan.create({ start: START, days: 30, knownUnits: 50, startRemaining: 120, now: 99 });
  assert.deepEqual(p, { id: `p${START}-99`, start: START, days: 30, knownUnits: 50, startRemaining: 120, targets: {}, updatedAt: 99 });
  assert.equal(Plan.isActive(p), true);
  assert.deepEqual(Plan.ended(100), { ended: true, updatedAt: 100 });
  assert.equal(Plan.isActive(Plan.ended(100)), false);
  assert.equal(Plan.isActive(null), false);
});

test("setUnit bumps updatedAt when given a time", () => {
  const r = Plan.setUnit({ start: 1, days: 30, knownUnits: 4, updatedAt: 1 }, [], 0, false, 4, 50);
  assert.equal(r.plan.updatedAt, 50);
  assert.equal(Plan.setUnit(r.plan, r.skip, 0, true, 4).plan.updatedAt, 50);
});

test("startRemaining estimate counts lessons left plus lessons done since the start", () => {
  const order = ids(10);
  const done = { l0: true, l1: true, l2: true, l3: true }, doneOn = { l0: START - 2, l1: START, l2: START + 3 }; // l3 has no date
  assert.equal(Plan.estimateStartRemaining(order, done, doneOn, START), 8); // 6 left + l1 + l2
});

test("past calendar days without a recorded target use the plan's original pace", () => {
  const base = { targets: { [START + 1]: 2 }, startRemaining: 100, days: 30, total: 157 };
  assert.equal(Plan.pastTarget({ ...base, day: START + 1 }), 2);  // recorded wins
  assert.equal(Plan.pastTarget({ ...base, day: START + 2 }), 4);  // ceil(100 / 30), not the 157 total
  assert.equal(Plan.pastTarget({ ...base, day: START + 2, startRemaining: 0 }), 0); // nothing was left: a rest day
  assert.equal(Plan.pastTarget({ ...base, day: START + 2, startRemaining: undefined }), 6); // unknown: the total
  assert.equal(Plan.pastTarget({ ...base, day: START + 1, total: 0 }), null); // no units: not judged
  const target = Plan.pastTarget({ ...base, day: START + 1, total: 0 });
  assert.notEqual(Plan.dayStatus({ day: START + 1, today: START + 5, did: 0, target }), "missed");
});

test("aheadBy: on track, behind after missed days, ahead after extra work", () => {
  const order = ids(150);
  const fresh = Plan.schedule({ order, done: {}, doneOn: {}, today: START, start: START, days: 30 });
  assert.equal(Plan.aheadBy(fresh, START, 30, START), 0);
  const half = markDone(order.slice(0, 3), START);
  const s1 = Plan.schedule({ order, ...half, today: START, start: START, days: 30 });
  assert.equal(Plan.aheadBy(s1, START, 30, START), 0); // half of today's 5 isn't "behind"
  const lazy = Plan.schedule({ order, done: {}, doneOn: {}, today: START + 6, start: START, days: 30 });
  assert.equal(Plan.aheadBy(lazy, START, 30, START + 6), -30); // 6 days x 5 a day
  const keen = markDone(order.slice(0, 20), START);
  const s2 = Plan.schedule({ order, ...keen, today: START, start: START, days: 30 });
  assert.equal(Plan.aheadBy(s2, START, 30, START), 15);
});

test("recordTarget stores today's target, keeps other days and drops very old ones", () => {
  const a = Plan.recordTarget(undefined, 500, 4);
  assert.deepEqual(a, { 500: 4 });
  assert.equal(Plan.recordTarget(a, 500, 4), a);
  const b = Plan.recordTarget({ 50: 1, 499: 3, 500: 4 }, 500, 6);
  assert.deepEqual(b, { 499: 3, 500: 6 });
});

test("monthInfo gives the first day, length and leading weekday", () => {
  const oct = Plan.monthInfo(2026, 9);
  assert.equal(oct.count, 31);
  assert.equal(oct.lead, 4); // 1 Oct 2026 is a Thursday
  assert.equal(Plan.ymd(oct.first), "20261001");
  assert.equal(Plan.monthInfo(2024, 1).count, 29);
  assert.deepEqual(Plan.monthOf(oct.first + 30), { year: 2026, month: 9 });
  assert.deepEqual(Plan.monthOf(oct.first + 31), { year: 2026, month: 10 });
});

test("dayStatus colours days by target met, partly done, missed, upcoming and rest", () => {
  const st = (day, did, target) => Plan.dayStatus({ day, today: 10, did, target });
  assert.equal(st(5, 3, 3), "done");
  assert.equal(st(5, 1, 3), "partial");
  assert.equal(st(5, 0, 3), "missed");
  assert.equal(st(5, 0, 0), "rest");
  assert.equal(st(5, 2, 0), "done");
  assert.equal(st(10, 0, 3), "today");
  assert.equal(st(10, 3, 3), "done");
  assert.equal(st(10, 1, 3), "partial");
  assert.equal(st(12, 0, 2), "upcoming");
  assert.equal(st(12, 0, 0), "rest");
  assert.equal(st(5, 4, null), "off");
});

/* ---------- pace projection (the "finish Sat, Nov 20, 365 days late" bug) ---------- */
test("one day of data hides the projection, even a busy first day", () => {
  const order = ids(100);
  const { done, doneOn } = markDone(order.slice(0, 20), START);
  const s = Plan.schedule({ order, done, doneOn, today: START, start: START, days: 30 });
  assert.equal(s.paceDays, 1);
  assert.equal(s.projection, "hidden");
  assert.equal(s.finishDay, null);
});

test("the morning of day two still has only one counted day, so nothing is projected", () => {
  const order = ids(100);
  const { done, doneOn } = markDone(order.slice(0, 1), START);
  const s = Plan.schedule({ order, done, doneOn, today: START + 1, start: START, days: 30 });
  assert.equal(s.projection, "hidden");
});

test("pace uses only the last 7 plan days, not the whole plan", () => {
  const order = ids(200);
  // 60 lessons in the first week, then 2 a day for the next 7 days.
  let done = {}, doneOn = {}, n = 0;
  const add = (count, day) => { for (let i = 0; i < count; i++, n++) { done[order[n]] = true; doneOn[order[n]] = day; } };
  for (let d = 0; d < 6; d++) add(10, START + d);
  for (let d = 6; d < 13; d++) add(2, START + d);
  const s = Plan.schedule({ order, done, doneOn, today: START + 13, start: START, days: 60 });
  assert.equal(s.paceDays, 7);
  assert.equal(s.pace, 2);
  assert.equal(s.finishDay, START + 13 + Math.ceil((200 - 74) / 2) - 1);
});

test("a short plan uses every day since its start", () => {
  const order = ids(30);
  const a = markDone(order.slice(0, 3), START), b = markDone(order.slice(3, 4), START + 2);
  const s = Plan.schedule({ order, done: { ...a.done, ...b.done }, doneOn: { ...a.doneOn, ...b.doneOn }, today: START + 3, start: START, days: 30 });
  assert.equal(s.paceDays, 3);
  assert.equal(s.pace, 4 / 3);
});

test("lessons done before the plan started don't inflate the pace", () => {
  const order = ids(50);
  const a = markDone(order.slice(0, 20), START - 3), b = markDone(order.slice(20, 22), START);
  const s = Plan.schedule({ order, done: { ...a.done, ...b.done }, doneOn: { ...a.doneOn, ...b.doneOn }, today: START + 2, start: START, days: 30 });
  assert.equal(s.paceDays, 2);
  assert.equal(s.pace, 1);
});

test("an absurd projection says behind pace instead of a date", () => {
  const order = ids(157);
  const { done, doneOn } = markDone(order.slice(0, 1), START);
  const s = Plan.schedule({ order, done, doneOn, today: START + 3, start: START, days: 30 });
  assert.equal(s.paceDays, 3);
  assert.equal(s.projection, "behind"); // 156 left at 1/3 a day is over a year away
  assert.equal(s.finishDay, null);
});

test("no progress at all in the window is behind pace", () => {
  const order = ids(40);
  const s = Plan.schedule({ order, done: {}, doneOn: {}, today: START + 5, start: START, days: 30 });
  assert.equal(s.pace, 0);
  assert.equal(s.projection, "behind");
});

test("a late but sane finish (under twice the plan length) still gets a date", () => {
  const order = ids(60);
  const a = markDone(order.slice(0, 1), START), b = markDone(order.slice(1, 2), START + 1);
  const s = Plan.schedule({ order, done: { ...a.done, ...b.done }, doneOn: { ...a.doneOn, ...b.doneOn }, today: START + 2, start: START, days: 30 });
  assert.equal(s.projection, "date"); // 58 left at 1 a day: finishes on day 60, exactly 2x
  assert.equal(s.finishDay - START + 1, 60);
  assert.ok(s.finishDay > s.end);
});

test("nothing left projects today as the finish", () => {
  const order = ids(5);
  const { done, doneOn } = markDone(order, START);
  const s = Plan.schedule({ order, done, doneOn, today: START, start: START, days: 30 });
  assert.equal(s.projection, "done");
  assert.equal(s.finishDay, START);
});

test("dates show the year only when it isn't this year", () => {
  const day = (y, m, d) => Date.UTC(y, m, d) / 864e5;
  const t = day(2026, 9, 22);
  assert.doesNotMatch(Plan.dateLabel(day(2026, 10, 20), t), /2026/);
  assert.match(Plan.dateLabel(day(2027, 10, 20), t), /2027/);
  assert.match(Plan.dateLabel(day(2025, 0, 2), t), /2025/);
});
