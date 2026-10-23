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
  "Deep Dive: Regularization": ["Architectures"],
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
  "Transformers & LLMs": ["RNNs & Sequence Models"],
  "Deep Dive: Attention & Transformers": ["Transformers & LLMs"],
  "Deep Dive: Embeddings & Contrastive": ["Transformers & LLMs"],
  "Deep Dive: LLM Systems & Efficiency": ["Deep Dive: Attention & Transformers"],
  "Retrieval-Augmented Generation": ["Transformers & LLMs"],
  "Deep Dive: RAG Evaluation": ["Retrieval-Augmented Generation"],
  "AI Agents": ["Transformers & LLMs"],
  "Deep Dive: Agents in Practice": ["AI Agents"],
  "Fine-tuning in Practice": ["Transformers & LLMs"],
  "Deep Dive: Post-training LLMs": ["Fine-tuning in Practice", "Reinforcement Learning"],
  "Practical ML Engineering": ["Transformers & LLMs"],
  // coding
  "Coding Foundations": ["Python Refresher"],
  "Search and Linked Structures": ["Coding Foundations"],
  "Graphs and Backtracking": ["Search and Linked Structures"],
  "DP, Greedy and Intervals": ["Search and Linked Structures"],
  // system design
  "System Design": [],
  "Interview Craft & Estimation": ["System Design"],
  "Scaling the Request Path": ["System Design"],
  "Storage, Partitioning & Consistency": ["System Design"],
  "Async Messaging & Data Processing": ["System Design"],
  "ML System Design": ["System Design", "Foundations"],
  "The ML Design Framework: Problem, Labels, Metrics": ["ML System Design"],
  "Data & Feature Platforms": ["The ML Design Framework: Problem, Labels, Metrics", "Async Messaging & Data Processing"],
  "Training Pipelines & Distributed Training": ["The ML Design Framework: Problem, Labels, Metrics"],
  "Model Serving, Optimization & Experimentation": ["The ML Design Framework: Problem, Labels, Metrics"],
  "Monitoring, Drift & Feedback Loops": ["Model Serving, Optimization & Experimentation"],
  "Recommendation, Search & Ads Case Studies": ["Data & Feature Platforms"],
  "Risk, Trust & Prediction Case Studies": ["The ML Design Framework: Problem, Labels, Metrics"],
  "RAG Systems End to End": ["System Design", "Retrieval-Augmented Generation"],
  "LLM App Quality, Cost & Safety": ["RAG Systems End to End"],
  "Agents & Tool-Use Systems": ["System Design", "AI Agents"],
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
    targets: ["Transformers & LLMs", "Deep Dive: Attention & Transformers", "Deep Dive: Embeddings & Contrastive"] },
  { id: "rag", subject: "ml", title: "RAG systems", blurb: "Retrieval, vector search and how to evaluate it.",
    targets: ["Retrieval-Augmented Generation", "Deep Dive: RAG Evaluation"] },
  { id: "agents", subject: "ml", title: "AI agents", blurb: "Tool calling, ReAct, memory, agent evals.",
    targets: ["AI Agents", "Deep Dive: Agents in Practice"] },
  { id: "finetune", subject: "ml", title: "LLM fine-tuning", blurb: "LoRA, SFT, RLHF, DPO and HuggingFace.",
    targets: ["Fine-tuning in Practice", "Deep Dive: Post-training LLMs", "Practical ML Engineering"] },
  { id: "llm-efficiency", subject: "ml", title: "LLM efficiency", blurb: "Scaling laws, KV cache, quantization.",
    targets: ["Deep Dive: LLM Systems & Efficiency"] },
  { id: "classical", subject: "ml", title: "Classical ML", blurb: "Trees, boosting, SVMs, clustering, metrics.",
    targets: ["Classical ML Algorithms", "Deep Dive: Regularization", "Deep Dive: Evaluation Metrics"] },
  { id: "probstats", subject: "ml", title: "Probability & stats for ML", blurb: "Distributions, MLE, A/B tests, entropy.",
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
    targets: ["System Design", "Storage, Partitioning & Consistency", "Async Messaging & Data Processing"] },
  { id: "sd-round", subject: "sd", title: "Pass the system design round", blurb: "The full interview, from estimates to trade-offs.",
    targets: ["System Design", "Interview Craft & Estimation", "Scaling the Request Path", "Storage, Partitioning & Consistency", "Async Messaging & Data Processing"] },
  { id: "mlsd-round", subject: "sd", title: "Pass the ML system design round", blurb: "Framework, features, serving, case studies.",
    targets: ["ML System Design", "The ML Design Framework: Problem, Labels, Metrics", "Data & Feature Platforms",
      "Model Serving, Optimization & Experimentation", "Monitoring, Drift & Feedback Loops",
      "Recommendation, Search & Ads Case Studies", "Risk, Trust & Prediction Case Studies"] },
  { id: "llm-systems", subject: "sd", title: "LLM systems design", blurb: "RAG, agents and LLM serving at scale.",
    targets: ["RAG Systems End to End", "LLM App Quality, Cost & Safety", "Agents & Tool-Use Systems", "LLM Serving Infrastructure"] },
  { id: "dist-training", subject: "sd", title: "Distributed training", blurb: "Data, tensor and pipeline parallelism.",
    targets: ["Training Pipelines & Distributed Training", "Deep Dive: LLM Systems & Efficiency"] },
  { id: ALL_GOAL, subject: "all", title: "Full MLE interview prep", blurb: "Every unit: ML, coding and system design.",
    targets: Object.keys(PREREQS) }
];
const GOAL_BY_ID = Object.fromEntries(GOALS.map(g => [g.id, g]));

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const goalById = id => GOAL_BY_ID[id] || null;

