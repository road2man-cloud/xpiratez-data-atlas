import fs from "node:fs";

const researchPath = "public/data/progression-research.json";
const choiceSources = [
  "public/captains/app.js",
  "public/captains/extra-choices.js"
];

const data = JSON.parse(fs.readFileSync(researchPath, "utf8"));
const topics = Array.isArray(data?.topics) ? data.topics : [];
const source = choiceSources.map((file) => fs.readFileSync(file, "utf8")).join("\n");

const questionChoices = topics.filter((topic) => {
  const ko = String(topic?.koName || "").trim();
  return ko.startsWith("?");
});

const missingQuestionChoices = questionChoices.filter((topic) => !source.includes(topic.id));
if (missingQuestionChoices.length) {
  console.error(`[choice-coverage] missing ${missingQuestionChoices.length} of ${questionChoices.length} question-labelled choice topics:`);
  for (const topic of missingQuestionChoices) console.error(`- ${topic.id} | ${topic.koName}`);
  process.exit(1);
}

const directed = new Set();
for (const topic of topics) {
  for (const blocked of topic.disables || []) directed.add(`${topic.id}|${blocked.id}`);
}

const mutualAdj = new Map();
for (const edge of directed) {
  const [from, to] = edge.split("|");
  if (!directed.has(`${to}|${from}`)) continue;
  if (!mutualAdj.has(from)) mutualAdj.set(from, new Set());
  if (!mutualAdj.has(to)) mutualAdj.set(to, new Set());
  mutualAdj.get(from).add(to);
  mutualAdj.get(to).add(from);
}

const seen = new Set();
const mutualComponents = [];
for (const start of mutualAdj.keys()) {
  if (seen.has(start)) continue;
  const queue = [start];
  const component = [];
  seen.add(start);
  while (queue.length) {
    const id = queue.pop();
    component.push(id);
    for (const next of mutualAdj.get(id) || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  mutualComponents.push(component);
}

const missingMutualMembers = [];
for (const component of mutualComponents) {
  for (const id of component) {
    if (!source.includes(id)) missingMutualMembers.push({ id, component });
  }
}
if (missingMutualMembers.length) {
  console.error(`[choice-coverage] missing ${missingMutualMembers.length} research IDs from mutual-disable components:`);
  for (const row of missingMutualMembers) console.error(`- ${row.id} | component: ${row.component.join(", ")}`);
  process.exit(1);
}

const choiceSurface = new Set([
  ...questionChoices.map((topic) => topic.id),
  ...mutualComponents.flat()
]);
const unrepresentedExternalBlockers = [];
for (const topic of topics) {
  if (source.includes(topic.id)) continue;
  const hits = (topic.disables || []).filter((blocked) => choiceSurface.has(blocked.id) && source.includes(blocked.id));
  if (hits.length) unrepresentedExternalBlockers.push({ topic, hits });
}
if (unrepresentedExternalBlockers.length) {
  console.error("[choice-coverage] external blockers can close represented choices but are absent from the choice DB:");
  for (const row of unrepresentedExternalBlockers) {
    console.error(`- ${row.topic.id} | ${row.topic.koName || ""} -> ${row.hits.map((x) => x.id).join(", ")}`);
  }
  process.exit(1);
}

console.log(`[choice-coverage] ${questionChoices.length}/${questionChoices.length} question-labelled choice topics covered`);
console.log(`[choice-coverage] ${mutualComponents.length}/${mutualComponents.length} mutual-disable components fully represented`);
console.log("[choice-coverage] 0 unrepresented external blockers into the choice surface");
