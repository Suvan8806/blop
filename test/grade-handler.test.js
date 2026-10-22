// The /api/grade request flow with a mock req/res and a stubbed fetch: no real Supabase, Groq or Gemini calls.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler } = require("../api/_lib/grade-handler.js");
const MP = require("../mock-prompts.js");

const P = MP.byId("sd-rate-limiter");
const ANSWER = "I'd use a token bucket per API key stored in Redis with an atomic Lua script, returning 429 with Retry-After.";
const ENV = { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_svc",
  GROQ_API_KEY: "groq-key", GEMINI_API_KEY: "gemini-key" };
const SECRETS = ["anon-key", "sb_secret_svc", "groq-key", "gemini-key", "user-token"];
const gradeJSON = () => JSON.stringify({ scores: P.rubric.map(r => ({ area: r.name, score: 4, note: "solid" })), overall: 4,
  strengths: ["<img src=x onerror=alert(1)>"], gaps: ["fail-open policy"], outline: ["pick algorithm", "shared store", "429 + headers"] });
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/* A fake network. usage: the count the RPC returns. groq/gemini: a status code, "timeout", or "ok". */
function net({ user = 200, usage = 1, groq = "ok", gemini = "ok", groqBody = gradeJSON() } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/auth/v1/user")) return user === 200 ? json(200, { id: "user-1", email: "a@b.c" }) : json(user, { msg: "bad jwt" });
    if (url.endsWith("/rest/v1/rpc/increment_grade_usage")) return usage === "down" ? json(503, {}) : json(200, usage);
    if (url.endsWith("/rest/v1/rpc/refund_grade_usage")) return json(204, null);
    const which = url.includes("groq.com") ? groq : gemini;
    if (which === "timeout") return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    if (which !== "ok") return json(which, { error: { message: "rate limited" } });
    return json(200, { choices: [{ message: { content: url.includes("groq.com") ? groqBody : gradeJSON() }, finish_reason: "stop" }] });
  };
  return { fetch, calls };
}
function mockRes() {
  return { statusCode: 0, headers: {}, body: "", setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b || ""; this.done = true; } };
}
async function call({ env = ENV, network = net(), method = "POST", headers = {}, body = { promptId: P.id, answer: ANSWER }, timing = {} } = {}) {
  const logs = [];
  const handler = createHandler({ fetch: network.fetch, env, log: (...a) => logs.push(a.join(" ")), nonce: () => "fixednonce", ...timing });
  const req = { method, body, headers: { host: "blop.example", origin: "https://blop.example", "content-type": "application/json",
    authorization: "Bearer user-token", ...headers } };
  const res = mockRes();
  await handler(req, res);
  return { res, data: res.body ? JSON.parse(res.body) : null, logs, calls: network.calls };
}

test("a good request is graded by Groq and returns a clamped result and the day's usage", async () => {
  const { res, data, calls } = await call();
  assert.equal(res.statusCode, 200);
  assert.equal(data.ok, true);
  assert.equal(data.used, 1);
  assert.equal(data.limit, 20);
  assert.deepEqual(data.result.scores.map(s => s.area), P.rubric.map(r => r.name));
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["access-control-allow-origin"], undefined); // no CORS at all
  const groq = calls.find(c => c.url.includes("groq.com"));
  assert.equal(groq.init.headers.Authorization, "Bearer groq-key");
  const sent = JSON.parse(groq.init.body);
  assert.equal(sent.model, "openai/gpt-oss-120b");
  assert.ok(sent.messages[1].content.includes("<answer-fixednonce>"));
  assert.ok(!calls.some(c => c.url.includes("googleapis")));
});

test("auth uses the user's token with the anon key; usage uses the service key", async () => {
  const { calls } = await call();
  const auth = calls.find(c => c.url === "https://proj.supabase.co/auth/v1/user");
  assert.deepEqual(auth.init.headers, { apikey: "anon-key", Authorization: "Bearer user-token" });
  const rpc = calls.find(c => c.url.endsWith("/rpc/increment_grade_usage"));
  assert.equal(rpc.init.headers.apikey, "sb_secret_svc");
  assert.deepEqual(JSON.parse(rpc.init.body), { uid: "user-1" });
});

test("OPTIONS answers 204 and other methods get 405, without touching the network", async () => {
  const opt = await call({ method: "OPTIONS" });
  assert.equal(opt.res.statusCode, 204);
  assert.equal(opt.res.headers.allow, "POST, OPTIONS");
  for (const m of ["GET", "PUT", "DELETE"]) {
    const r = await call({ method: m });
    assert.equal(r.res.statusCode, 405);
    assert.equal(r.calls.length, 0);
  }
});

test("cross-site requests are refused", async () => {
  const r = await call({ headers: { origin: "https://evil.example" } });
  assert.equal(r.res.statusCode, 403);
  assert.equal(r.calls.length, 0);
  assert.equal((await call({ headers: { "content-type": "text/plain" } })).res.statusCode, 415);
});

test("auth failures: missing token, bad token, Supabase down", async () => {
  const none = await call({ headers: { authorization: "" } });
  assert.equal(none.res.statusCode, 401);
  assert.equal(none.calls.length, 0);
  const bad = await call({ network: net({ user: 401 }) });
  assert.equal(bad.res.statusCode, 401);
  assert.ok(!bad.calls.some(c => c.url.includes("rpc") || c.url.includes("groq")));
  assert.equal((await call({ network: net({ user: 500 }) })).res.statusCode, 503);
});

