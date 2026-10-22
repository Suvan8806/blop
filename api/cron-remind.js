/* GET or POST /api/cron-remind with "Authorization: Bearer <CRON_SECRET>": sends the hourly batch of streak
   reminders over Web Push (VAPID). Called by .github/workflows/remind.yml. Env: CRON_SECRET, SUPABASE_URL,
   SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
   The flow lives in _lib/cron-remind-handler.js. */
"use strict";
const webPush = require("web-push");
const { createHandler } = require("./_lib/cron-remind-handler.js");

module.exports = createHandler({ fetch: (...a) => fetch(...a), env: process.env, webPush });
