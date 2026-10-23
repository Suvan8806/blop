# blop

A Duolingo-style study app for ML engineering, coding and system design interviews.
53 units, 398 lessons, 1,201 questions across three subjects: ML (31 units), Coding (4) and System Design (18). Works offline and installs to your home screen.

## Deploy to Vercel

Option A, with GitHub (works from a phone browser too):
1. Create a new GitHub repo and upload every file in this folder (keep the `icons` folder).
2. Go to vercel.com, choose Add New → Project, and import the repo.
3. Leave Framework Preset as "Other", with no build command, and press Deploy.

Option B, from a computer terminal:
1. `cd` into this folder.
2. Run `npx vercel` and follow the prompts, then `npx vercel --prod`.

## Add it to your home screen
- iPhone: open your Vercel URL in Safari → Share → Add to Home Screen.
- Android: open it in Chrome → ⋮ menu → Install app.

## Editing lessons
Content lives in plain script files, loaded in this order by `index.html`:

| File | What |
|---|---|
| `content.js` | ML units (also the original System Design and ML System Design units, 16 and 17) |
| `content-code.js` | Coding units (LeetCode patterns) |
| `content-sd.js` | System Design units (system design, ML system design, LLM systems) |
| `content-ml-deep.js` | ML deep-dive units |
| `content-extra.js` | extra questions appended to lessons that already shipped |
| `content-interactive.js` | interactive questions (numbers, estimates, code, bugs, shapes, sorting...) appended to lessons that already shipped, at most 2 per lesson |

**Never reorder or delete units, lessons or questions.** Ids come from array positions
(`u{unit}l{lesson}` and `u{unit}l{lesson}q{n}`) and saved progress uses them. Only append:
new units at the end of `window.CURRICULUM`, new questions at the end of a lesson's list.

### Units
`{t:"Title", tr:"code", ls:[ lessons ]}`. `tr` is the subject: `"ml"` (default), `"code"` or `"sd"`.
Units 16 and 17 are tagged `sd` in `logic.js` (`UNIT_SUBJECT`) so `content.js` stays untouched.

Display order within a subject is unit order, except units named in `UNIT_AFTER` in `logic.js`: each is shown
(and planned) right after the base unit whose title it names, so a deep dive sits next to the unit it deepens.
This only changes display order and the "Unit N" numbers, never unit indices or ids.

### Lessons
`[title, teach text, questions, {problems:[...]}]`. The 4th element is optional; `problems` is a
list of LeetCode problem names shown as "Practice on LeetCode" under the teach text.
In teach text, a paragraph starting with `$` is a code block, and `backticks` mark inline code.

### Questions
Multiple choice (the original format):
`["Prompt", ["correct", "wrong", "wrong"], "optional explanation"]`. The correct answer is listed first; the app shuffles.

Fill the gap: the prompt contains `___` exactly once; `opts[0]` is correct and options are shuffled.
`{type:"gap", p:"Use a ___ for O(1) lookups.", opts:["set","list","tuple"], why:"..."}`

Order the steps: list `items` in the correct order (2–6 of them); the app shuffles them and the user taps to build the sequence.
`{type:"order", p:"Put these in order", items:["first","second","third"], why:"..."}`

Match pairs: 4 `[term, definition]` pairs; definitions are shuffled. A wrong pair counts as a miss.
`{type:"match", p:"Match each term", pairs:[["Set lookup","O(1)"],["Sort","O(n log n)"],["Binary search","O(log n)"],["All pairs","O(n^2)"]], why:"..."}`

Multiple choice can also be written as an object, which allows a code snippet:
`{type:"mc", p:"What does this print?", code:"print(7 // 2)", opts:["3","3.5","4"], why:"..."}`

**Code snippets.** Any object question may have `code`: a multi-line snippet shown as a code block above the prompt.
Use it instead of pointing at "the code above" in the teach text, which isn't visible in reviews.

**Interactive formats.** All are object questions; `why` is shown with the feedback, and the correct answer is
always shown on a miss. Limits keep every item usable by keyboard (digits 1-9, letters A-H) and on a 390px phone.

