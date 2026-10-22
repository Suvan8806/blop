/* POST /api/grade { promptId, answer } with "Authorization: Bearer <Supabase access token>".
   Grades a mock interview answer: Groq (openai/gpt-oss-120b) first, Gemini Flash-Lite as fallback.
   Signed-in users only, 20 grades per user per UTC day, same-origin only. Keys come from env vars:
   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, GEMINI_API_KEY.
   The flow lives in _lib/grade-handler.js and the pure helpers in _lib/grade-core.js. */
"use strict";
const { createHandler } = require("./_lib/grade-handler.js");

module.exports = createHandler({ fetch: (...a) => fetch(...a), env: process.env });
