// Pure reminder helpers: subscription checks, the due-now window across time zones and DST, and goal status.
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../api/_lib/push-core.js");
const { loadUnits } = require("../api/_lib/curriculum.js");

const KEYS = { p256dh: "B" + "A".repeat(86), auth: "abcdefghijklmnopqrstuv" };
const sub = endpoint => ({ endpoint, expirationTime: null, keys: KEYS });
const at = iso => Date.parse(iso);

test("known push service hosts over https are accepted", () => {
  for (const ep of ["https://fcm.googleapis.com/fcm/send/abc:def", "https://updates.push.services.mozilla.com/wpush/v2/xyz",
    "https://web.push.apple.com/QH1x", "https://api.push.apple.com/3/device/x", "https://wns2-par02p.notify.windows.com/w/?token=AbC"]) {
    const v = C.validSubscription(sub(ep));
    assert.equal(v.ok, true, ep);
    assert.deepEqual(v.sub, { endpoint: ep, keys: KEYS }); // extra fields like expirationTime are dropped
  }
});

test("other hosts, http, ports, credentials and look-alikes are rejected", () => {
  for (const ep of ["http://fcm.googleapis.com/fcm/send/x", "https://evil.example/fcm.googleapis.com", "https://fcm.googleapis.com.evil.example/x",
    "https://push.apple.com/x", "https://notapple-push.apple.com.evil/x", "https://fcm.googleapis.com:8443/x", "https://u:p@fcm.googleapis.com/x",
    "https://169.254.169.254/latest", "https://localhost/x", "not a url", "", "https://fcm.googleapis.com/" + "x".repeat(3000)]) {
    assert.equal(C.validSubscription(sub(ep)).ok, false, ep);
  }
  assert.equal(C.validSubscription(null).ok, false);
  assert.equal(C.validSubscription([]).ok, false);
  assert.equal(C.validSubscription({ endpoint: "https://fcm.googleapis.com/x" }).ok, false);
  assert.equal(C.validSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "short", auth: KEYS.auth } }).ok, false);
  assert.equal(C.validSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: KEYS.p256dh, auth: "bad auth!" } }).ok, false);
});

test("reminder times must be HH:MM and time zones must be real IANA zones", () => {
  ["00:00", "07:05", "20:00", "23:59"].forEach(t => assert.equal(C.validTime(t), true, t));
  ["24:00", "7:05", "20:60", "20:00:00", "", null, 2000].forEach(t => assert.equal(C.validTime(t), false, String(t)));
  ["Europe/London", "America/New_York", "Asia/Kolkata", "UTC", "America/Argentina/Buenos_Aires"].forEach(z => assert.equal(C.validTz(z), true, z));
  ["Mars/Olympus", "", "Europe/London; DROP", "x".repeat(80), null, 5].forEach(z => assert.equal(C.validTz(z), false, String(z)));
});

test("validateSubscribe and validateUnsubscribe check the whole body, as an object or a JSON string", () => {
  const good = { subscription: sub("https://fcm.googleapis.com/fcm/send/a"), time: "20:00", tz: "Europe/Paris" };
  assert.equal(C.validateSubscribe(good).ok, true);
  assert.equal(C.validateSubscribe(JSON.stringify(good)).ok, true);
  assert.equal(C.validateSubscribe({ ...good, time: "8pm" }).status, 400);
  assert.equal(C.validateSubscribe({ ...good, tz: "Nowhere/Land" }).status, 400);
  assert.equal(C.validateSubscribe("{not json").status, 400);
  assert.equal(C.validateSubscribe("x".repeat(9000)).status, 413);
  assert.deepEqual(C.validateUnsubscribe({ endpoint: "https://fcm.googleapis.com/fcm/send/a" }), { ok: true, endpoint: "https://fcm.googleapis.com/fcm/send/a" });
  assert.equal(C.validateUnsubscribe({}).ok, false);
});

test("localNow gives the wall-clock date, app day number and minutes in a zone", () => {
  const t = C.localNow(at("2026-10-22T19:05:00Z"), "Asia/Kolkata"); // 00:35 on the 23rd in India
  assert.equal(t.date, "2026-10-23");
  assert.equal(t.minutes, 35);
  assert.equal(t.day, Date.UTC(2026, 9, 23) / 864e5);
  assert.equal(C.localNow(at("2026-10-22T19:05:00Z"), "America/Los_Angeles").minutes, 12 * 60 + 5);
});

