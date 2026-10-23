/* POST /api/report { lessonId, questionId, reason, note, shownText, appVersion, ts } stores a content problem
   report. Sign-in is optional ("Authorization: Bearer <Supabase access token>"), same-origin only, at most 20 per
   user or per hashed IP a day. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (for the optional
   sign-in check), REPORT_SALT (else CRON_SECRET). The flow lives in _lib/report-handler.js, helpers in _lib/report-core.js. */
"use strict";
const { createHandler } = require("./_lib/report-handler.js");

module.exports = createHandler({ fetch: (...a) => fetch(...a), env: process.env });
