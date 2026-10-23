/* Pure helpers for /api/report (content problem reports): checking the body, finding the client IP and hashing
   it. No network, tested in node (test/report.test.js). A raw IP is never returned for storage, only its hash. */
"use strict";
const crypto = require("crypto");

const REASONS = ["wrong", "unclear", "typo", "other"];
const MAX_NOTE = 500;
const MAX_SHOWN = 2000;
const MAX_BODY_CHARS = 8000;
const DAILY_LIMIT = 20;
const LESSON_ID = /^u\d{1,3}l\d{1,3}$/;
const QUESTION_ID = /^u\d{1,3}l\d{1,3}q\d{1,4}$/;
const VERSION = /^[A-Za-z0-9._-]{1,32}$/;
// Control characters except tab and newline, so a stored report can't carry terminal escape codes.
const CTRL = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

const bad = error => ({ ok: false, status: 400, error });
const text = v => (typeof v === "string" ? v : "");

/* The parsed JSON body (object or string) -> { ok, row } or { ok:false, status, error }. */
function validateReport(body) {
  let b = body;
  if (typeof b === "string") {
    if (b.length > MAX_BODY_CHARS) return { ok: false, status: 413, error: "Request too large." };
    try { b = JSON.parse(b); } catch (e) { return bad("Bad request."); }
  }
  if (!b || typeof b !== "object" || Array.isArray(b)) return bad("Bad request.");
  const lessonId = text(b.lessonId), questionId = text(b.questionId);
  if (!LESSON_ID.test(lessonId)) return bad("Unknown lesson.");
  if (questionId !== "teach" && !(QUESTION_ID.test(questionId) && questionId.startsWith(`${lessonId}q`))) return bad("Unknown question.");
  if (!REASONS.includes(b.reason)) return bad("Pick a reason.");
  if (b.note !== undefined && typeof b.note !== "string") return bad("Bad note.");
  const note = text(b.note);
  if (note.length > MAX_NOTE) return bad(`Keep the note under ${MAX_NOTE} characters.`);
  const version = text(b.appVersion);
  return { ok: true, row: {
    lesson_id: lessonId,
    question_id: questionId,
    reason: b.reason,
    note: note.replace(CTRL, "").trim(),
    shown_text: text(b.shownText).slice(0, MAX_SHOWN).replace(CTRL, ""),
    app_version: VERSION.test(version) ? version : "unknown"
  } };
}

/* The caller's IP as Vercel reports it (x-real-ip, else the first x-forwarded-for entry), or "unknown". */
function clientIp(headers, socket) {
  const h = headers || {};
  const ip = String(h["x-real-ip"] || String(h["x-forwarded-for"] || "").split(",")[0] || (socket && socket.remoteAddress) || "").trim();
  return ip && ip.length <= 64 ? ip : "unknown";
}
/* Salt from REPORT_SALT, else CRON_SECRET; "" means not configured. */
function saltOf(env) {
  const v = k => (typeof env[k] === "string" ? env[k].trim() : "");
  return v("REPORT_SALT") || v("CRON_SECRET");
}
function hashIp(ip, salt) {
  return crypto.createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

module.exports = { REASONS, MAX_NOTE, MAX_SHOWN, DAILY_LIMIT, validateReport, clientIp, saltOf, hashIp };
