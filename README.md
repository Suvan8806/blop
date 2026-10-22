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

`why` is optional everywhere. Malformed questions are skipped (see `normQ` in `logic.js`) without shifting other ids.
Keyboard: number keys pick options (or the next step to place), Backspace removes the last placed step,
match uses numbers for terms and letters for definitions, and Enter checks or continues.

After editing, bump `CACHE` in `sw.js` (e.g. "blop-v6") so phones pick up the change, and add any new file to its `ASSETS` list.

Progress is stored in the browser on each device. Signing in (optional, see below) syncs it across devices.

## Login and sync (optional)
Sign in on the Profile tab with Google or a 6-digit email code, and progress, streak, reviews, the study plan,
job applications and settings stay the same on every device. localStorage stays the source the app reads from,
so everything works offline and without an account. With `config.js` empty, Profile says "Sync isn't set up yet"
and the app never contacts Supabase.

### Setup
1. Create a Supabase project at supabase.com (the free tier is enough).
2. In Supabase → SQL Editor, paste and run `supabase/schema.sql`. It creates the `progress` table with row-level
   security so each user can only select, insert and update their own row.
3. In Google Cloud Console → APIs & Services: set up the OAuth consent screen (External), then Credentials →
   Create credentials → OAuth client ID → **Web application**. Add this **Authorized redirect URI**:
   `https://<ref>.supabase.co/auth/v1/callback` (`<ref>` is your Supabase project ref, as in the project URL).
4. In Supabase → Authentication → Sign In / Providers → **Google**: turn it on and paste that client ID and client secret.
5. In Supabase → Authentication → URL Configuration: set **Site URL** to `https://blop-nu.vercel.app`, and add these
   **Redirect URLs**: `https://blop-nu.vercel.app`, `https://blop-git-dev2-suvan8806s-projects.vercel.app` and `http://127.0.0.1:*`.
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
- Signing out only forgets the session on this device; progress stays.
- On an iPhone home-screen app, use the email code: a Google sign-in can finish in Safari instead of the app.
- Reset on a signed-in device clears this device; lessons already synced come back on the next sync (merging never
  drops a finished lesson).

Merge rules: finished lessons are a union (earliest day kept), XP and missed-question counts take the max, the streak
comes from the side that studied most recently, review schedule entries and jobs (including delete tombstones) take
the newer `updatedAt`, the plan takes the newer `updatedAt` (an ended plan is `{ended:true, updatedAt}`) with daily
targets merged by max, lesson times are a union capped at 20, settings follow `settingsUpdatedAt`, today's counters
take the max on the same day, and any field added later follows the newer top-level `updatedAt`.

## Code layout
- `logic.js`: pure content logic (building units, normalising questions, checking answers, subjects). Tested in node.
- `plan.js`: pure study-plan and calendar logic. Tested in node.
- `srs.js`: pure spaced-repetition scheduling. Tested in node.
- `jobs.js`: pure job-tracker logic (stats, streak, filters, link checks). Tested in node.
- `state.js`: which saved fields are progress and which are settings; reset. Tested in node.
- `merge.js`: merges this device's state with the account's copy. Tested in node.
- `sync-logic.js`: sync helpers (config and input checks, redirect URLs, error messages, push scheduler). Tested in node.
- `config.js`: Supabase URL and anon key (empty = no sync).
- `sync.js`: sign-in and pull/merge/push with Supabase. `sync-ui.js`: the Profile sync panel.
- `supabase/schema.sql`: the `progress` table and its row-level security policies.
- `core.js`: saved state, helpers and the lesson/practice session runner.
- `qtypes.js`: rendering for each question type.
- `today.js`: the Today tab (today's lessons, reviews, calendar, plan settings).
- `jobs-ui.js`: the Jobs tab.
- `app.js`: tabs, the Learn and Profile screens.

They share code through `window.Blop`.

## Study plan
The Today tab spreads the lessons you have left over 14, 30, 45 or 60 days. Today's target is fixed
for the day; every day after it is recalculated from what's actually left, so extra lessons make
later days lighter and missed days make them heavier. Untick units you already know to drop them
from the count; units added to the app after a plan starts stay out of it until you tick them.
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

## Reset
Profile → "Reset study progress" clears finished lessons, XP, the study streak, review schedule, missed questions, lesson
times, today's counts and the study plan. It keeps job applications and settings (daily goal, job target, subject,
reminder time, plan units).

Run all tests with `node --test test/plan.test.js test/content.test.js test/srs.test.js test/jobs.test.js test/state.test.js test/merge.test.js test/sync-logic.test.js`.
`test/fixtures/content-ids-0bc9f56.json` snapshots the lesson and question ids of `content.js`; the tests fail if any of them disappear.
