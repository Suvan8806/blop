/* The app's units on the server, built exactly as index.html does: the content files push onto
   window.CURRICULUM, then logic.js turns it into units with lesson ids. Loaded once per function instance and
   used by /api/cron-remind to work out a study plan's target for today. Static require paths, so Vercel
   bundles the content files with the function. */
"use strict";
const Logic = require("../../logic.js");

let units = null;
function loadUnits() {
  if (units) return units;
  const hadWindow = "window" in globalThis, prev = globalThis.window;
  globalThis.window = { CURRICULUM: undefined };
  try {
    require("../../content.js");
    require("../../content-code.js");
    require("../../content-sd.js");
    require("../../content-ml-deep.js");
    require("../../content-extra.js");
    require("../../content-interactive.js");
    const warn = console.warn;
    console.warn = () => {}; // buildUnits warns about skipped malformed questions; not useful in function logs
    try { units = Logic.buildUnits(globalThis.window.CURRICULUM); } finally { console.warn = warn; }
  } finally {
    if (hadWindow) globalThis.window = prev; else delete globalThis.window;
  }
  return units;
}

module.exports = { loadUnits };
