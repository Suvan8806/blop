# blop

A Duolingo-style study app for ML engineering and system design interviews.
18 units, 157 lessons, 471 questions. Works offline and installs to your home screen.

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
All lessons live in `content.js`. Each lesson is `[title, teach text, questions]`,
and each question is `[prompt, [correct answer, wrong, wrong], optional explanation]`.
The correct answer is always listed first; the app shuffles options.
After editing, bump `CACHE` in `sw.js` (e.g. "blop-v2") so phones pick up the change.

Progress is stored in the browser on each device.
