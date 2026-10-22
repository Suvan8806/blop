/* POST /api/push-subscribe { subscription, time: "HH:MM", tz } saves this browser's push subscription for the
   daily streak reminder; DELETE /api/push-subscribe { endpoint } removes it. Requires
   "Authorization: Bearer <Supabase access token>", same-origin only. Env: SUPABASE_URL, SUPABASE_ANON_KEY,
   SUPABASE_SERVICE_ROLE_KEY. The flow lives in _lib/push-subscribe-handler.js, pure helpers in _lib/push-core.js. */
"use strict";
const { createHandler } = require("./_lib/push-subscribe-handler.js");

module.exports = createHandler({ fetch: (...a) => fetch(...a), env: process.env });
