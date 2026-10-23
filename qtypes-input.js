/* Typed question types: num (a number), est (a log-scale estimate), type (a typed answer or code cloze),
   output (predict what code prints) and cm (fill a confusion matrix, then metrics). They register into
   qtypes.js and follow its mount() contract; the answer checks are pure functions in logic.js.
   Enter in a one-line field checks the answer (core.js); digit shortcuts never fire while typing. */
(() => {
if (!window.Blop || !window.Blop.qtypes) return;
const B = window.Blop, L = B.logic, T = B.qtypes;
const { esc, fmt } = B;
const { tick } = T.util;
let uid = 0;
const nextId = () => `qi${++uid}`;
/* Attributes for a text field where autocorrect would only get in the way. */
const PLAIN = `autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"`;
const focusSoon = el => { if (el) setTimeout(() => { if (document.body.contains(el) && !el.disabled) el.focus({ preventScroll: true }); }, 0); };
const lines = s => s.split("\n").map(fmt).join("<br>");
/* A result line shown under the field after checking. */
function verdict(box, ok, html){ box.innerHTML = `${tick(ok)}<span>${html}</span>`; box.hidden = false; }
function markField(wrap, ok){ wrap.classList.add(ok ? "right" : "wrong"); }

/* ---------- num ---------- */
function numHint(q){
  const t = q.rel ? `Within ${+(q.rel * 100).toFixed(2)}% counts.` : q.tol ? `Within ±${L.fullNum(q.tol)} counts.` : "Give the exact value.";
  return Math.abs(q.answer) >= 1000 ? `${t} You can type 1200, 1,200, 1.2k or 1.2e3.` : t;
}
function mountNum(root, q, api){
  const id = nextId();
  root.innerHTML = `<div class="tin-wrap"><label class="sr-only" for="${id}">Your answer${q.unit ? ` in ${esc(q.unit)}` : ""}</label>
      <input id="${id}" class="tin" type="text" inputmode="${q.answer < 0 ? "text" : "decimal"}" ${PLAIN} placeholder="Your answer" aria-describedby="${id}h">
      ${q.unit ? `<span class="tunit" aria-hidden="true">${esc(q.unit)}</span>` : ""}</div>
    <p class="hint" id="${id}h">${numHint(q)}</p><p class="verdict" hidden></p>`;
  const input = root.querySelector("input"), wrap = root.querySelector(".tin-wrap"), box = root.querySelector(".verdict");
  let done = false;
  input.oninput = () => api.ready(Number.isFinite(L.parseNumber(input.value, q.unit)));
  focusSoon(input);
  return {
    check(){
      if (done || !Number.isFinite(L.parseNumber(input.value, q.unit))) return;
      done = true; input.disabled = true;
      const x = L.parseNumber(input.value, q.unit), right = L.checkNum(q, input.value);
      markField(wrap, right);
      const off = q.answer !== 0 && !right ? ` You were ${L.shortNum(Math.abs(x - q.answer) / Math.abs(q.answer) * 100)}% off.` : "";
      verdict(box, right, `Exact: <b>${esc(L.fullNum(q.answer))}${q.unit ? " " + esc(q.unit) : ""}</b>.${off}`);
      api.answer(right);
    },
    key(){ return false; }
  };
}

/* ---------- est: a log-scale slider plus a typed box ---------- */
const STEPS = 240;
function mountEst(root, q, api){
  const id = nextId(), lo = Math.log10(q.min), hi = Math.log10(q.max), step = (hi - lo) / STEPS;
  const pct = v => ((Math.log10(v) - lo) / (hi - lo) * 100).toFixed(2);
  const unit = q.unit ? " " + esc(q.unit) : "";
  root.innerHTML = `<div class="est">
      <div class="est-read"><b aria-hidden="true">?</b>${unit ? `<span aria-hidden="true">${unit}</span>` : ""}</div>
      <div class="est-track"><input id="${id}" type="range" min="${lo}" max="${hi}" step="${step}" value="${(lo + hi) / 2}"
        aria-label="Your estimate${unit}, on a log scale" aria-valuetext="not set yet">
        <span class="est-band" hidden></span><span class="est-ans" hidden></span></div>
      <div class="est-ends" aria-hidden="true"><span>${esc(L.shortNum(q.min))}</span><span>${esc(L.shortNum(q.max))}</span></div>
      <div class="tin-wrap small"><label for="${id}t">or type it</label>
        <input id="${id}t" class="tin" type="text" inputmode="decimal" ${PLAIN} placeholder="e.g. 12k" aria-describedby="${id}h"></div>
      <p class="hint" id="${id}h">The slider is logarithmic: equal distances are equal multiples. Within ×${L.fullNum(q.within)} either way counts.</p>
      <p class="verdict" hidden></p></div>`;
  const range = root.querySelector("input[type=range]"), typed = root.querySelector("input.tin"), read = root.querySelector(".est-read b");
  const box = root.querySelector(".verdict");
  let value = NaN, done = false;
  function show(v, fromTyped){
    value = v;
    const label = Number.isFinite(v) && v > 0 ? L.shortNum(v) : "?";
    read.textContent = label;
    range.setAttribute("aria-valuetext", Number.isFinite(v) ? `${label}${q.unit ? " " + q.unit : ""}` : "not set yet");
    if (!fromTyped) typed.value = "";
    api.ready(Number.isFinite(v) && v > 0);
  }
  range.oninput = () => show(+Number(10 ** +range.value).toPrecision(2), false);
  typed.oninput = () => {
    const v = L.parseNumber(typed.value, q.unit);
    if (Number.isFinite(v) && v > 0) range.value = String(Math.min(hi, Math.max(lo, Math.log10(v))));
    show(v, true);
  };
  return {
    check(){
      if (done || !(value > 0)) return;
      done = true; range.disabled = true; typed.disabled = true;
      const right = L.checkEst(q, value), [bl, bh] = L.estBand(q);
      const band = root.querySelector(".est-band"), ans = root.querySelector(".est-ans");
      const a = Math.max(0, +pct(Math.max(bl, q.min))), b = Math.min(100, +pct(Math.min(bh, q.max)));
      band.style.left = a + "%"; band.style.width = (b - a) + "%"; band.hidden = false;
      ans.style.left = pct(q.answer) + "%"; ans.hidden = false;
      root.querySelector(".est").classList.add(right ? "right" : "wrong");
      verdict(box, right, `You said ${esc(L.shortNum(value))}. Answer ≈ <b>${esc(L.shortNum(q.answer))}${unit}</b>; anything from ${esc(L.shortNum(bl))} to ${esc(L.shortNum(bh))} counts (the shaded band).`);
      api.answer(right);
    },
    key(){ return false; }
  };
}

/* ---------- type: a typed answer, often the missing piece of the code above ---------- */
const NORM_HINT = { text: "Case and spacing don't matter.", code: "Spaces and quote style don't matter.", exact: "Type it exactly." };
function typedField(root, q, api, multi){
  const id = nextId(), code = q.norm !== "text";
  const rows = multi ? Math.min(8, Math.max(2, q.answers[0].split("\n").length)) : 0;
  const field = multi
    ? `<textarea id="${id}" class="tin mono" rows="${rows}" ${PLAIN} aria-describedby="${id}h" placeholder="One line per printed line"></textarea>`
    : `<input id="${id}" class="tin${code ? " mono" : ""}" type="text" ${PLAIN} aria-describedby="${id}h" placeholder="${q.type === "output" ? "What it prints" : "Your answer"}">`;
  return { id, html: `<div class="tin-wrap"><label class="sr-only" for="${id}">Your answer</label>${field}</div>` };
}
function mountTyped(root, q, api, hint){
  const multi = q.type === "output" && q.answers[0].includes("\n");
  const f = typedField(root, q, api, multi);
  root.innerHTML = `${f.html}<p class="hint" id="${f.id}h">${hint}${multi ? " Ctrl+Enter checks." : ""}</p><p class="verdict" hidden></p>`;
  const input = root.querySelector(".tin"), wrap = root.querySelector(".tin-wrap"), box = root.querySelector(".verdict");
  let done = false;
  const ctl = {
    check(){
      if (done || !input.value.trim()) return;
      done = true; input.disabled = true;
      const right = L.checkTyped(q, input.value);
      markField(wrap, right);
      if (q.type === "output") verdict(box, right, `It prints:<pre class="vout"><code>${esc(q.answers[0])}</code></pre>`);
      else {
        // Other accepted forms, leaving out ones that differ only in spacing or quotes.
        const seen = new Set(), alts = q.answers.filter(a => { const k = L.normAnswer(a, q.norm); return !seen.has(k) && seen.add(k); });
        if (alts.length > 1) verdict(box, right, `Accepted: ${alts.map(a => `<code>${esc(a)}</code>`).join(" or ")}`);
      }
      api.answer(right);
    },
    key(){ return false; }
  };
  input.oninput = () => api.ready(!!input.value.trim());
  if (multi) input.onkeydown = e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ctl.check(); } };
  focusSoon(input);
  return ctl;
}
function mountType(root, q, api){ return mountTyped(root, q, api, NORM_HINT[q.norm]); }
function mountOutput(root, q, api){
  if (q.mode === "mc") return T.util.mountChoice(root, q, api);
  return mountTyped(root, q, api, q.norm === "py" ? "Type exactly what it prints. Spacing and quote style don't matter." : NORM_HINT.exact);
}