| Type | What the learner does | Schema |
|---|---|---|
| `num` | Types a number. Right within `max(tol, rel × abs(answer))` (exact when both are 0). Accepts `1,200`, `1.2k`, `3.5M`, `1e-3`, `3/4`, `75%` (= 0.75) and the question's own `unit` after the number. | `{type:"num", p, answer:42, tol?:0.01, rel?:0.05, unit?:"GB", why}` |
| `est` | Sets a log-scale slider (or types a value). Right within a factor of `within` (default 2) either way; afterwards the accepted band is shaded. | `{type:"est", p, answer:11574, within?:2, min?:10, max?:1e7, unit?:"QPS", why}` (`min`/`max` default to answer ÷/× 1000) |
| `type` | Types a short answer, often the `___` in `code`. Any of `answers` counts. `norm`: `"text"` (default; case, spacing and a final full stop ignored), `"code"` (spacing, quote style and a final `;` ignored, case matters) or `"exact"`. | `{type:"type", p, code?:"dp[i] = ___", answers:["max(dp[i-1], dp[i-2] + x)", ...], norm?:"code", why}` |
| `output` | Predicts what `code` prints: typed (`answer`, a string or a list; `norm:"py"` by default ignores spacing, blank lines and quote style but not line breaks or case; `"exact"` is strict) or picked from `opts` (first is correct). A multi-line answer gets a text area (Ctrl+Enter checks). | `{type:"output", p, code, answer:"7 5", why}` or `{type:"output", p, code, opts:["None","10"], why}` |
| `bug` | Taps the wrong line of `code` (2-12 lines; `line` is 1-based and not blank), then picks the fix if `fix` is given (first option correct). | `{type:"bug", p, code, line:4, fix?:{opts:["lo = mid + 1","hi = mid - 1"]}, why}` |
| `blanks` | Picks an option from a dropdown in each gap. `code` holds `{0}` ... `{n-1}` once each (1-4 blanks); `blanks[i]` lists the options for `{i}`, correct first. | `{type:"blanks", p, code:"for x in {0}(a, b):", blanks:[["zip","enumerate"]], why}` |
| `bigo` | Picks time (and optionally extra space) from a ladder (3-8 rungs; default `O(1)` ... `O(2^n)`). | `{type:"bigo", p, code?, time:"O(n)", space?:"O(1)", ladder?:[...], why}` |
| `dims` | Builds a shape tuple from chips (2-9 chips, reusable; 1-6 dimensions). | `{type:"dims", p, code?, answer:["B","8","n","64"], chips:["B","n","8","64","512"], why}` |
| `derive` | Orders derivation steps (2-6) and leaves the decoys (1-3 classic mistakes) unplaced. | `{type:"derive", p, items:["step 1","step 2"], decoys:["wrong step"], why}` |
| `rank` | Orders items (2-6) by a criterion; `axis` names the two ends. | `{type:"rank", p, items:["L1 cache","RAM","SSD"], axis:["fastest","slowest"], why}` |
| `bucket` | Sorts 3-8 cards into 2-4 buckets. Every card must be right. | `{type:"bucket", p, buckets:["Leak","Safe"], items:[["Scaler fit on all data","Leak"], ...], why}` |
| `tf` | Answers a deck of 3-8 true/false cards; each card's optional note shows after checking. Right when at least `pass` (default 0.8) of the cards are right. | `{type:"tf", p, cards:[["Dropout runs at inference", false, "note"], ...], pass?:0.8, why}` |
| `compare` | Picks the better of two variants (each has `code` and/or `text`, plus an optional `label`), then why if `reason` is given (first option correct). | `{type:"compare", p, a:{label, code}, b:{label, text}, answer:"b", reason?:{opts:[...]}, why}` |
| `cm` | Fills a 2×2 confusion matrix from a scenario, then up to 3 metrics from it (`precision`, `recall`, `f1`, `accuracy`, `fpr`, `specificity`; tolerance `tol`, default 0.01; `75%` is read as 0.75). | `{type:"cm", p, labels?:["fraud","legit"], answer:{tp:60, fp:20, fn:40, tn:9880}, then?:[{metric:"precision", answer:0.75}], why}` |
| `match` + `mono` | The match type with code-style terms: add `mono:true` for a monospace grid. | `{type:"match", mono:true, p, pairs:[["a[-1]","40"], ...], why}` |