test("due in the hour starting at the reminder time, in the subscription's own time zone", () => {
  const now = at("2026-10-22T19:05:00Z"); // 20:05 London (BST), 15:05 New York, 00:35 Kolkata
  assert.equal(C.dueNow({ remindTime: "20:00", tz: "Europe/London", now }).due, true);
  assert.equal(C.dueNow({ remindTime: "20:00", tz: "America/New_York", now }).why, "not-due");
  assert.equal(C.dueNow({ remindTime: "15:00", tz: "America/New_York", now }).due, true);
  assert.equal(C.dueNow({ remindTime: "20:06", tz: "Europe/London", now }).why, "not-due"); // not yet
  assert.equal(C.dueNow({ remindTime: "19:06", tz: "Europe/London", now }).due, true);      // 59 min late is still in the window
  assert.equal(C.dueNow({ remindTime: "19:05", tz: "Europe/London", now }).why, "not-due"); // exactly 60 min: the window is over
  const d = C.dueNow({ remindTime: "20:00", tz: "Europe/London", now });
  assert.equal(d.date, "2026-10-22");
  assert.equal(d.day, Date.UTC(2026, 9, 22) / 864e5);
});

test("a window that crosses midnight belongs to the day it started", () => {
  const now = at("2026-10-22T19:05:00Z"); // 00:35 on the 23rd in Kolkata
  const d = C.dueNow({ remindTime: "23:45", tz: "Asia/Kolkata", now });
  assert.equal(d.due, true);
  assert.equal(d.date, "2026-10-22");
  assert.equal(C.dueNow({ remindTime: "23:45", tz: "Asia/Kolkata", now, lastSentDay: "2026-10-22" }).why, "sent");
});

test("already reminded today is skipped; yesterday's mark doesn't count", () => {
  const now = at("2026-10-22T19:05:00Z");
  assert.equal(C.dueNow({ remindTime: "20:00", tz: "Europe/London", now, lastSentDay: "2026-10-22" }).why, "sent");
  assert.equal(C.dueNow({ remindTime: "20:00", tz: "Europe/London", now, lastSentDay: "2026-10-21" }).due, true);
  assert.equal(C.dueNow({ remindTime: "bad", tz: "Europe/London", now }).why, "invalid");
  assert.equal(C.dueNow({ remindTime: "20:00", tz: "Nope/Nope", now }).why, "invalid");
});

test("DST: the reminder follows local wall-clock time on both sides of a change", () => {
  // London: BST (UTC+1) until 25 Oct 2026, then GMT. 20:00 local is 19:00Z before and 20:00Z after.
  assert.equal(C.dueNow({ remindTime: "20:00", tz: "Europe/London", now: at("2026-10-24T19:05:00Z") }).due, true);
  assert.equal(C.dueNow({ remindTime: "20:00", tz: "Europe/London", now: at("2026-10-26T19:05:00Z") }).why, "not-due");
  assert.equal(C.dueNow({ remindTime: "20:00", tz: "Europe/London", now: at("2026-10-26T20:05:00Z") }).due, true);
  // New York spring-forward (8 Mar 2026): 02:30 doesn't exist; the 03:05 run (07:05Z) is in the window.
  assert.equal(C.dueNow({ remindTime: "02:30", tz: "America/New_York", now: at("2026-03-08T07:05:00Z") }).due, true);
  // Fall-back (1 Nov 2026): 01:30 happens twice; both runs see it as due, last_sent_day stops the second send.
  const first = C.dueNow({ remindTime: "01:00", tz: "America/New_York", now: at("2026-11-01T05:05:00Z") });
  const second = C.dueNow({ remindTime: "01:00", tz: "America/New_York", now: at("2026-11-01T06:05:00Z"), lastSentDay: first.date });
  assert.equal(first.due, true);
  assert.equal(second.why, "sent");
});

/* ---------- goal status ---------- */
const UNITS = loadUnits();
const DAY = Date.UTC(2026, 9, 22) / 864e5;
const ids = n => UNITS[1].lessons.slice(0, n).map(l => l.id);