/* ---------- cm: confusion matrix, then metrics ---------- */
const CELL_NAME = { tp: "True positives", fp: "False positives", fn: "False negatives", tn: "True negatives" };
function mountCM(root, q, api){
  const id = nextId(), [pos, neg] = q.labels.map(esc);
  const cell = k => `<label class="cmc" for="${id}${k}"><small>${k.toUpperCase()}</small>
    <input id="${id}${k}" class="tin" type="text" inputmode="numeric" ${PLAIN} data-c="${k}" aria-label="${CELL_NAME[k]}: actually ${k[1] === "p" ? (k[0] === "t" ? pos : neg) : (k[0] === "t" ? neg : pos)}, predicted ${k[1] === "p" ? pos : neg}"></label>`;
  const metric = (m, i) => `<div class="tin-wrap small"><label for="${id}m${i}">${esc(L.CM_METRICS[m.metric])}</label>
    <input id="${id}m${i}" class="tin" type="text" inputmode="decimal" ${PLAIN} data-m="${i}" placeholder="0.75 or 75%"></div>`;
  root.innerHTML = `<div class="cm" role="group" aria-label="Confusion matrix">
      <span></span><span class="cmh">Predicted ${pos}</span><span class="cmh">Predicted ${neg}</span>
      <span class="cmh row">Actually ${pos}</span>${cell("tp")}${cell("fn")}
      <span class="cmh row">Actually ${neg}</span>${cell("fp")}${cell("tn")}</div>
    ${q.then.length ? `<div class="cmm"><p class="hint">Then from your matrix (to 2 decimal places):</p>${q.then.map(metric).join("")}</div>` : ""}
    <p class="verdict" hidden></p>`;
  const cells = [...root.querySelectorAll("[data-c]")], ms = [...root.querySelectorAll("[data-m]")], all = [...cells, ...ms];
  const read = () => ({ cells: Object.fromEntries(cells.map(i => [i.dataset.c, i.value])), metrics: ms.map(i => i.value) });
  let done = false;
  all.forEach(i => { i.oninput = () => api.ready(all.every(x => Number.isFinite(L.parseNumber(x.value)))); });
  focusSoon(cells[0]);
  return {
    check(){
      if (done || !all.every(x => Number.isFinite(L.parseNumber(x.value)))) return;
      done = true;
      const r = read(), marks = L.cmMarks(q, r.cells, r.metrics);
      cells.forEach(i => {
        const ok = marks.cells[i.dataset.c];
        i.disabled = true; i.parentNode.classList.add(ok ? "right" : "wrong");
        i.insertAdjacentHTML("afterend", ok ? tick(true) : `${tick(false)}<b class="fix">${q.cells[i.dataset.c]}</b>`);
      });
      ms.forEach((i, k) => {
        const ok = marks.metrics[k];
        i.disabled = true; i.parentNode.classList.add(ok ? "right" : "wrong");
        i.insertAdjacentHTML("afterend", ok ? tick(true) : `${tick(false)}<b class="fix">${+q.then[k].answer.toFixed(4)}</b>`);
      });
      verdict(root.querySelector(".verdict"), marks.ok, marks.ok ? "Every cell and metric is right." : "Wrong entries show the right value next to them.");
      api.answer(marks.ok);
    },
    key(){ return false; }
  };
}

const ans = q => `Answer: ${lines(L.answerText(q))}`;
T.register("num", { mount: mountNum, kicker: "Work it out", answerHTML: ans });
T.register("est", { mount: mountEst, kicker: "Estimate it", answerHTML: ans });
T.register("type", { mount: mountType, kicker: "Type the answer", answerHTML: q => `Answer: <code>${esc(q.answers[0])}</code>` });
T.register("output", { mount: mountOutput, kicker: "Predict the output",
  answerHTML: q => (q.mode === "mc" ? ans(q) : "The expected output is shown above.") });
T.register("cm", { mount: mountCM, kicker: "Build the confusion matrix", answerHTML: q => lines(L.answerText(q)) });
})();