`why` is optional everywhere (but every interactive item ships with one). Malformed questions are skipped with a
console warning (see `normQ` in `logic.js`) without shifting other ids, so an older app that doesn't know a type
simply skips it. Answer checks are pure functions in `logic.js` (`checkNum`, `checkEst`, `checkTyped`, `checkBug`,
`checkBlanks`, `checkBigO`, `checkDims`, `checkOrder`, `checkBucket`, `checkTF`, `checkCompare`, `checkCM`), tested in
`test/interactive.test.js`.

Keyboard: number keys pick options (or the next step or chip to place), Backspace removes the last placed step or
chip, match uses numbers for terms and letters for definitions, `bug` uses numbers for lines and letters for fixes,
`bigo` uses numbers for time and letters for space, `bucket` sorts the outlined card with 1-4 and `tf` with T/F,
`compare` uses A/B then numbers, and Enter checks or continues. While the focus is in a text field, dropdown or
slider, keys go to that field: shortcuts are off, and Enter in a one-line field checks the answer.

After editing, bump `CACHE` in `sw.js` (e.g. "blop-v10") so phones pick up the change, and add any new file to its `ASSETS` list.

Progress is stored in the browser on each device. Signing in (optional, see below) syncs it across devices.

## Login and sync (optional)
Sign in on the Profile tab with Google or a 6-digit email code, and progress, streak, reviews, the study plan,
job applications and settings stay the same on every device. localStorage stays the source the app reads from,
so everything works offline and without an account. With `config.js` empty, Profile says "Sync isn't set up yet"
and the app never contacts Supabase.

### Setup
1. Create a Supabase project at supabase.com (the free tier is enough).
2. In Supabase → SQL Editor, paste and run `supabase/schema.sql`. It creates the `progress` table with row-level
   security so each user can only select, insert and update their own row, a check that `data` is a JSON object, and
   a trigger that sets `updated_at` from the server clock on every write. The file is safe to re-run, so after
   pulling a new version just run the whole file again.
3. In Google Cloud Console → APIs & Services: set up the OAuth consent screen (External), then Credentials →
   Create credentials → OAuth client ID → **Web application**. Add this **Authorized redirect URI**:
   `https://<ref>.supabase.co/auth/v1/callback` (`<ref>` is your Supabase project ref, as in the project URL).
4. In Supabase → Authentication → Sign In / Providers → **Google**: turn it on and paste that client ID and client secret.
5. In Supabase → Authentication → URL Configuration: set **Site URL** to `https://blop-nu.vercel.app`, and add these
   **Redirect URLs**: `https://blop-nu.vercel.app` and `https://blop-git-dev2-suvan8806s-projects.vercel.app`.
   Don't add `http://127.0.0.1:*` or other local addresses to the production project: any page served on this
   computer could then receive sign-in redirects. For local testing, create a separate dev Supabase project, add
   `http://127.0.0.1:*` there, and point a local `config.js` at it.
6. In Supabase → Project Settings → API (or API Keys), copy the **Project URL** and the **anon** (publishable) key into
   `config.js`. Never use the service-role or secret key; the app refuses to start sync with one.
7. In Supabase → Authentication → Emails, edit the **Magic Link** template to show the code, for example
   `<p>Your blop code: <b>{{ .Token }}</b></p>`. Do the same in **Confirm signup**, which a brand-new account can
   receive instead. Without `{{ .Token }}` the email only has a link, which won't sign in the home-screen app.

Then bump `CACHE` in `sw.js` and deploy. (`config.js` is fetched network-first, so a new config applies on the next load anyway.)

### How it works
- `config.js` holds the public URL and anon key. Row-level security is what protects the data.
- supabase-js is loaded from a pinned jsDelivr URL with a subresource-integrity hash (`sync.js`), only when config is
  filled in and you sign in or already have a session. The service worker never caches the CDN or the API.
- On app open and right after sign-in: pull the account's row, merge (`merge.js`), save locally, push. After every
  finished lesson or review, job change, plan change or settings change, a push follows about 2 s later (changes
  are coalesced). Each push re-reads and merges first, and only writes if nobody else wrote in between.