test("bad input is rejected before it uses up a grade", async () => {
  for (const body of [{ promptId: "nope", answer: ANSWER }, { promptId: P.id, answer: "short" }, { promptId: P.id, answer: "x".repeat(6001) }, "{oops", null]) {
    const r = await call({ body });
    assert.equal(r.res.statusCode, 400, JSON.stringify(body));
    assert.equal(r.data.ok, false);
    assert.ok(!r.calls.some(c => c.url.includes("rpc")));
  }
  assert.equal((await call({ body: {} })).res.statusCode, 400);
});

test("the 21st grade of the day is refused with 429 and no model call", async () => {
  const r = await call({ network: net({ usage: 21 }) });
  assert.equal(r.res.statusCode, 429);
  assert.match(r.data.error, /20 grades/);
  assert.ok(!r.calls.some(c => c.url.includes("groq") || c.url.includes("googleapis")));
  assert.equal((await call({ network: net({ usage: 20 }) })).res.statusCode, 200);
  assert.equal((await call({ network: net({ usage: "down" }) })).res.statusCode, 503);
});

test("Groq 429 falls back to Gemini", async () => {
  const r = await call({ network: net({ groq: 429 }) });
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.data.ok, true);
  const gem = r.calls.find(c => c.url.includes("googleapis"));
  assert.equal(gem.init.headers.Authorization, "Bearer gemini-key");
  assert.equal(JSON.parse(gem.init.body).model, "gemini-3.5-flash-lite");
  assert.ok(r.logs.some(l => /groq failed \(429\)/.test(l)));
});

test("Groq 5xx and malformed JSON also fall back", async () => {
  assert.equal((await call({ network: net({ groq: 503 }) })).res.statusCode, 200);
  const bad = await call({ network: net({ groqBody: "{\"scores\": \"nope\"}" }) });
  assert.equal(bad.res.statusCode, 200);
  assert.ok(bad.logs.some(l => /malformed/.test(l)));
});

test("the model calls get only what's left of the request budget", async () => {
  const r = await call({ network: net({ groq: "timeout", gemini: "timeout" }), timing: { budgetMs: 200 } });
  assert.equal(r.res.statusCode, 502);
  assert.ok(r.logs.some(l => /groq failed \(timeout\)/.test(l)));
  assert.ok(!r.calls.some(c => c.url.includes("googleapis"))); // no time left for a fallback
});

test("a Groq timeout falls back to Gemini", async () => {
  const r = await call({ network: net({ groq: "timeout" }), timing: { groqMaxMs: 50, totalMs: 4000 } });
  assert.equal(r.res.statusCode, 200);
  assert.ok(r.logs.some(l => /groq failed \(timeout\)/.test(l)));
});

test("both providers failing returns a friendly 502; no Gemini key means no fallback", async () => {
  const both = await call({ network: net({ groq: 429, gemini: 500 }) });
  assert.equal(both.res.statusCode, 502);
  assert.match(both.data.error, /busy/);
  const refund = both.calls.find(c => c.url.endsWith("/rpc/refund_grade_usage"));
  assert.ok(refund, "the grade is refunded");
  assert.deepEqual(JSON.parse(refund.init.body), { uid: "user-1" });
  assert.ok(!(await call()).calls.some(c => c.url.includes("refund")));
  const noGem = await call({ env: { ...ENV, GEMINI_API_KEY: "" }, network: net({ groq: 429 }) });
  assert.equal(noGem.res.statusCode, 502);
  assert.ok(!noGem.calls.some(c => c.url.includes("googleapis")));
});

test("only Gemini configured: it's used directly", async () => {
  const r = await call({ env: { ...ENV, GROQ_API_KEY: "" } });
  assert.equal(r.res.statusCode, 200);
  assert.ok(!r.calls.some(c => c.url.includes("groq")));
});

test("missing server config gives 503, not a crash", async () => {
  assert.equal((await call({ env: { ...ENV, SUPABASE_URL: "" } })).res.statusCode, 503);
  assert.equal((await call({ env: { ...ENV, SUPABASE_URL: "http://insecure.example" } })).res.statusCode, 503);
  assert.equal((await call({ env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: "" } })).res.statusCode, 503);
  assert.equal((await call({ env: { ...ENV, GROQ_API_KEY: "", GEMINI_API_KEY: "" } })).res.statusCode, 503);
});

test("logs and responses never contain the answer, the token or any key", async () => {
  const runs = [await call(), await call({ network: net({ groq: 429, gemini: 500 }) }), await call({ network: net({ user: 401 }) }),
    await call({ network: net({ usage: 99 }) })];
  for (const r of runs) {
    const text = r.logs.join("\n") + r.res.body;
    for (const s of [...SECRETS, ANSWER]) assert.ok(!text.includes(s), `leaked ${s.slice(0, 12)}`);
  }
});

test("a request body that fails to parse (Vercel's req.body getter throws) is a 400", async () => {
  const handler = createHandler({ fetch: net().fetch, env: ENV, log: () => {} });
  const req = { method: "POST", headers: { host: "h", origin: "https://h", "content-type": "application/json", authorization: "Bearer user-token" },
    get body() { throw new Error("Invalid JSON"); } };
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
});

test("api/grade.js exports a handler function", () => {
  assert.equal(typeof require("../api/grade.js"), "function");
});
