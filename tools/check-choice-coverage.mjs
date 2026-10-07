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

const missing = questionChoices.filter((topic) => !source.includes(topic.id));

if (missing.length) {
  console.error(`[choice-coverage] missing ${missing.length} of ${questionChoices.length} question-labelled choice topics:`);
  for (const topic of missing) console.error(`- ${topic.id} | ${topic.koName}`);
  process.exit(1);
}

console.log(`[choice-coverage] ${questionChoices.length}/${questionChoices.length} question-labelled choice topics covered`);