test("no plan: today's lessons against the daily goal, and the live streak", () => {
  const data = { goal: 3, day: DAY, dayLessons: 1, streak: 6, last: DAY - 1 };
  assert.deepEqual(C.goalStatus(data, DAY, UNITS), { known: true, done: 1, goal: 3, left: 2, streak: 6, plan: false });
  // Counters from an earlier day count as nothing done today.
  assert.equal(C.goalStatus({ ...data, day: DAY - 1 }, DAY, UNITS).left, 3);
  // A broken streak (last study day before yesterday) is 0.
  assert.equal(C.goalStatus({ ...data, last: DAY - 3 }, DAY, UNITS).streak, 0);
  // Goal met.
  assert.equal(C.goalStatus({ ...data, dayLessons: 3, last: DAY, streak: 7 }, DAY, UNITS).left, 0);
  // A bad goal value falls back to 2.
  assert.equal(C.goalStatus({ goal: 99 }, DAY, UNITS).goal, 2);
});

test("active plan with a learning focus: the target covers only the path", () => {
  const plan = { id: "p", start: DAY, days: 10, knownUnits: UNITS.length, targets: {}, updatedAt: 1 };
  const focus = { goals: ["cnn"], known: ["Python Refresher"], updatedAt: 1 };
  const order = require("../paths.js").focusOrder(UNITS, focus);
  const n = order.reduce((a, ui) => a + UNITS[ui].lessons.length, 0);
  assert.equal(C.goalStatus({ plan, focus, skip: [] }, DAY, UNITS).goal, Math.ceil(n / 10));
  // A junk focus falls back to the plan's own unit list.
  const all = require("../plan.js").planOrder(UNITS, []).length;
  assert.equal(C.goalStatus({ plan, focus: { goals: "x" }, skip: [] }, DAY, UNITS).goal, Math.ceil(all / 10));
});

test("active plan: today's plan target and lessons done today, like the Today tab", () => {
  const done = Object.fromEntries(ids(2).map(id => [id, true]));
  const doneOn = Object.fromEntries(ids(2).map(id => [id, DAY]));
  const plan = { id: "p", start: DAY - 5, days: 30, knownUnits: UNITS.length, targets: {}, updatedAt: 1 };
  const st = C.goalStatus({ done, doneOn, plan, skip: [], goal: 1, streak: 3, last: DAY }, DAY, UNITS);
  assert.equal(st.plan, true);
  assert.equal(st.done, 2);
  const order = require("../plan.js").planOrder(UNITS, []);
  assert.equal(st.goal, Math.ceil(order.length / 25)); // everything (including today's 2) over the 25 days left
  assert.equal(st.left, st.goal - 2);
  // Skipping every unit but one shrinks the target.
  const skip = UNITS.map((_, i) => i).filter(i => i !== 1);
  const small = C.goalStatus({ done, doneOn, plan, skip, streak: 3, last: DAY }, DAY, UNITS);
  assert.equal(small.goal, Math.ceil(UNITS[1].lessons.length / 25));
});

test("an ended plan or a finished plan falls back to the daily goal", () => {
  const ended = C.goalStatus({ plan: { ended: true, updatedAt: 5 }, goal: 5, day: DAY, dayLessons: 2 }, DAY, UNITS);
  assert.deepEqual([ended.plan, ended.goal, ended.left], [false, 5, 3]);
  const bad = C.goalStatus({ plan: { start: 1, days: 99999 }, goal: 1 }, DAY, UNITS);
  assert.equal(bad.plan, false);
});

test("unreadable data is unknown, never a crash", () => {
  for (const d of [null, "x", [], 5]) assert.deepEqual(C.goalStatus(d, DAY, UNITS), { known: false });
  assert.equal(C.goalStatus({ done: "nope", doneOn: [], streak: "lots" }, DAY, UNITS).known, true);
});

test("messages name the streak and lessons left, or stay generic", () => {
  assert.equal(C.reminderMessage({ known: true, left: 3, streak: 12 }), "Keep your 12-day streak: 3 lessons left today");
  assert.equal(C.reminderMessage({ known: true, left: 1, streak: 1 }), "Keep your 1-day streak: 1 lesson left today");
  assert.equal(C.reminderMessage({ known: true, left: 2, streak: 0 }), "Start a streak: 2 lessons left today");
  assert.equal(C.reminderMessage({ known: false }), "Time for today’s blop lessons.");
  const p = JSON.parse(C.payload({ known: true, left: 3, streak: 4 }));
  assert.deepEqual(p, { title: "blop", body: "Keep your 4-day streak: 3 lessons left today", url: "/?tab=today", tag: "blop-streak" });
});
