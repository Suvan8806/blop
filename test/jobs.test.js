const test = require("node:test");
const assert = require("node:assert/strict");
const J = require("../jobs.js");

const T = 20748; // Thursday 22 Oct 2026
const NOW = 1700000000000;
const job = (id, day, status = "applied", extra = {}) => ({ id, company: "", role: "", link: "", day, status, updatedAt: 0, ...extra });

test("one-tap create logs an applied job for today with empty details", () => {
  const j = J.create(undefined, { id: "a", day: T, now: NOW });
  assert.deepEqual(j, { id: "a", company: "", role: "", link: "", day: T, status: "applied", updatedAt: NOW });
});

test("details are trimmed, capped and the date can be set", () => {
  const j = J.create({ company: "  Acme  ", role: "x".repeat(300), link: "acme.com/jobs/1", day: T - 3 }, { id: "a", day: T, now: NOW });
  assert.equal(j.company, "Acme");
  assert.equal(j.role.length, 120);
  assert.equal(j.link, "https://acme.com/jobs/1");
  assert.equal(j.day, T - 3);
  assert.equal(J.create({ day: 1.5 }, { id: "b", day: T, now: NOW }).day, T);
});

test("only http and https links are kept", () => {
  assert.equal(J.safeLink("javascript:alert(1)"), "");
  assert.equal(J.safeLink("JavaScript:alert(1)"), "");
  assert.equal(J.safeLink("data:text/html,hi"), "");
  assert.equal(J.safeLink("ftp://acme.com/x"), "");
  assert.equal(J.safeLink("http://acme.com/a?b=c"), "http://acme.com/a?b=c");
  assert.equal(J.safeLink("not a url"), "");
  assert.equal(J.safeLink(""), "");
  assert.equal(J.safeLink(42), "");
});

test("update changes valid fields only, bumps updatedAt and leaves the list untouched", () => {
  const jobs = [job("a", T), job("b", T)];
  const out = J.update(jobs, "a", { status: "oa", company: " Beta ", day: "x", link: "javascript:x", bogus: 1 }, NOW);
  assert.deepEqual(out[0], { id: "a", company: "Beta", role: "", link: "", day: T, status: "oa", updatedAt: NOW });
  assert.equal(out[1], jobs[1]);
  assert.equal(jobs[0].status, "applied");
  assert.equal(J.update(jobs, "a", { status: "hired" }, NOW)[0].status, "applied");
});

test("remove deletes by id", () => {
  assert.deepEqual(J.remove([job("a", T), job("b", T)], "a").map(j => j.id), ["b"]);
});

test("streak counts days in a row with an application, surviving until today is done", () => {
  const jobs = [job("a", T - 1), job("b", T - 2), job("c", T - 2), job("d", T - 4)];
  assert.equal(J.streak(jobs, T), 2);
  assert.equal(J.streak([...jobs, job("e", T)], T), 3);
  assert.equal(J.streak(jobs, T + 2), 0);
  assert.equal(J.streak([], T), 0);
});

test("stats: response rate counts anything past applied except ghosted; weeks start Monday", () => {
  const jobs = [job("a", T, "applied"), job("b", T, "oa"), job("c", T - 3, "rejected"), job("d", T - 4, "ghosted"),
    job("e", T - 7, "offer"), job("f", T - 11, "phone"), job("g", T - 30, "onsite")];
  const s = J.stats(jobs, T);
  assert.equal(s.total, 7);
  assert.equal(s.responses, 5);
  assert.equal(s.rate, 71);
  assert.equal(J.weekStart(T), T - 3); // Monday 19 Oct
  assert.equal(s.thisWeek, 3);         // Thu, Thu, Mon
  assert.equal(s.lastWeek, 2);         // Sun 18 Oct and Thu 15 Oct
  assert.deepEqual(J.stats([], T), { total: 0, responses: 0, rate: 0, thisWeek: 0, lastWeek: 0 });
});

test("filter by status and company search, newest first", () => {
  const jobs = [job("a", T - 2, "oa", { company: "Acme" }), job("b", T, "applied", { company: "Beta", role: "ML engineer" }),
    job("c", T, "oa", { company: "acme labs", updatedAt: 5 })];
  assert.deepEqual(J.filter(jobs).map(j => j.id), ["c", "b", "a"]);
  assert.deepEqual(J.filter(jobs, { status: "oa" }).map(j => j.id), ["c", "a"]);
  assert.deepEqual(J.filter(jobs, { q: " ACME " }).map(j => j.id), ["c", "a"]);
  assert.deepEqual(J.filter(jobs, { q: "engineer" }).map(j => j.id), ["b"]);
  assert.deepEqual(J.filter(jobs, { status: "offer" }), []);
  const edited = J.update(jobs, "b", { status: "oa" }, NOW + 1);
  assert.deepEqual(J.filter(edited).map(j => j.id), ["c", "b", "a"]); // editing doesn't reorder
  assert.deepEqual(J.counts(jobs), { applied: 1, oa: 2, phone: 0, onsite: 0, offer: 0, rejected: 0, ghosted: 0 });
});

test("sanitize keeps valid saved entries and repairs bad fields", () => {
  const out = J.sanitize([job("a", T, "weird", { link: "javascript:x", updatedAt: "no" }), { id: "", day: T }, null,
    job("a", T), { id: "b", day: "x" }, job("c", T - 1, "offer")]);
  assert.deepEqual(out.map(j => [j.id, j.status, j.link, j.updatedAt]), [["a", "applied", "", 0], ["c", "offer", "", 0]]);
  assert.deepEqual(J.sanitize(undefined), []);
});

test("ids look random and are unique enough", () => {
  let r = 0;
  const rand = () => (r += 0.123456789) % 1;
  const a = J.newId(rand, NOW), b = J.newId(rand, NOW);
  assert.match(a, /^j[0-9a-z]{8,}$/);
  assert.notEqual(a, b);
});

test("ISO dates round-trip with day numbers; bad dates are rejected", () => {
  assert.equal(J.isoFromDay(T), "2026-10-22");
  assert.equal(J.dayFromISO("2026-10-22"), T);
  assert.equal(J.dayFromISO("2026-02-30"), null);
  assert.equal(J.dayFromISO("yesterday"), null);
});

test("daily target is clamped to 1-100 and defaults to 15", () => {
  assert.equal(J.clampTarget(0), 1);
  assert.equal(J.clampTarget(500), 100);
  assert.equal(J.clampTarget("abc"), 15);
  assert.equal(J.clampTarget(12.4), 12);
  assert.equal(J.statusName("phone"), "Phone screen");
});
