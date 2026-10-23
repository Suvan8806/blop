/* Goal-based learning paths: which units each unit builds on, the goals a learner can pick, and the
   ordered path (targets plus every prerequisite) for a set of goals. Units are named by title, which never
   changes, rather than by index. Pure functions, no DOM, tested in node. core.js and the reminder cron
   (api/_lib/push-core.js) both use focusOrder(), so the plan and the reminder agree on what's in a path. */
(function (root) {
const MAX_GOALS = 3;
const MAX_KNOWN = 100;
const MAX_TITLE = 120;
const DEFAULT_SECS = 120;

/* Unit title -> titles of the units it builds on. Every unit is listed, even with no prerequisites. */
const PREREQS = {
  // ML basics
  "Start Here": [],
  "Python Refresher": ["Start Here"],
  "Math Primer": ["Start Here"],
  "Foundations": ["Python Refresher", "Math Primer"],
  "Deep Dive: Probability & Stats": ["Foundations"],
  "Deep Dive: Information Theory": ["Deep Dive: Probability & Stats"],
  "Deep Dive: Backprop": ["Architectures"],
  "Deep Dive: Optimizers": ["Architectures"],
  "Deep Dive: Regularization": ["Foundations"],
  "Deep Dive: Evaluation Metrics": ["Foundations"],
  "Classical ML Algorithms": ["Foundations"],
  "Responsible ML": ["Foundations"],
  "MLOps": ["Foundations"],
  "Deep Dive: Leakage & Skew": ["MLOps"],
  "Reinforcement Learning": ["Foundations"],
  "Deep Dive: RL Foundations": ["Reinforcement Learning"],
  // neural networks
  "Architectures": ["Foundations"],
  "Deep Dive: CNN Internals": ["Architectures"],
  "RNNs & Sequence Models": ["Architectures"],
  "Generative & Frontier": ["Architectures"],
  "Transformers & LLMs": ["Architectures"],
  "Deep Dive: Attention & Transformers": ["Transformers & LLMs"],
  "Deep Dive: Embeddings & Contrastive": ["Transformers & LLMs"],
  "Deep Dive: LLM Systems & Efficiency": ["Deep Dive: Attention & Transformers", "Deep Dive: Optimizers"],
  "Retrieval-Augmented Generation": ["Transformers & LLMs", "Deep Dive: Embeddings & Contrastive"],
  "Deep Dive: RAG Evaluation": ["Retrieval-Augmented Generation"],
  "AI Agents": ["Transformers & LLMs", "Retrieval-Augmented Generation"],
  "Deep Dive: Agents in Practice": ["AI Agents"],
  "Fine-tuning in Practice": ["Transformers & LLMs"],
  "Deep Dive: Post-training LLMs": ["Fine-tuning in Practice", "Reinforcement Learning", "Deep Dive: Information Theory"],
  "Practical ML Engineering": ["Fine-tuning in Practice"],
  // coding
  "Coding Foundations": ["Python Refresher"],
  "Search and Linked Structures": ["Coding Foundations"],
  "Graphs and Backtracking": ["Search and Linked Structures"],
  "DP, Greedy and Intervals": ["Graphs and Backtracking"],
  // system design
  "System Design": [],
  "Interview Craft & Estimation": ["System Design"],
  "Scaling the Request Path": ["System Design"],
  "Storage, Partitioning & Consistency": ["System Design"],
  "Async Messaging & Data Processing": ["System Design"],
  "ML System Design": ["Foundations"],
  "The ML Design Framework: Problem, Labels, Metrics": ["ML System Design", "Deep Dive: Evaluation Metrics", "Classical ML Algorithms"],
  "Data & Feature Platforms": ["The ML Design Framework: Problem, Labels, Metrics", "Async Messaging & Data Processing"],
  "Training Pipelines & Distributed Training": ["Deep Dive: Optimizers", "MLOps"],
  "Model Serving, Optimization & Experimentation": ["The ML Design Framework: Problem, Labels, Metrics", "Deep Dive: Probability & Stats"],
  "Monitoring, Drift & Feedback Loops": ["Model Serving, Optimization & Experimentation"],
  "Recommendation, Search & Ads Case Studies": ["Data & Feature Platforms"],
  "Risk, Trust & Prediction Case Studies": ["The ML Design Framework: Problem, Labels, Metrics"],
  "RAG Systems End to End": ["Retrieval-Augmented Generation"],
  "LLM App Quality, Cost & Safety": ["RAG Systems End to End", "Fine-tuning in Practice"],
  "Agents & Tool-Use Systems": ["AI Agents"],
  "LLM Serving Infrastructure": ["System Design", "Transformers & LLMs"],
  "Privacy, Fairness & Responsible AI in Design": ["ML System Design", "Responsible ML"]
};

/* Goal groups, in the order the picker shows them. */
const GROUPS = [["ml", "Machine learning"], ["code", "Coding"], ["sd", "System design"], ["all", "Everything"]];
const ALL_GOAL = "all";
/* targets: the units the goal is about. Their prerequisites are added by pathFor. */
const GOALS = [
  { id: "nn", subject: "ml", title: "Neural network basics", blurb: "Perceptrons to backprop, with optimizers.",
    targets: ["Architectures", "Deep Dive: Backprop", "Deep Dive: Optimizers"] },
  { id: "cnn", subject: "ml", title: "CNNs & computer vision", blurb: "Convolutions, pooling, receptive fields, ResNets.",
    targets: ["Architectures", "Deep Dive: CNN Internals"] },
  { id: "transformers", subject: "ml", title: "Transformers & LLMs", blurb: "Attention, transformer blocks, embeddings.",
    targets: ["RNNs & Sequence Models", "Transformers & LLMs", "Deep Dive: Attention & Transformers", "Deep Dive: Embeddings & Contrastive"] },
  { id: "rag", subject: "ml", title: "RAG systems", blurb: "Retrieval, vector search and how to evaluate it.",
    targets: ["Retrieval-Augmented Generation", "Deep Dive: RAG Evaluation", "RAG Systems End to End"] },
  { id: "agents", subject: "ml", title: "AI agents", blurb: "Tool calling, ReAct, memory, agent evals.",
    targets: ["AI Agents", "Deep Dive: Agents in Practice", "Agents & Tool-Use Systems"] },
  { id: "finetune", subject: "ml", title: "LLM fine-tuning", blurb: "LoRA, SFT, RLHF, DPO and HuggingFace.",
    targets: ["Fine-tuning in Practice", "Deep Dive: Post-training LLMs", "Practical ML Engineering"] },
  { id: "llm-efficiency", subject: "ml", deepGoal: true, title: "LLM efficiency", blurb: "Scaling laws, KV cache, quantization.",
    targets: ["Deep Dive: LLM Systems & Efficiency"] },
  { id: "classical", subject: "ml", title: "Classical ML", blurb: "Trees, boosting, SVMs, clustering, metrics.",
    targets: ["Classical ML Algorithms", "Deep Dive: Regularization", "Deep Dive: Evaluation Metrics"] },
  { id: "probstats", subject: "ml", deepGoal: true, title: "Probability & stats for ML", blurb: "Distributions, MLE, A/B tests, entropy.",
    targets: ["Deep Dive: Probability & Stats", "Deep Dive: Information Theory"] },
  { id: "rl", subject: "ml", title: "Reinforcement learning", blurb: "MDPs, Q-learning, policy gradients.",
    targets: ["Reinforcement Learning", "Deep Dive: RL Foundations"] },
  { id: "generative", subject: "ml", title: "Generative models", blurb: "VAEs, GANs and diffusion.",
    targets: ["Generative & Frontier"] },
  { id: "mlops", subject: "ml", title: "MLOps", blurb: "Shipping, monitoring and leakage.",
    targets: ["MLOps", "Deep Dive: Leakage & Skew"] },
  { id: "responsible", subject: "ml", title: "Responsible AI", blurb: "Bias, fairness, privacy and safety.",
    targets: ["Responsible ML", "Privacy, Fairness & Responsible AI in Design"] },
  { id: "leetcode", subject: "code", title: "LeetCode patterns: arrays → graphs", blurb: "Hashing, pointers, trees, graphs.",
    targets: ["Coding Foundations", "Search and Linked Structures", "Graphs and Backtracking"] },
  { id: "dp", subject: "code", title: "Dynamic programming", blurb: "1-D and 2-D DP, greedy, intervals.",
    targets: ["DP, Greedy and Intervals"] },
  { id: "distsys", subject: "sd", title: "Distributed systems basics", blurb: "Scaling, storage, queues, consistency.",
    targets: ["System Design", "Scaling the Request Path", "Storage, Partitioning & Consistency", "Async Messaging & Data Processing"] },
  { id: "sd-round", subject: "sd", title: "Pass the system design round", blurb: "The full interview, from estimates to trade-offs.",
    targets: ["System Design", "Interview Craft & Estimation", "Scaling the Request Path", "Storage, Partitioning & Consistency", "Async Messaging & Data Processing"] },
  { id: "mlsd-round", subject: "sd", title: "Pass the ML system design round", blurb: "Framework, features, serving, case studies.",
    targets: ["ML System Design", "The ML Design Framework: Problem, Labels, Metrics", "Data & Feature Platforms",
      "Model Serving, Optimization & Experimentation", "Monitoring, Drift & Feedback Loops",
      "Recommendation, Search & Ads Case Studies", "Risk, Trust & Prediction Case Studies"] },
  { id: "llm-systems", subject: "sd", title: "LLM systems design", blurb: "RAG, agents and LLM serving at scale.",
    targets: ["Interview Craft & Estimation", "RAG Systems End to End", "LLM App Quality, Cost & Safety", "Agents & Tool-Use Systems", "LLM Serving Infrastructure"] },
  { id: "dist-training", subject: "sd", title: "Distributed training", blurb: "Data, tensor and pipeline parallelism.",
    targets: ["Training Pipelines & Distributed Training", "Deep Dive: LLM Systems & Efficiency"] },
  { id: "essentials", subject: "all", title: "The essentials", blurb: "A bit of ML, coding and system design.",
    targets: ["Foundations", "Coding Foundations", "System Design"] },
  { id: ALL_GOAL, subject: "all", title: "Everything", blurb: "Every core unit: ML, coding and system design.",
    targets: Object.keys(PREREQS) }
];
const GOAL_BY_ID = Object.fromEntries(GOALS.map(g => [g.id, g]));

/* The picker's first screen: what the learner is preparing for. preset: the goals picked for them; topics: what
   "Edit topics" offers. DEEP_TOPICS (goals about deep-dive units only) and "Everything" are offered on every track. */
const TRACKS = [
  { id: "ml", title: "ML engineer", blurb: "ML fundamentals, neural nets, ML system design",
    preset: ["classical", "nn"], topics: ["classical", "nn", "cnn", "mlops", "mlsd-round", "rl", "generative", "responsible"] },
  { id: "llm", title: "AI / LLM engineer", blurb: "Transformers, RAG, agents, fine-tuning",
    preset: ["transformers", "rag"], topics: ["transformers", "rag", "agents", "finetune", "llm-systems", "dist-training"] },
  { id: "code", title: "Coding interviews", blurb: "LeetCode patterns in Python", preset: ["leetcode"], topics: ["leetcode", "dp"] },
  { id: "sd", title: "System design", blurb: "The system design round, start to finish",
    preset: ["sd-round"], topics: ["sd-round", "distsys", "mlsd-round", "llm-systems"] },
  { id: "essentials", title: "Not sure? Start with the essentials", label: "The essentials", blurb: "A bit of ML, coding and system design",
    preset: ["essentials"], topics: [] }
];
const TRACK_BY_ID = Object.fromEntries(TRACKS.map(t => [t.id, t]));
const DEEP_TOPICS = ["probstats", "llm-efficiency"];
/* "Already know some of this? Skip it": chip label -> the basics unit it skips. Shown only for units on the path. */
const BASICS_CHIPS = [["Python", "Python Refresher"], ["Math basics", "Math Primer"], ["ML basics", "Foundations"],
  ["Coding basics", "Coding Foundations"], ["System design basics", "System Design"]];
const MAX_CHIPS = 3;

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const goalById = id => GOAL_BY_ID[id] || null;
const trackById = id => TRACK_BY_ID[id] || null;
/* Deep-dive units go further than most interviews ask. They're optional: a path holds them only with Go deeper on. */
const DEEP_PREFIX = "Deep Dive: ";
const isDeep = title => typeof title === "string" && title.startsWith(DEEP_PREFIX);
const shortTitle = title => (isDeep(title) ? title.slice(DEEP_PREFIX.length) : String(title || ""));

/* Units whose title appears in `titles`, keyed by title (first unit with a title wins). */
function byTitle(units) {
  const m = new Map();
  (units || []).forEach(u => { if (u && typeof u.title === "string" && !m.has(u.title)) m.set(u.title, u); });
  return m;
}

/* Every title `titles` needs, transitively (including themselves), restricted to units that exist.
   keep (optional): which titles may join the set. A title it rejects is left out, but what it builds on is still
   walked, so skipping a deep dive keeps the core units under it. */
function closure(titles, units, prereqs = PREREQS, keep = () => true) {
  const have = byTitle(units), out = new Set(), seen = new Set();
  const visit = t => {
    if (seen.has(t) || !have.has(t)) return;
    seen.add(t);
    if (keep(t)) out.add(t);
    (prereqs[t] || []).forEach(visit);
  };
  titles.forEach(visit);
  return out;
}
/* A function giving everything a title builds on, transitively (memoised). */
function ancestorsOf(prereqs) {
  const memo = new Map();
  const of = t => {
    if (memo.has(t)) return memo.get(t);
    const out = new Set();
    memo.set(t, out);
    (prereqs[t] || []).forEach(p => { out.add(p); of(p).forEach(x => out.add(x)); });
    return out;
  };
  return of;
}

/* Topological order of a set of titles (prerequisites first). Among units that are ready at the same time,
   the one shown earlier in the app (display position `pos`, then index) goes first, so the order is stable.
   Prerequisites are followed through units outside the set, so leaving a unit out never loses an ordering.
   Throws on a cycle. */
function topoOrder(set, units, prereqs = PREREQS) {
  const have = byTitle(units);
  const rank = t => { const u = have.get(t); return [u.pos ?? u.ui, u.ui]; };
  const cmp = (a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1]; };
  const anc = ancestorsOf(prereqs);
  const need = new Map([...set].map(t => [t, [...anc(t)].filter(p => set.has(p) && p !== t)]));
  const out = [], placed = new Set();
  while (out.length < set.size) {
    const ready = [...need.keys()].filter(t => !placed.has(t) && need.get(t).every(p => placed.has(p))).sort(cmp);
    if (!ready.length) throw new Error("Prerequisite cycle among: " + [...need.keys()].filter(t => !placed.has(t)).join(", "));
    out.push(ready[0]); placed.add(ready[0]);
  }
  return out;
}

/* The units a set of goals needs. deep: true keeps deep dives (targets and prerequisites alike); false leaves
   them out, except the targets of a deepGoal goal (whose whole point is a deep dive) and what those need. */
function pathSet(units, goals, deep) {
  const all = goals.flatMap(g => g.targets);
  if (deep) return closure(all, units);
  const own = closure(goals.filter(g => g.deepGoal).flatMap(g => g.targets), units);
  const core = closure(all.filter(t => !isDeep(t)), units, PREREQS, t => !isDeep(t));
  return new Set([...core, ...own]);
}

/* The ordered path for a set of goal ids.
   opts: deep (default true: deep dives included; false: core units only, see pathSet), known (unit titles the
   learner already knows), skipKnown (default true: leave them out of `included`), done (lesson id -> true, for
   `remaining`), secsOf (lesson -> estimated seconds, estimate.js; for `secs` and `minutes`), or secs (the same
   seconds for every lesson) without it.
   -> { goals, deep, steps: [{ ui, title, lessons, left, target, known, deep }] in path order (known ones included and
        flagged), included: [ui] (the units to study, in order), lessons, remaining, secs (left), minutes,
        deepExtra: [{ ui, title, lessons }] (the deep dives Go deeper adds to these goals, in path order) } */
function pathFor(units, goalIds, opts = {}) {
  const goals = [...new Set(goalIds || [])].map(goalById).filter(Boolean);
  const deep = opts.deep !== false;
  const targets = new Set(goals.flatMap(g => g.targets));
  const full = topoOrder(closure([...targets], units), units);
  const core = pathSet(units, goals, false);
  const order = deep ? full : full.filter(t => core.has(t));
  const have = byTitle(units);
  const known = new Set(Array.isArray(opts.known) ? opts.known : []);
  const skipKnown = opts.skipKnown !== false;
  const done = isObj(opts.done) ? opts.done : {};
  const flat = Number.isFinite(opts.secs) && opts.secs > 0 ? opts.secs : DEFAULT_SECS;
  const secsOf = typeof opts.secsOf === "function" ? opts.secsOf : () => flat;
  const steps = order.map(t => {
    const u = have.get(t);
    return { ui: u.ui, title: t, lessons: u.lessons.length, left: u.lessons.filter(l => !done[l.id]).length,
      target: targets.has(t), known: known.has(t), deep: isDeep(t) };
  });
  const study = steps.filter(s => !(skipKnown && s.known));
  const lessons = study.reduce((a, s) => a + s.lessons, 0);
  const remaining = study.reduce((a, s) => a + s.left, 0);
  const secs = study.reduce((a, s) => a + have.get(s.title).lessons.filter(l => !done[l.id]).reduce((b, l) => b + secsOf(l), 0), 0);
  const deepExtra = full.filter(t => !core.has(t) && !(skipKnown && known.has(t)))
    .map(t => { const u = have.get(t); return { ui: u.ui, title: t, lessons: u.lessons.length }; });
  return { goals: goals.map(g => g.id), deep, steps, included: study.map(s => s.ui), lessons, remaining, secs,
    minutes: Math.round(secs / 60), deepExtra };
}

/* Deep dives to offer next to a path: the ones on it (Go deeper on), the ones Go deeper would add, then any other
   deep dive whose prerequisites are all core units already on the path, in display order.
   -> [{ ui, title, lessons, added }] (added: on the path now) */
function relatedDeep(units, path) {
  const onPath = new Set(path.steps.map(s => s.title));
  const coreOnPath = new Set(path.steps.filter(s => !s.deep).map(s => s.title));
  const added = path.steps.filter(s => s.deep).map(s => ({ ui: s.ui, title: s.title, lessons: s.lessons, added: true }));
  const extra = (path.deepExtra || []).filter(x => !onPath.has(x.title)).map(x => ({ ...x, added: false }));
  const listed = new Set([...added, ...extra].map(x => x.title));
  const anc = ancestorsOf(PREREQS);
  const more = (units || []).filter(u => isDeep(u.title) && !listed.has(u.title) && [...anc(u.title)].every(t => coreOnPath.has(t)))
    .sort((a, b) => (a.pos ?? a.ui) - (b.pos ?? b.ui))
    .map(u => ({ ui: u.ui, title: u.title, lessons: u.lessons.length, added: false }));
  return [...added, ...extra, ...more];
}

/* Lessons a day for a time budget: minutes a day over the average seconds a lesson takes, at least 1. */
function perDayFor(minutes, secsPerLesson) {
  const secs = Number.isFinite(secsPerLesson) && secsPerLesson > 0 ? secsPerLesson : DEFAULT_SECS;
  return Math.max(1, Math.round((Number.isFinite(minutes) && minutes > 0 ? minutes : 10) * 60 / secs));
}
/* The path headline: { units, minutes, days } at perDay lessons a day (days: 0 when nothing is left). */
function summary(path, perDay) {
  const p = path || {};
  const per = Number.isFinite(perDay) && perDay > 0 ? perDay : 1;
  return { units: (p.included || []).length, minutes: p.minutes || 0, days: p.remaining ? Math.ceil(p.remaining / per) : 0 };
}
const half = n => { const r = Math.round(n * 2) / 2; return Number.isInteger(r) ? String(r) : `${Math.floor(r) || ""}½`; };
/* "~45 min", "~1 hour", "~2½ hours". */
function hoursText(minutes) {
  const m = Math.max(0, Math.round(minutes || 0));
  if (m < 55) return `~${Math.max(1, m)} min`;
  const h = half(m / 60);
  return `~${h} ${h === "1" ? "hour" : "hours"}`;
}
/* "5 days", "about 2½ weeks", "about 3 months". */
function durationText(days) {
  const d = Math.max(1, Math.round(days || 0));
  if (d < 14) return `${d} ${d === 1 ? "day" : "days"}`;
  if (d < 60) return `about ${half(d / 7)} weeks`;
  return `about ${Math.round(d / 30)} months`;
}

/* A saved focus { goals, known, deep, track, updatedAt }, cleaned: known goal ids only (at most MAX_GOALS, no
   repeats), known unit titles that exist (when units are given), bounded lengths. deep: a boolean; a focus saved
   before Go deeper existed has none and reads as true, so its path (and any plan over it) doesn't shrink. track: a
   TRACKS id or null. An empty goals list is a valid focus: "no focus, and don't ask again". Anything else is null. */
function cleanFocus(raw, units) {
  if (!isObj(raw)) return null;
  const titles = units ? byTitle(units) : null;
  const goals = [...new Set((Array.isArray(raw.goals) ? raw.goals : []).filter(g => typeof g === "string" && GOAL_BY_ID[g]))].slice(0, MAX_GOALS);
  const known = [...new Set((Array.isArray(raw.known) ? raw.known : [])
    .filter(t => typeof t === "string" && t.length <= MAX_TITLE && (!titles || titles.has(t))))].slice(0, MAX_KNOWN);
  const deep = typeof raw.deep === "boolean" ? raw.deep : true;
  const track = typeof raw.track === "string" && TRACK_BY_ID[raw.track] ? raw.track : null;
  const updatedAt = Number.isFinite(raw.updatedAt) && raw.updatedAt > 0 ? raw.updatedAt : 0;
  return { goals, known, deep, track, updatedAt };
}
function isActive(focus) { return isObj(focus) && Array.isArray(focus.goals) && focus.goals.some(g => GOAL_BY_ID[g]); }

/* Unit indices to study for a focus, in path order, or null without an active focus. Safe on raw synced data. */
function focusOrder(units, focus) {
  const f = cleanFocus(focus, units);
  if (!isActive(f)) return null;
  try { return pathFor(units, f.goals, { known: f.known, deep: f.deep }).included; } catch (e) { return null; }
}
/* The complement of focusOrder, as a plan skip list (sorted unit indices), or null without a focus. */
function focusSkip(units, focus) {
  const order = focusOrder(units, focus);
  if (!order) return null;
  const inPath = new Set(order);
  return units.map((u, ui) => ui).filter(ui => !inPath.has(ui));
}
/* A new focus. opts: { deep, track }; deep left out reads as true, as for an old saved focus. Returns a new object. */
function makeFocus(goals, known, now, opts = {}) {
  const o = isObj(opts) ? opts : {};
  return cleanFocus({ goals, known, deep: o.deep, track: o.track, updatedAt: now });
}
/* The same focus with some fields changed (goals, known, deep, track) and a new stamp. Returns a new object. */
function withFocus(focus, patch, now) {
  const f = cleanFocus(focus) || makeFocus([], [], now, { deep: false });
  const p = isObj(patch) ? patch : {};
  return makeFocus("goals" in p ? p.goals : f.goals, "known" in p ? p.known : f.known, now,
    { deep: "deep" in p ? p.deep : f.deep, track: "track" in p ? p.track : f.track });
}
function goalsLabel(focus) {
  const f = isObj(focus) && Array.isArray(focus.goals) ? focus.goals : [];
  return f.map(goalById).filter(Boolean).map(g => g.title).join(" + ");
}
/* What to call the learner's goal: the track they picked while its preset is unchanged, otherwise the goals. */
function focusLabel(focus) {
  const t = isObj(focus) ? trackById(focus.track) : null;
  const goals = isObj(focus) && Array.isArray(focus.goals) ? focus.goals : [];
  if (t && goals.length === t.preset.length && t.preset.every(g => goals.includes(g))) return t.label || t.title;
  return goalsLabel(focus);
}
/* The track a set of goals belongs to: the first whose preset and topics hold them all, else null. */
function trackFor(goalIds) {
  const g = (goalIds || []).filter(id => GOAL_BY_ID[id] && !DEEP_TOPICS.includes(id) && id !== ALL_GOAL);
  if (!g.length) return null;
  const t = TRACKS.find(x => g.every(id => x.preset.includes(id) || x.topics.includes(id)));
  return t ? t.id : null;
}
/* Skip chips for a path: the basics units on it, as [label, title], at most MAX_CHIPS. */
function basicsChips(path) {
  const on = new Set(((path && path.steps) || []).map(s => s.title));
  return BASICS_CHIPS.filter(([, t]) => on.has(t)).slice(0, MAX_CHIPS);
}

const Paths = { MAX_GOALS, MAX_KNOWN, ALL_GOAL, PREREQS, GROUPS, GOALS, TRACKS, DEEP_TOPICS, BASICS_CHIPS, MAX_CHIPS, goalById, trackById,
  isDeep, shortTitle, closure, topoOrder, pathFor, relatedDeep, perDayFor, summary, hoursText, durationText, cleanFocus, isActive,
  focusOrder, focusSkip, makeFocus, withFocus, goalsLabel, focusLabel, trackFor, basicsChips };
if (typeof module !== "undefined" && module.exports) module.exports = Paths; else root.Paths = Paths;
})(typeof window !== "undefined" ? window : globalThis);
