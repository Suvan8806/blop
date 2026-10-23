/* Tap question types: bug (tap the buggy line, then the fix), blanks (dropdowns inside code), bigo (time and
   space complexity), dims (build a shape from chips), bucket (sort cards), tf (a true/false deck) and compare
   (pick the better of two variants, then why). They register into qtypes.js and follow its mount() contract;
   the answer checks are pure functions in logic.js. Every control is a real button or select, and every
   right/wrong mark carries a symbol and a label as well as a colour. */
(() => {
if (!window.Blop || !window.Blop.qtypes) return;
const B = window.Blop, L = B.logic, T = B.qtypes;
const { esc, fmt, shuffle } = B;
const { tick, digit, optBtn, press, LETTERS } = T.util;
const letter = e => (e.key && e.key.length === 1 ? LETTERS.indexOf(e.key.toUpperCase()) : -1);
const lines = s => s.split("\n").map(fmt).join("<br>");
/* A one-of-n group of chip buttons. */
const chip = (attr, k, html, label) =>
  `<button class="chipb" ${attr} role="radio" aria-checked="false"${label ? ` aria-label="${esc(label)}"` : ""}>${k ? `<span class="k" aria-hidden="true">${k}</span>` : ""}<span>${html}</span></button>`;
function check1(btns, on){ btns.forEach(b => { const p = b === on; b.classList.toggle("sel", p); b.setAttribute("aria-checked", p); }); }
function lockMarks(btns, rightBtn, pickedBtn){
  btns.forEach(b => {
    b.disabled = true; b.classList.remove("sel");
    if (b === rightBtn) { b.classList.add("right"); b.insertAdjacentHTML("beforeend", tick(true)); }
    else if (b === pickedBtn) { b.classList.add("wrong"); b.insertAdjacentHTML("beforeend", tick(false)); }
  });
}
/* A follow-up multiple choice (the fix, or the reason): shuffled options keyed by letters or digits. */
function subChoice(sub, keyOf, label){
  const opts = shuffle(sub.opts);
  const html = `<div class="opts sub" role="group" aria-label="${esc(label)}">${opts.map((o, i) => optBtn(`data-s="${i}"`, keyOf(i), fmt(o))).join("")}</div>`;
  return { opts, html };
}

/* ---------- bug: tap the line, then the fix ---------- */
function mountBug(root, q, api){
  const src = q.code.split("\n");
  const fix = q.fix ? subChoice(q.fix, i => LETTERS[i], "Fixes") : null;
  root.innerHTML = `<div class="codelines" role="group" aria-label="Code. Tap the line with the bug">${src.map((ln, i) => ln.trim()
      ? `<button class="cl" data-l="${i + 1}" aria-pressed="false" aria-label="Line ${i + 1}: ${esc(ln.trim())}"><span class="ln" aria-hidden="true">${i + 1}</span><code>${esc(ln)}</code></button>`
      : `<div class="cl blank" aria-hidden="true"><span class="ln">${i + 1}</span><code> </code></div>`).join("")}</div>
    ${fix ? `<p class="sub-h">Then pick the fix</p>${fix.html}` : ""}`;
  const lineBtns = [...root.querySelectorAll("[data-l]")], fixBtns = [...root.querySelectorAll("[data-s]")];
  let line = 0, pick = -1, done = false;
  const ready = () => api.ready(line > 0 && (!fix || pick >= 0));
  function pickLine(n){ if (done) return; line = n; press(lineBtns, lineBtns.find(b => +b.dataset.l === n)); ready(); }
  function pickFix(i){ if (done || !fix) return; pick = i; press(fixBtns, fixBtns[i]); ready(); }
  lineBtns.forEach(b => b.onclick = () => pickLine(+b.dataset.l));
  fixBtns.forEach((b, i) => b.onclick = () => pickFix(i));
  return {
    check(){
      if (done || !line || (fix && pick < 0)) return;
      done = true;
      const chosen = fix ? fix.opts[pick] : null, right = L.checkBug(q, line, chosen);
      lockMarks(lineBtns, lineBtns.find(b => +b.dataset.l === q.line), lineBtns.find(b => +b.dataset.l === line));
      if (fix) lockMarks(fixBtns, fixBtns[fix.opts.indexOf(q.fix.ok)], fixBtns[pick]);
      api.answer(right);
    },
    key(e){
      if (done) return false;
      const d = digit(e), l = letter(e);
      if (d >= 0 && src[d] !== undefined && src[d].trim()) { pickLine(d + 1); return true; }
      if (fix && l >= 0 && l < fixBtns.length) { pickFix(l); return true; }
      return false;
    }
  };
}

/* ---------- blanks: a native select in each gap of the code ---------- */
function mountBlanks(root, q, api){
  const orders = q.blanks.map(b => shuffle(b.map((_, i) => i)));
  let html = esc(q.code);
  q.blanks.forEach((b, i) => {
    const sel = `<select class="bsel" data-b="${i}" aria-label="Blank ${i + 1} of ${q.blanks.length}"><option value="" selected disabled>blank ${i + 1}</option>${
      orders[i].map(oi => `<option value="${oi}">${esc(b[oi])}</option>`).join("")}</select>`;
    html = html.replace(`{${i}}`, `<span class="bslot" data-slot="${i}">${sel}</span>`);
  });
  root.innerHTML = `<pre class="qcode blanks"><code>${html}</code></pre><p class="hint">Pick an option for each blank.</p>`;
  const sels = [...root.querySelectorAll("select")];
  let done = false;
  sels.forEach(s => { s.onchange = () => api.ready(sels.every(x => x.value !== "")); });
  return {
    check(){
      if (done || !sels.every(x => x.value !== "")) return;
      done = true;
      const picks = sels.map((s, i) => q.blanks[i][+s.value]), marks = L.blankMarks(q, picks);
      sels.forEach((s, i) => {
        const slot = s.parentNode;
        slot.className = `bslot done ${marks[i] ? "right" : "wrong"}`;
        slot.innerHTML = marks[i] ? `${esc(picks[i])}${tick(true)}`
          : `<s>${esc(picks[i])}</s>${tick(false)} <b>${esc(q.blanks[i][0])}</b>`;
      });
      api.answer(marks.every(Boolean));
    },
    key(){ return false; }
  };
}

/* ---------- bigo: time and space on a ladder ---------- */
function mountBigO(root, q, api){
  const group = (name, keyOf, which) => `<p class="sub-h" id="${name}${q.id}">${which}</p>
    <div class="chipset mono" role="radiogroup" aria-labelledby="${name}${q.id}">${q.ladder.map((c, i) => chip(`data-${name}="${i}"`, keyOf(i), esc(c), `${which}: ${c}`)).join("")}</div>`;
  root.innerHTML = group("t", i => i + 1, "Time") + (q.space ? group("s", i => LETTERS[i], "Extra space") : "");
  const tb = [...root.querySelectorAll("[data-t]")], sb = [...root.querySelectorAll("[data-s]")];
  let t = -1, s = -1, done = false;
  const ready = () => api.ready(t >= 0 && (!q.space || s >= 0));
  const pickT = i => { if (done) return; t = i; check1(tb, tb[i]); ready(); };
  const pickS = i => { if (done) return; s = i; check1(sb, sb[i]); ready(); };
  tb.forEach((b, i) => b.onclick = () => pickT(i));
  sb.forEach((b, i) => b.onclick = () => pickS(i));
  return {
    check(){
      if (done || t < 0 || (q.space && s < 0)) return;
      done = true;
      const right = L.checkBigO(q, q.ladder[t], s >= 0 ? q.ladder[s] : null);
      lockMarks(tb, tb[q.ladder.indexOf(q.time)], tb[t]);
      if (q.space) lockMarks(sb, sb[q.ladder.indexOf(q.space)], sb[s]);
      api.answer(right);
    },
    key(e){
      if (done) return false;
      const d = digit(e), l = letter(e);
      if (d >= 0 && d < tb.length) { pickT(d); return true; }
      if (q.space && l >= 0 && l < sb.length) { pickS(l); return true; }
      return false;
    }
  };
}

/* ---------- dims: tap chips into the slots of a shape tuple ---------- */
function mountDims(root, q, api){
  const n = q.answer.length, chips = shuffle(q.chips);
  let seq = [], marks = null;
  function draw(){
    const slots = Array.from({ length: n }, (_, i) => {
      if (marks) return `<span class="dslot ${marks[i] ? "right" : "wrong"}">${esc(seq[i])}${tick(marks[i])}</span>`;
      return seq[i] !== undefined
        ? `<button class="dslot filled" data-pos="${i}" aria-label="Dimension ${i + 1}: ${esc(seq[i])}. Tap to remove">${esc(seq[i])}</button>`
        : `<span class="dslot empty" aria-label="Dimension ${i + 1}: empty"${i === seq.length ? ' aria-current="true"' : ""}>${i === seq.length ? "?" : "&nbsp;"}</span>`;
    });
    root.innerHTML = `<div class="tuple" aria-label="Your shape, ${seq.length} of ${n} dimensions filled"><span class="paren" aria-hidden="true">(</span>${
      slots.join(`<span class="comma" aria-hidden="true">,</span>`)}<span class="paren" aria-hidden="true">)</span></div>
      ${marks ? "" : `<div class="chipset mono" role="group" aria-label="Pieces (each can be used more than once)">${
        chips.map((c, i) => `<button class="chipb" data-c="${i}"${seq.length >= n ? " disabled" : ""}><span class="k" aria-hidden="true">${i + 1}</span><span>${esc(c)}</span></button>`).join("")}</div>
      <p class="hint">Tap pieces in order. Tap a filled slot or press Backspace to take one out.</p>`}`;
    root.querySelectorAll("[data-pos]").forEach(b => b.onclick = () => remove(+b.dataset.pos));
    root.querySelectorAll("[data-c]").forEach(b => b.onclick = () => add(chips[+b.dataset.c], b));
    api.ready(!marks && seq.length === n);
  }
  const refocus = sel => { const f = root.querySelector(sel); if (f) f.focus({ preventScroll: true }); };
  function add(c, from){
    if (marks || seq.length >= n) return;
    const had = from && root.contains(document.activeElement);
    const idx = from ? +from.dataset.c : -1;
    seq = [...seq, c]; draw();
    if (had) refocus(seq.length < n ? `[data-c="${idx}"]` : "[data-pos]");
  }
  function remove(pos){
    if (marks) return;
    const had = root.contains(document.activeElement);
    seq = seq.filter((_, i) => i !== pos); draw();
    if (had) refocus("[data-c]");
  }
  draw();
  return {
    check(){
      if (marks || seq.length !== n) return;
      marks = L.dimsMarks(q, seq); draw();
      api.answer(L.checkDims(q, seq));
    },
    key(e){
      if (marks) return false;
      if (e.key === "Backspace" && seq.length) { remove(seq.length - 1); return true; }
      const d = digit(e);
      if (d < 0 || d >= chips.length) return false;
      add(chips[d], null); return true;
    }
  };
}

/* ---------- bucket and tf: a list of cards, each with its own small set of choices ---------- */
/* cards: [{html, label}]; choices: [{text, key}]. mark(i) -> {ok, note} after checking. Keys pick a choice for
   the first card still unanswered, which is outlined. */
function mountCards(root, cards, choices, api, opts){
  const picks = cards.map(() => -1);
  let done = false;
  root.innerHTML = `${opts.head || ""}<ol class="cards">${cards.map((c, i) => `<li class="card" data-i="${i}">
      <div class="card-t" id="ct${opts.id}${i}">${c.html}</div>
      <div class="card-c" role="radiogroup" aria-labelledby="ct${opts.id}${i}">${choices.map((ch, j) =>
        chip(`data-i="${i}" data-j="${j}"`, ch.key, esc(ch.text), `${ch.text}`)).join("")}</div><div class="card-n"></div></li>`).join("")}</ol>`;
  const items = [...root.querySelectorAll(".card")];
  const btnsOf = i => [...items[i].querySelectorAll("[data-j]")];
  function cue(){ const next = picks.indexOf(-1); items.forEach((el, i) => el.classList.toggle("next", i === next && !done)); }
  function pick(i, j){
    if (done) return;
    picks[i] = j; check1(btnsOf(i), btnsOf(i)[j]);
    items[i].classList.add("answered"); cue();
    api.ready(picks.every(p => p >= 0));
  }
  root.querySelectorAll("[data-j]").forEach(b => b.onclick = () => pick(+b.dataset.i, +b.dataset.j));
  cue();
  return {
    picks,
    finish(markOf){
      done = true; cue();
      items.forEach((el, i) => {
        const m = markOf(i);
        const bs = btnsOf(i);
        lockMarks(bs, bs[m.right], bs[picks[i]]);
        el.classList.add(m.ok ? "right" : "wrong");
        if (m.note) el.querySelector(".card-n").innerHTML = m.note;
      });
    },
    key(e){
      if (done) return false;
      const next = picks.indexOf(-1);
      const j = opts.keyToChoice(e);
      if (next < 0 || j < 0 || j >= choices.length) return false;
      pick(next, j);
      const nb = items[Math.min(items.length - 1, next + 1)];
      if (nb) {
        if (nb.scrollIntoView) nb.scrollIntoView({ block: "nearest" });
        if (root.contains(document.activeElement)) { const f = nb.querySelector("[data-j]"); if (f) f.focus({ preventScroll: true }); }
      }
      return true;
    }
  };
}
function mountBucket(root, q, api){
  const order = shuffle(q.items.map((_, i) => i));
  const cards = order.map(oi => ({ html: fmt(q.items[oi][0]) }));
  const c = mountCards(root, cards, q.buckets.map((b, j) => ({ text: b, key: j + 1 })), api, { id: q.id,
    head: `<p class="hint">Sort each card. Keys 1-${q.buckets.length} sort the outlined card.</p>`, keyToChoice: digit });
  return {
    check(){
      if (c.picks.some(p => p < 0)) return;
      const picks = [];
      order.forEach((oi, k) => { picks[oi] = q.buckets[c.picks[k]]; });
      const marks = L.bucketMarks(q, picks);
      c.finish(k => {
        const oi = order[k], right = q.buckets.indexOf(q.items[oi][1]);
        return { ok: marks[oi], right };
      });
      api.answer(L.checkBucket(q, picks));
    },
    key: c.key
  };
}
function mountTF(root, q, api){
  const order = shuffle(q.cards.map((_, i) => i));
  const cards = order.map(oi => ({ html: fmt(q.cards[oi].s) }));
  const tfKey = e => { const k = String(e.key).toLowerCase(); return k === "t" || k === "1" ? 0 : k === "f" || k === "2" ? 1 : -1; };
  const need = Math.ceil(q.pass * q.cards.length - 1e-9);
  const c = mountCards(root, cards, [{ text: "True", key: "T" }, { text: "False", key: "F" }], api, { id: q.id,
    head: `<p class="hint">Get at least ${need} of ${q.cards.length} right. Keys T and F answer the outlined card.</p>`, keyToChoice: tfKey });
  return {
    check(){
      if (c.picks.some(p => p < 0)) return;
      const picks = [];
      order.forEach((oi, k) => { picks[oi] = c.picks[k] === 0; });
      const marks = L.tfMarks(q, picks);
      c.finish(k => {
        const card = q.cards[order[k]];
        return { ok: marks[order[k]], right: card.ok ? 0 : 1, note: card.why ? fmt(card.why) : "" };
      });
      api.answer(L.checkTF(q, picks));
    },
    key: c.key
  };
}

/* ---------- compare: A or B, then why ---------- */
function mountCompare(root, q, api){
  const side = (k, s) => `<section class="cmp-s" aria-label="Option ${k.toUpperCase()}${s.label ? ": " + esc(s.label) : ""}">
      <div class="cmp-h"><span class="k" aria-hidden="true">${k.toUpperCase()}</span>${s.label ? `<b>${fmt(s.label)}</b>` : ""}</div>
      ${s.code ? `<pre class="qcode"><code>${esc(s.code)}</code></pre>` : ""}${s.text ? `<p>${fmt(s.text)}</p>` : ""}</section>`;
  const reason = q.reason ? subChoice(q.reason, i => i + 1, "Reasons") : null;
  root.innerHTML = `<div class="cmp">${side("a", q.a)}${side("b", q.b)}</div>
    <p class="sub-h" id="cw${q.id}">Which is better?</p>
    <div class="chipset two" role="radiogroup" aria-labelledby="cw${q.id}">${chip('data-side="a"', "A", "A is better", "A is better")}${chip('data-side="b"', "B", "B is better", "B is better")}</div>
    ${reason ? `<p class="sub-h">Why?</p>${reason.html}` : ""}`;
  const sb = [...root.querySelectorAll("[data-side]")], rb = [...root.querySelectorAll("[data-s]")];
  let pickSide = "", pr = -1, done = false;
  const ready = () => api.ready(!!pickSide && (!reason || pr >= 0));
  const choose = s => { if (done) return; pickSide = s; check1(sb, sb.find(b => b.dataset.side === s)); ready(); };
  const because = i => { if (done || !reason) return; pr = i; press(rb, rb[i]); ready(); };
  sb.forEach(b => b.onclick = () => choose(b.dataset.side));
  rb.forEach((b, i) => b.onclick = () => because(i));
  return {
    check(){
      if (done || !pickSide || (reason && pr < 0)) return;
      done = true;
      const right = L.checkCompare(q, pickSide, reason ? reason.opts[pr] : null);
      lockMarks(sb, sb.find(b => b.dataset.side === q.answer), sb.find(b => b.dataset.side === pickSide));
      if (reason) lockMarks(rb, rb[reason.opts.indexOf(q.reason.ok)], rb[pr]);
      api.answer(right);
    },
    key(e){
      if (done) return false;
      const k = String(e.key).toLowerCase(), d = digit(e);
      if (k === "a" || k === "b") { choose(k); return true; }
      if (reason && d >= 0 && d < rb.length) { because(d); return true; }
      return false;
    }
  };
}

const ans = q => `Answer: ${lines(L.answerText(q))}`;
const marked = () => "The right answers are marked above.";
T.register("bug", { mount: mountBug, kicker: "Spot the bug", answerHTML: ans });
T.register("blanks", { mount: mountBlanks, kicker: "Complete the code", answerHTML: ans });
T.register("bigo", { mount: mountBigO, kicker: "How fast, how big?", answerHTML: ans });
T.register("dims", { mount: mountDims, kicker: "Build the shape", answerHTML: ans });
T.register("bucket", { mount: mountBucket, kicker: "Sort into groups", answerHTML: marked });
T.register("tf", { mount: mountTF, kicker: "True or false?", answerHTML: q => `${marked()} You need ${Math.ceil(q.pass * q.cards.length - 1e-9)} of ${q.cards.length}.` });
T.register("compare", { mount: mountCompare, kicker: "Compare two options", answerHTML: ans });
})();
