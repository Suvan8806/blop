/* Question types. Each type mounts into the session's answer area and reports back through
   api.ready(bool) (enables Check) and api.answer(right) (shows the feedback footer).
   mount() returns { check(), key(event) -> handled }. Answer logic lives in logic.js.
   The tap types live here; qtypes-input.js and qtypes-tap.js add the interactive formats through register(). */
(() => {
if (!window.Blop || !window.Blop.logic) return; // an old cached index.html; app.js shows the reload screen
const B = window.Blop, L = B.logic;
const { esc, fmt, shuffle } = B;
const LETTERS = "ABCDEFGH";
const FLASH_MS = 650;

const KICKERS = { mc: "Choose the right answer", gap: "Fill in the blank", order: "Put these in order", match: "Match the pairs",
  derive: "Build the derivation", rank: "Rank these" };
/* Types added by other files: type -> { mount, kicker, answerHTML?(q), checkLabel? }. */
const EXT = {};
function register(type, def){ EXT[type] = def; }
const ext = q => (Object.prototype.hasOwnProperty.call(EXT, q.type) ? EXT[q.type] : null);
function kicker(q){ const x = ext(q); return (x && x.kicker) || KICKERS[q.type] || KICKERS.mc; }
/* The optional code snippet shown above the prompt. bug and blanks draw their code themselves; in a typed
   cloze the ___ in the code is drawn as a blank. */
const OWN_CODE = ["bug", "blanks"];
function codeHTML(q){
  if (!q.code || OWN_CODE.includes(q.type)) return "";
  let h = esc(q.code);
  if (q.type === "type") h = h.replace("___", `<span class="cblank" role="img" aria-label="blank">____</span>`);
  return `<pre class="qcode" aria-label="Code"><code>${h}</code></pre>`;
}
function prompt(q){
  const h = fmt(q.p);
  return q.type === "gap" ? h.replace("___", `<span class="blank" id="blank" aria-label="blank">&nbsp;</span>`) : h;
}
function checkLabel(q){ const x = ext(q); return (x && x.checkLabel) || (q.type === "match" ? "Match every pair" : "Check"); }
const ORDER_HEAD = { order: "Correct order", derive: "Correct derivation", rank: "Correct ranking" };
function answerHTML(q){
  const x = ext(q);
  if (x && x.answerHTML) return x.answerHTML(q);
  if (q.type === "match") return "Every pair is shown correctly above now. Wrong tries count as a miss.";
  const lines = L.answerText(q).split("\n").map(fmt).join("<br>");
  return ORDER_HEAD[q.type] ? `${ORDER_HEAD[q.type]}:<br>${lines}` : `Answer: ${lines}`;
}
/* A right/wrong mark that doesn't rely on colour: a symbol plus a spoken label. */
function tick(ok){ return `<span class="tick ${ok ? "ok" : "no"}" role="img" aria-label="${ok ? "correct" : "wrong"}">${ok ? "✓" : "✗"}</span>`; }
const digit = e => { const n = parseInt(e.key, 10); return n >= 1 && n <= 9 ? n - 1 : -1; };
const optBtn = (attr, k, html, cls = "") =>
  `<button class="opt ${cls}" ${attr} aria-pressed="false"><span class="k" aria-hidden="true">${k}</span><span>${html}</span></button>`;
function press(btns, on){ btns.forEach(b => { const p = b === on; b.classList.toggle("sel", p); b.setAttribute("aria-pressed", p); }); }

/* ---------- multiple choice and fill-the-gap ---------- */
function mountChoice(root, q, api){
  const choices = shuffle(q.opts), isGap = q.type === "gap";
  const blank = root.parentNode.querySelector(".blank");
  let sel = -1, done = false;
  root.innerHTML = `<div class="opts${isGap ? " words" : ""}" role="group" aria-label="Options">${
    choices.map((c, i) => optBtn(`data-i="${i}"`, i + 1, fmt(c))).join("")}</div>`;
  const btns = [...root.querySelectorAll(".opt")];
  function pick(i){
    if (done) return;
    sel = i; press(btns, btns[i]);
    if (blank) { blank.innerHTML = fmt(choices[i]); blank.classList.add("filled"); }
    api.ready(true);
  }
  btns.forEach((b, i) => b.onclick = () => pick(i));
  return {
    check(){
      if (sel < 0 || done) return;
      done = true;
      const right = L.checkChoice(q, choices[sel]);
      btns.forEach((b, i) => { b.disabled = true; b.classList.remove("sel");
        if (choices[i] === q.ok) { b.classList.add("right"); b.insertAdjacentHTML("beforeend", tick(true)); }
        else if (i === sel) { b.classList.add("wrong"); b.insertAdjacentHTML("beforeend", tick(false)); } });
      if (blank) blank.classList.add(right ? "right" : "wrong");
      api.answer(right);
    },
    key(e){ const i = digit(e); if (done || i < 0 || i >= btns.length) return false; pick(i); return true; }
  };
}

/* ---------- order the steps ---------- */
function shuffledIdx(n){
  const id = [...Array(n).keys()];
  for (let t = 0; t < 5; t++) { const s = shuffle(id); if (n < 2 || s.some((x, i) => x !== i)) return s; }
  return id.slice().reverse();
}
/* Also derive (q.pool holds the steps plus decoys, which must stay unplaced) and rank (q.axis names the ends). */
function mountOrder(root, q, api){
  const src = q.pool || q.items;
  const pool = shuffledIdx(src.length); // indexes into src, in display order
  let seq = [], marks = null;
  const remaining = () => pool.filter(oi => !seq.includes(oi)); // unplaced item indexes, in display order
  function draw(focusSel){
    const n = q.items.length;
    const slots = seq.map((_, pos) => {
      const cls = marks ? (marks[pos] ? "right" : "wrong") : "placed";
      const text = src[seq[pos]];
      return `<li><button class="opt ${cls}" data-pos="${pos}" aria-label="Step ${pos + 1}: ${esc(text)}${marks ? (marks[pos] ? ", correct" : ", wrong") : ". Tap to remove"}"${marks ? " disabled" : ""}>
        <span class="k" aria-hidden="true">${pos + 1}</span><span>${fmt(text)}</span>${marks ? tick(marks[pos]) : ""}</button></li>`;
    }).join("") + (seq.length < n ? `<li class="slot" aria-hidden="true"><span class="k">${seq.length + 1}</span>
      <span>${seq.length ? "Tap the next step" : "Tap the first step"}</span></li>` : "");
    const left = remaining().map((oi, k) => optBtn(`data-k="${oi}"`, k + 1, fmt(src[oi]))).join("");
    const axis = q.axis ? `<div class="axis" aria-label="Rank from ${esc(q.axis[0])} to ${esc(q.axis[1])}"><span>1 = ${esc(q.axis[0])}</span><span aria-hidden="true">→</span><span>${n} = ${esc(q.axis[1])}</span></div>` : "";
    const decoyNote = q.decoys && !marks ? `<p class="hint">Some steps are traps: leave them out.</p>` : "";
    root.innerHTML = `${axis}<ol class="seq" aria-label="Your order">${slots}</ol>${decoyNote}
      ${marks ? "" : `<div class="opts pool" role="group" aria-label="Steps to place">${left}</div>`}`;
    root.querySelectorAll("[data-pos]").forEach(b => b.onclick = () => remove(+b.dataset.pos));
    root.querySelectorAll("[data-k]").forEach(b => b.onclick = () => place(+b.dataset.k));
    if (focusSel) { const f = root.querySelector(focusSel); if (f) f.focus({ preventScroll:true }); }
    api.ready(!marks && seq.length === n);
  }
  const keepFocus = () => root.contains(document.activeElement);
  function place(oi){ if (marks || seq.includes(oi) || seq.length >= q.items.length) return; const f = keepFocus(); seq = [...seq, oi]; draw(f && "[data-k], [data-pos]"); }
  function remove(pos){ if (marks) return; const f = keepFocus(); seq = seq.filter((_, i) => i !== pos); draw(f && "[data-k]"); }
  draw();
  return {
    check(){
      if (marks || seq.length !== q.items.length) return;
      marks = L.orderMarks(q, seq); draw();
      api.answer(L.checkOrder(q, seq));
    },
    key(e){
      if (marks) return false;
      if (e.key === "Backspace" && seq.length) { remove(seq.length - 1); return true; }
      const k = digit(e), left = remaining();
      if (k < 0 || k >= left.length) return false;
      place(left[k]); return true;
    }
  };
}

/* ---------- match pairs ---------- */
function mountMatch(root, q, api){
  const n = q.pairs.length;
  const terms = shuffle([...Array(n).keys()]), defs = shuffle([...Array(n).keys()]);
  const lockT = new Map(), lockD = new Map(); // pair index -> display number of its term
  let selT = -1, selD = -1, misses = 0, busy = false;
  root.innerHTML = `<div class="match${q.mono ? " mono" : ""}">
    <div class="mterms" role="group" aria-label="Terms">${terms.map((pi, i) => optBtn(`data-t="${pi}"`, i + 1, fmt(q.pairs[pi][0]))).join("")}</div>
    <div class="opts mdefs" role="group" aria-label="Definitions">${defs.map((pi, i) => optBtn(`data-d="${pi}"`, LETTERS[i], fmt(q.pairs[pi][1]))).join("")}</div></div>`;
  const tBtns = [...root.querySelectorAll("[data-t]")], dBtns = [...root.querySelectorAll("[data-d]")];
  const tBtn = pi => tBtns.find(b => +b.dataset.t === pi), dBtn = pi => dBtns.find(b => +b.dataset.d === pi);
  function lock(t, d){
    const num = terms.indexOf(t) + 1;
    lockT.set(t, num); lockD.set(d, num);
    [tBtn(t), dBtn(d)].forEach(b => { b.classList.remove("sel"); b.classList.add("right"); b.disabled = true; b.setAttribute("aria-pressed", "false"); });
    dBtn(d).querySelector(".k").textContent = num;
  }
  function flash(t, d){
    misses++; busy = true;
    const bs = [tBtn(t), dBtn(d)];
    bs.forEach(b => { b.classList.remove("sel"); b.setAttribute("aria-pressed", "false"); b.classList.add("wrong", "flash"); });
    if (navigator.vibrate) navigator.vibrate(40);
    setTimeout(() => { bs.forEach(b => b.classList.remove("wrong", "flash")); busy = false; }, FLASH_MS);
  }
  function tryPair(){
    if (selT < 0 || selD < 0) return;
    const t = selT, d = selD; selT = selD = -1;
    if (L.checkPair(q, t, d)) lock(t, d); else flash(t, d);
    if (lockT.size === n) api.answer(misses === 0);
  }
  function pickT(pi){ if (busy || lockT.has(pi)) return; selT = pi; press(tBtns.filter(b => !b.disabled), tBtn(pi)); tryPair(); }
  function pickD(pi){ if (busy || lockD.has(pi)) return; selD = pi; press(dBtns.filter(b => !b.disabled), dBtn(pi)); tryPair(); }
  tBtns.forEach(b => b.onclick = () => pickT(+b.dataset.t));
  dBtns.forEach(b => b.onclick = () => pickD(+b.dataset.d));
  return {
    check(){},
    key(e){
      if (lockT.size === n) return false;
      const i = digit(e), li = LETTERS.indexOf(String(e.key).toUpperCase());
      if (i >= 0 && i < n) { pickT(terms[i]); return true; }
      if (e.key.length === 1 && li >= 0 && li < n) { pickD(defs[li]); return true; }
      return false;
    }
  };
}

const MOUNT = { mc: mountChoice, gap: mountChoice, order: mountOrder, match: mountMatch, derive: mountOrder, rank: mountOrder };
function mount(root, q, api){
  const x = ext(q);
  return (x ? x.mount : MOUNT[q.type] || mountChoice)(root, q, api);
}

B.qtypes = { kicker, prompt, codeHTML, checkLabel, answerHTML, mount, register,
  util: { tick, digit, optBtn, press, LETTERS, mountChoice } };
})();
