# blop

A Duolingo-style study app for ML engineering, coding and system design interviews.
22 units, 176 lessons, 534 questions across three subjects (ML, Coding, System Design). Works offline and installs to your home screen.

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
| `content-sd.js`, `content-ml-deep.js` | coming later, in that order |
| `content-extra.js` | extra questions appended to lessons that already shipped |

**Never reorder or delete units, lessons or questions.** Ids come from array positions
(`u{unit}l{lesson}` and `u{unit}l{lesson}q{n}`) and saved progress uses them. Only append:
new units at the end of `window.CURRICULUM`, new questions at the end of a lesson's list.

### Units
`{t:"Title", tr:"code", ls:[ lessons ]}`. `tr` is the subject: `"ml"` (default), `"code"` or `"sd"`.
Units 16 and 17 are tagged `sd` in `logic.js` (`UNIT_SUBJECT`) so `content.js` stays untouched.

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

After editing, bump `CACHE` in `sw.js` (e.g. "blop-v4") so phones pick up the change, and add any new file to its `ASSETS` list.

Progress is stored in the browser on each device.

## Code layout
- `logic.js`: pure content logic (building units, normalising questions, checking answers, subjects). Tested in node.
- `plan.js`: pure study-plan and calendar logic. Tested in node.
- `srs.js`: pure spaced-repetition scheduling. Tested in node.
- `jobs.js`: pure job-tracker logic (stats, streak, filters, link checks). Tested in node.
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
Finishing a lesson schedules a review for tomorrow. A review moves a lesson along 1 → 3 → 7 → 21 → 60 days when every
question from it was right first try, and back to 1 day if any was wrong. The daily review takes up to 15 questions from
due lessons, previously missed questions first; with nothing due it offers extra practice instead.

## Jobs
The Jobs tab logs job applications: "+1 Applied" records one for today in a single tap, and "Add details" takes a
company, role, link and date. Each application has a status (applied, OA, phone screen, onsite, offer, rejected,
ghosted). The response rate counts applications whose status moved past Applied, except Ghosted. Links must be http(s).

Run all tests with `node --test test/plan.test.js test/content.test.js test/srs.test.js test/jobs.test.js`.
