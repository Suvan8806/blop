#!/usr/bin/env node
/* Lists open content reports ("Report a problem" in a lesson), newest first. For the developer; not deployed.
   Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/reports.mjs [limit]
   Mark one handled in Supabase → Table Editor → content_reports (status: fixed or wontfix). */
const url = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!/^https:\/\//.test(url) || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const limit = Math.min(500, Math.max(1, parseInt(process.argv[2], 10) || 50));
const headers = { apikey: key };
if (key.split(".").length === 3) headers.Authorization = `Bearer ${key}`;
const res = await fetch(`${url}/rest/v1/content_reports?status=eq.open&order=created_at.desc&limit=${limit}` +
  "&select=id,created_at,user_id,lesson_id,question_id,reason,note,shown_text,app_version", { headers });
if (!res.ok) { console.error(`Supabase answered ${res.status}.`); process.exit(1); }
const rows = await res.json();
// Report text comes from users: strip control characters so it can't send escape codes to the terminal.
const clean = s => String(s ?? "").replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, " ");
if (!rows.length) console.log("No open reports.");
for (const r of rows) {
  console.log(`#${r.id}  ${clean(r.created_at)}  ${clean(r.question_id === "teach" ? r.lesson_id + " (teach)" : r.question_id)}  ${clean(r.reason)}  ${clean(r.app_version)}${r.user_id ? "  signed in" : ""}`);
  if (r.note) console.log(`  note: ${clean(r.note)}`);
  if (r.shown_text) console.log(`  shown: ${clean(r.shown_text).slice(0, 300)}`);
}
