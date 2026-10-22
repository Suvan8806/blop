/* Extra questions for units that already shipped. Loaded after every content-*.js file.
   Questions are only ever appended to the END of a lesson's list, so existing ids (u{ui}l{li}q{n}) never move.
   Each entry names its unit and lesson title too, and is skipped if they don't match, so a mistake can't
   land a question in the wrong lesson. */
(function (C) {
const EXTRA = [
  [16, "How to Run the Interview", {type:"order", p:"Put the steps of a system design interview in order",
    items:["Clarify functional and non-functional requirements","Estimate scale","Define the API","Sketch the data model","Draw the high-level design","Deep-dive on bottlenecks and trade-offs"],
    why:"Requirements and numbers come first, because every later choice depends on them."}],
  [16, "Caching", {type:"gap", p:"With cache-aside, a cache miss means the app reads the ___ and then writes the result to the cache.",
    opts:["database","CDN","load balancer"], why:"The app owns the cache: it fills it only after a miss."}],
  [16, "SQL vs NoSQL", {type:"match", p:"Match each store to the job it fits best",
    pairs:[["Relational (Postgres)","Money transfers that need ACID transactions"],["Wide-column (Cassandra)","A huge, write-heavy stream of chat messages"],["Key-value (Redis)","Fast lookups by a single key"],["Graph","Friend-of-a-friend queries"]],
    why:"Pick the store whose data model matches how you read and write."}],
  [17, "A Framework for ML Design Rounds", {type:"order", p:"Put the ML design framework in order",
    items:["Clarify the goal and constraints","Define offline and online metrics","Plan data and labels","Choose features","Pick a simple model first","Plan serving and monitoring"],
    why:"Metrics and data decide what a good model even means, so they come before the model."}],
  [17, "Offline vs Online Metrics", {type:"match", p:"Match each metric to what it measures",
    pairs:[["AUC","Offline: how well held-out examples are ranked"],["Log loss","Offline: how well predicted probabilities are calibrated"],["Click-through rate","Online: share of impressions that get a click"],["Retention","Online: share of users who come back"]],
    why:"Offline metrics use held-out data; online metrics measure real users."}],
  [17, "Two-Stage Recommenders", {type:"gap", p:"Candidate generation narrows billions of items down to ___ for the ranking model.",
    opts:["a few hundred","a few billion","exactly one"], why:"Cheap retrieval first, so the heavy ranker only scores a short list."}],
  [5, "Gradient Boosting", ["Compared with a random forest, gradient boosting mainly reduces…", ["Bias", "Variance", "Training time"],
    "Each boosted tree corrects what the ensemble still gets wrong, which lowers bias. A forest averages many deep trees, which lowers variance."]]
];
EXTRA.forEach(([ui, title, q]) => {
  const l = C[ui] && C[ui].ls.find(x => x[0] === title);
  if (l) l[2].push(q);
});
})(window.CURRICULUM);