/* Units whose title appears in `titles`, keyed by title (first unit with a title wins). */
function byTitle(units) {
  const m = new Map();
  (units || []).forEach(u => { if (u && typeof u.title === "string" && !m.has(u.title)) m.set(u.title, u); });
  return m;
}

/* Every title `titles` needs, transitively (including themselves), restricted to units that exist. */
function closure(titles, units, prereqs = PREREQS) {
  const have = byTitle(units), out = new Set();
  const visit = t => {
    if (out.has(t) || !have.has(t)) return;
    out.add(t);
    (prereqs[t] || []).forEach(visit);
  };
  titles.forEach(visit);
  return out;
}

/* Topological order of a set of titles (prerequisites first). Among units that are ready at the same time,
   the one shown earlier in the app (display position `pos`, then index) goes first, so the order is stable.
   Throws on a cycle. */
function topoOrder(set, units, prereqs = PREREQS) {
  const have = byTitle(units);
  const rank = t => { const u = have.get(t); return [u.pos ?? u.ui, u.ui]; };
  const cmp = (a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1]; };
  const need = new Map([...set].map(t => [t, (prereqs[t] || []).filter(p => set.has(p))]));
  const out = [], placed = new Set();
  while (out.length < set.size) {
    const ready = [...need.keys()].filter(t => !placed.has(t) && need.get(t).every(p => placed.has(p))).sort(cmp);
    if (!ready.length) throw new Error("Prerequisite cycle among: " + [...need.keys()].filter(t => !placed.has(t)).join(", "));
    out.push(ready[0]); placed.add(ready[0]);
  }
  return out;
}

/* The ordered path for a set of goal ids.
   opts: known (unit titles the learner already knows), skipKnown (default true: leave them out of `included`),
   done (lesson id -> true, for `remaining`), secs (seconds per lesson, for `minutes`).
   -> { goals, steps: [{ ui, title, lessons, left, target, known }] in path order (known ones included and
        flagged), included: [ui] (the units to study, in order), lessons, remaining, minutes } */
function pathFor(units, goalIds, opts = {}) {
  const goals = [...new Set(goalIds || [])].map(goalById).filter(Boolean);
  const targets = new Set(goals.flatMap(g => g.targets));
  const order = topoOrder(closure([...targets], units), units);
  const have = byTitle(units);
  const known = new Set(Array.isArray(opts.known) ? opts.known : []);
  const skipKnown = opts.skipKnown !== false;
  const done = isObj(opts.done) ? opts.done : {};
  const secs = Number.isFinite(opts.secs) && opts.secs > 0 ? opts.secs : DEFAULT_SECS;
  const steps = order.map(t => {
    const u = have.get(t);
    return { ui: u.ui, title: t, lessons: u.lessons.length, left: u.lessons.filter(l => !done[l.id]).length,
      target: targets.has(t), known: known.has(t) };
  });
  const study = steps.filter(s => !(skipKnown && s.known));
  const lessons = study.reduce((a, s) => a + s.lessons, 0);
  const remaining = study.reduce((a, s) => a + s.left, 0);
  return { goals: goals.map(g => g.id), steps, included: study.map(s => s.ui), lessons, remaining,
    minutes: Math.round(remaining * secs / 60) };
}

/* A saved focus { goals, known, updatedAt }, cleaned: known goal ids only (at most MAX_GOALS, no repeats),
   known unit titles that exist (when units are given), bounded lengths. An empty goals list is a valid
   focus: it means "no focus, and don't ask again". Anything else becomes null. */
function cleanFocus(raw, units) {
  if (!isObj(raw)) return null;
  const titles = units ? byTitle(units) : null;
  const goals = [...new Set((Array.isArray(raw.goals) ? raw.goals : []).filter(g => typeof g === "string" && GOAL_BY_ID[g]))].slice(0, MAX_GOALS);
  const known = [...new Set((Array.isArray(raw.known) ? raw.known : [])
    .filter(t => typeof t === "string" && t.length <= MAX_TITLE && (!titles || titles.has(t))))].slice(0, MAX_KNOWN);
  const updatedAt = Number.isFinite(raw.updatedAt) && raw.updatedAt > 0 ? raw.updatedAt : 0;
  return { goals, known, updatedAt };
}
function isActive(focus) { return isObj(focus) && Array.isArray(focus.goals) && focus.goals.some(g => GOAL_BY_ID[g]); }

/* Unit indices to study for a focus, in path order, or null without an active focus. Safe on raw synced data. */
function focusOrder(units, focus) {
  const f = cleanFocus(focus, units);
  if (!isActive(f)) return null;
  try { return pathFor(units, f.goals, { known: f.known }).included; } catch (e) { return null; }
}
/* The complement of focusOrder, as a plan skip list (sorted unit indices), or null without a focus. */
function focusSkip(units, focus) {
  const order = focusOrder(units, focus);
  if (!order) return null;
  const inPath = new Set(order);
  return units.map((u, ui) => ui).filter(ui => !inPath.has(ui));
}
/* A new focus. Returns a new object. */
function makeFocus(goals, known, now) { return cleanFocus({ goals, known, updatedAt: now }) || { goals: [], known: [], updatedAt: now }; }
function goalsLabel(focus) {
  const f = isObj(focus) && Array.isArray(focus.goals) ? focus.goals : [];
  return f.map(goalById).filter(Boolean).map(g => g.title).join(" + ");
}

const Paths = { MAX_GOALS, MAX_KNOWN, ALL_GOAL, PREREQS, GROUPS, GOALS, goalById, closure, topoOrder, pathFor, cleanFocus, isActive,
  focusOrder, focusSkip, makeFocus, goalsLabel };
if (typeof module !== "undefined" && module.exports) module.exports = Paths; else root.Paths = Paths;
})(typeof window !== "undefined" ? window : globalThis);