- Offline, pushes wait and run when the browser is back online. "Sync now" runs one immediately.
- Signing out only forgets the session on this device (including any half-finished sign-in's PKCE verifier);
  progress stays (and so does this device's daily reminder). "Sign out and clear this device" also removes progress,
  job applications, mock interviews and drafts from this device, for a shared phone or laptop, and turns off its
  daily reminder (deleted on the server while the token still works, then unsubscribed in the browser).
- The device remembers which account its data was synced with (`blop-sync-meta` in localStorage). If a different
  account signs in while this device has data, it asks whether to start fresh for that account (clearing the
  device first) or sign out, so one person's data is never merged into another's account.
- On an iPhone home-screen app, use the email code: a Google sign-in can finish in Safari instead of the app.
- Reset on a signed-in device is stamped (`resetAt`) and syncs: progress from any copy whose `progressUpdatedAt`
  is older than the reset is ignored when merging, so lessons don't come back. A device that studied after the
  reset but before syncing keeps all of its progress.
- Before every push the app checks the size of the saved data and refuses to send more than 1.5 MB, with a message.
- Merging and loading clamp everything that came from another device into sane bounds (plan length 1-730 days,
  day numbers, counts, text lengths, list sizes) and drop unknown top-level fields, so a bad remote copy can't
  crash the app.

Merge rules: study progress from a copy last changed before the latest reset is ignored. Finished lessons are a
union (earliest day kept), XP is counted per device (`xpLog`, merged by max per device and shown as the sum, so two
devices earning offline add up), missed-question counts take the max, the streak
comes from the side that studied most recently, review schedule entries, jobs and mock interview attempts (including delete tombstones) take
the newer `updatedAt` (attempts are then capped at the newest 100), the plan takes the newer `updatedAt` (an ended plan is `{ended:true, updatedAt}`) with daily
targets merged by max, lesson times are a union capped at 20, settings follow `settingsUpdatedAt`, today's counters
take the max on the same day, and top-level fields the app doesn't know are dropped. Every timestamp is capped at
the merging device's clock plus one day, so a device whose clock is far ahead can't win every merge forever.

### Security headers
`vercel.json` sends a Content-Security-Policy on every route (scripts only from this site and jsDelivr, network
requests only to this site, Supabase and Google Fonts, no framing, no plugins), plus `Referrer-Policy: same-origin`,
`X-Content-Type-Options: nosniff` and a `Permissions-Policy` that turns off camera, microphone and location
(dictation uses the phone keyboard, not the page). The app has no inline scripts or inline event handlers; keep it
that way, or the CSP blocks them. Google sign-in is a top-level navigation to supabase.co, which the CSP allows.
The service worker caches only the files in its `ASSETS` list and Google Fonts, never `/api/` or the Supabase API,
and never stores a URL carrying sign-in parameters (`?code=`, `#access_token=`).
Vercel serves every uploaded repo file publicly, so `.vercelignore` keeps this README, `supabase/`, `test/`,
`.github/` and `node_modules/` out of the deployment (`package.json` and `package-lock.json` stay: the functions
need them for `web-push`).

## Code layout
- `logic.js`: pure content logic (building units, normalising questions, checking answers, subjects). Tested in node.
- `plan.js`: pure study-plan and calendar logic. Tested in node.
- `srs.js`: pure spaced-repetition scheduling. Tested in node.
- `jobs.js`: pure job-tracker logic (stats, streak, filters, link checks). Tested in node.
- `state.js`: which saved fields exist, which are progress and which are settings; reset; XP per device; clamping
  saved or synced data into bounds. Tested in node.
- `merge.js`: merges this device's state with the account's copy. Tested in node.
- `sync-logic.js`: sync helpers (config and input checks, redirect URLs, error messages, push scheduler). Tested in node.
- `config.js`: Supabase URL and anon key (empty = no sync).
- `sync.js`: sign-in and pull/merge/push with Supabase. `sync-ui.js`: the Profile sync panel.
- `supabase/schema.sql`: the `progress` table and its row-level security policies, the `grade_usage` table and the `push_subs` table.
- `core.js`: saved state, helpers and the lesson/practice session runner.
- `qtypes.js`: rendering for the tap question types (multiple choice, gap, order, derive, rank, match) and the type registry.
- `qtypes-input.js`: typed question types (num, est, type, output, cm). `qtypes-tap.js`: bug, blanks, bigo, dims, bucket, tf, compare.
- `today.js`: the Today tab (today's lessons, reviews, calendar, plan settings).
- `jobs-ui.js`: the Jobs tab.
- `mock-prompts.js`: the mock interview questions, rubrics and outlines (browser script and node module).
- `mock.js`: pure mock-interview logic (answer checks, clamping grades, attempt history and trends). Tested in node.
- `mock-ui.js`: the Mock tab.
- `api/grade.js`, `api/_lib/`: the grading function (see "Mock interviews"). Tested in node with a stubbed fetch.
- `push-logic.js`: pure daily-reminder helpers (push support, the iPhone Home Screen rule, the VAPID key). Tested in node.
- `push-ui.js`: the Profile "Daily reminder" panel (turn push reminders on/off, pick the time).
- `api/push-subscribe.js`, `api/cron-remind.js`, `api/_lib/push-*.js`, `api/_lib/cron-remind-handler.js`,
  `api/_lib/curriculum.js`: the reminder functions (see "Streak reminders"). Tested in node with a stubbed fetch and web-push.
- `.github/workflows/remind.yml`: the hourly GitHub Action that triggers the reminders.
- `app.js`: tabs, the Learn and Profile screens. `?tab=today` (or another tab name) opens that tab.

They share code through `window.Blop`.

## Study plan
The Today tab spreads the lessons you have left over 14, 30, 45 or 60 days. Today's target is fixed
for the day; every day after it is recalculated from what's actually left, so extra lessons make
later days lighter and missed days make them heavier. Untick units you already know to drop them
from the count; units added to the app after a plan starts stay out of it until you tick them.
The pace line projects your finish from the last 7 plan days (or since the start, if shorter); it appears after 2 days
of data, and says "behind pace" instead of a date when the projection is more than twice the plan's length.
The month calendar colours each plan day: target met, partly done, missed, upcoming or rest day. "Add to calendar" downloads an .ics file with a daily alert until the plan ends.

## Spaced repetition
Finishing a lesson schedules a review for tomorrow. A review moves a lesson along 1 → 3 → 7 → 21 → 60 days when at least
two of its questions came up (or its only question, for a one-question lesson) and all were right first try, and back to
1 day if any was wrong. If fewer came up, the lesson keeps its step and stays due. The daily review takes up to 15 questions from
due lessons, previously missed questions first; with nothing due it offers extra practice instead.

## Jobs
The Jobs tab logs job applications: "+1 Applied" records one for today in a single tap, and "Add details" takes a
company, role, link and date. Each application has a status (applied, OA, phone screen, onsite, offer, rejected,
ghosted). The response rate counts applications whose status moved past Applied, except Ghosted. Links must be http(s);
a bare address like `example.com:8080/job` gets `https://` added. Deleting an application leaves a small tombstone
`{id, deleted:true, updatedAt}` so the deletion can sync; it's hidden everywhere.

## Mock interviews
The Mock tab has 42 open-ended interview questions (`mock-prompts.js`) in four categories: ML concepts, ML & LLM
system design, coding explanation and behavioral-technical. Pick one (or tap Random), type or dictate an answer (the
phone keyboard's mic button dictates), optionally against a 5/10/15-minute timer, and submit. `/api/grade` scores it
0-5 on each of the question's 3-5 rubric areas and returns an overall score, strengths, what was missing and a
model-answer outline. Attempts are saved in `S.mock` (newest 100 kept, synced like jobs, with delete tombstones), and
each question shows its score trend. Drafts are kept on the device (`blop-mock-drafts` in localStorage) until graded.

Grading requires sign-in (the sync account) and allows 20 grades per user per UTC day. Without sync configured or
signed out, the tab explains that and keeps the draft.

### How grading works
- `api/grade.js` is a Vercel Node function (CommonJS, plain `fetch`, no dependencies, so nothing to install or build).
  Its logic is in `api/_lib/grade-handler.js` (request flow) and `api/_lib/grade-core.js` (pure helpers); Vercel
  doesn't turn files under `_`-prefixed paths into routes.
- POST only (OPTIONS answers 204), same-origin only (no CORS headers), JSON only.
- `Authorization: Bearer <Supabase access token>` is checked against `SUPABASE_URL/auth/v1/user` with the anon key.
- `promptId` must exist in `mock-prompts.js` (required server-side) and the answer must be 20-6000 characters. Bad
  input is rejected before it counts against the daily limit.
- The daily count is incremented atomically in Postgres (`increment_grade_usage`, service-role only) before grading,
  and given back (`refund_grade_usage`) if no grade is delivered.
- Groq (`openai/gpt-oss-120b`, low reasoning effort, JSON mode) grades first. If it fails for any reason (429, 5xx,
  timeout, unusable JSON) and `GEMINI_API_KEY` is set, Gemini (`gemini-3.5-flash-lite`, OpenAI-compatible endpoint)
  is tried. The whole request stays within 27 s (the function's `maxDuration` is 30 s in `vercel.json`).
- The rubric and outline go in the system message; the answer goes in the user message inside a block marked with a
  random nonce, and the model is told it is data to grade, not instructions.
- The reply is parsed and clamped (`Mock.clampResult` in `mock.js`): one integer score 0-5 per rubric area, overall
  = their mean, at most 6 items of at most 300 characters per list. The app clamps again and renders everything as
  escaped text.
- Keys are only read from env vars on the server. Logs never include the answer, the token or keys.

### Setup
1. In Supabase → SQL Editor, run the "Mock interview grading" section at the end of `supabase/schema.sql` (it creates
   `grade_usage` with RLS on and no policies, and `increment_grade_usage` / `refund_grade_usage`, executable only by `service_role`).
2. Get a Groq key at console.groq.com (no card). Optionally get a Gemini key at aistudio.google.com/apikey.
3. Add the server env vars for Production and Preview (each command asks for the value):
   ```
   npx vercel env add SUPABASE_URL production
   npx vercel env add SUPABASE_URL preview
   npx vercel env add SUPABASE_ANON_KEY production
   npx vercel env add SUPABASE_ANON_KEY preview
   npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
   npx vercel env add SUPABASE_SERVICE_ROLE_KEY preview
   npx vercel env add GROQ_API_KEY production
   npx vercel env add GROQ_API_KEY preview
   npx vercel env add GEMINI_API_KEY production
   npx vercel env add GEMINI_API_KEY preview
   ```
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` are the same values as in `config.js`. `SUPABASE_SERVICE_ROLE_KEY` is the
   service-role (or `sb_secret_...`) key from Supabase → Project Settings → API; it must never go in `config.js`.
   `GEMINI_API_KEY` is optional. Redeploy after adding env vars.

## Streak reminders (push notifications)
Profile → **Daily reminder** turns on a notification at your reminder time (default 8 pm, the same synced setting the
Today tab's calendar reminder uses) on days you haven't hit today's goal yet: your study plan's target for today when a
plan is active, otherwise your daily goal. The text is "Keep your N-day streak: 3 lessons left today" (or a generic
nudge when the account has no synced progress). Tapping it opens blop on the Today tab.

- Needs sign-in (sync): subscriptions are stored per account in Supabase. Signed out, the panel says so.
- Turn it on on each device you want reminders on. Whether *this* device is subscribed is kept on the device
  (`blop-push` in localStorage); the time is synced, and a device re-saves its subscription when the time or its
  time zone changed. The entry records the account it was turned on for: if someone else signs in later (after a
  plain sign-out), the device is unsubscribed and the panel shows Off, so they never get the other account's
  reminders. Starting fresh for a different account (the account-switch prompt) unsubscribes the device too.
- iPhone/iPad: Web Push only works in the Home Screen app (iOS 16.4+). In Safari the panel says "Add blop to your
  Home Screen first (Share → Add to Home Screen), then turn this on". Browsers without push see an explanation instead
  of the toggle. If notifications were blocked, the panel says how to allow them again.

### How it works
- Web Push with VAPID. `config.js` has the public key (`vapidPublicKey`); the private key is only the
  `VAPID_PRIVATE_KEY` env var. `web-push` is the only npm dependency (`package.json`, no build script: Vercel serves the
  static files as before and bundles `web-push` into the functions).
- `POST /api/push-subscribe` `{ subscription, time: "HH:MM", tz }` with the Supabase bearer token saves the browser's
  subscription; `DELETE` `{ endpoint }` removes it. Same-origin only, the token is checked against
  `SUPABASE_URL/auth/v1/user`, the endpoint must be https on a known push service (fcm.googleapis.com,
  updates.push.services.mozilla.com, web.push.apple.com, *.push.apple.com, *.notify.windows.com), the time must be
  HH:MM and the zone a real IANA zone. Writes use the service-role key. At most 10 subscriptions per account: a new
  device beyond that replaces the oldest.
- `/api/cron-remind` (`Authorization: Bearer <CRON_SECRET>`, compared in constant time) runs hourly. A subscription is
  due when its local time is within the hour after its reminder time and it hasn't been reminded that local day
  (`last_sent_day`). The run claims the day first (so overlapping runs can't double-send), loads the user's synced
  `progress` row, works out today's goal with the app's own `plan.js`/`state.js` and curriculum, and sends only if it
  isn't done. Subscriptions the push service reports as gone (404/410) are deleted; other failures un-claim the day.
  It stops starting new sends after 45 s (`maxDuration` 60 s).
- The service worker shows the notification (title "blop", icon-192) and focuses or opens `/?tab=today` on tap.
- The reminder uses the progress the account last synced, so lessons finished offline and not yet synced don't count.

### Setup
1. In Supabase → SQL Editor, run `supabase/schema.sql` again (it's safe to re-run). The new section creates
   `push_subs` with RLS on and no policies, so only the service role can read or write it.
2. Env vars on Vercel (Production and Preview) are already set: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` and `CRON_SECRET`. The functions also need `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` (see "Mock interviews → Setup"), and `config.js` needs the Supabase URL and anon key so
   people can sign in. To rotate the VAPID keys, run `npx web-push generate-vapid-keys`, update both env vars and
   `config.js`; existing subscriptions then stop working and each device has to turn reminders on again.
3. The GitHub Action `.github/workflows/remind.yml` calls `https://blop-nu.vercel.app/api/cron-remind` at :05 every
   hour (Vercel Hobby cron only runs daily). It uses the repository secret `CRON_SECRET` (already set; it must match
   the Vercel env var). It targets production only, and GitHub only runs scheduled workflows from the default branch,
   so it starts after this is merged to `main`. Until the function is deployed to production the call returns 404,
   and until its env vars are set it returns 503; the workflow logs both (and an unreachable site) as warnings
   without failing. A 401 (secret mismatch) or any other error fails the run. GitHub can start scheduled runs late, and a run that starts
   more than an hour after someone's reminder time skips them that day.
4. After merging, trigger a run by hand with `gh workflow run remind.yml` and check it with `gh run list --workflow remind.yml`.

### Testing on a phone
- Android (Chrome): open the site, sign in on Profile, turn on Daily reminder and allow notifications. Set the time to
  the current hour (e.g. 14:00 at 14:20), make sure today's goal isn't done, then run `gh workflow run remind.yml`.
- iPhone (iOS 16.4+): Safari → Share → Add to Home Screen, open blop from the Home Screen, sign in with the email code,
  then do the same as Android. In Safari itself the panel only explains the Home Screen step.
- Each device gets at most one reminder per day; to test again the same day, clear `last_sent_day` for that row in
  Supabase → Table Editor → `push_subs`.

## Reset
Profile → "Reset study progress" clears finished lessons, XP, the study streak, review schedule, missed questions, lesson
times, today's counts and the study plan, on this device and (through sync) on your other devices. It keeps job applications, mock interview history and settings (daily goal, job target, subject,
reminder time, plan units).

Run all tests with `node --test test/plan.test.js test/content.test.js test/srs.test.js test/jobs.test.js test/state.test.js test/merge.test.js test/sync-logic.test.js test/mock.test.js test/grade-core.test.js test/grade-handler.test.js test/core-state.test.js test/push-core.test.js test/push-handlers.test.js test/push-logic.test.js test/sw-push.test.js`.
`test/fixtures/content-ids-0bc9f56.json` snapshots the lesson and question ids of `content.js`; the tests fail if any of them disappear.
