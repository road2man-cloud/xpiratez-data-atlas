import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Validate rule-backed choice declarations, not just whether their IDs appear in source text.
// "disables" is directional: A -> B must NEVER be interpreted as B -> A by default.
const read = file => fs.readFileSync(file, "utf8");
const topics = JSON.parse(read("public/data/progression-research.json")).topics;
const byId = new Map(topics.map(t => [t.id, t]));
const edges = new Map(topics.map(t => [t.id, new Set((t.disables || []).map(x => x.id))]));
const blocks = (a, b) => edges.get(a)?.has(b) === true;
const failures = [];
const expect = (test, reason) => { if (!test) failures.push(reason); };
const equalSet = (a,b) => a.size === b.size && [...a].every(x => b.has(x));

function parseDeclaration(file, startMarker, endMarker, resultExpression) {
  const src = read(file);
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  assert(start >= 0 && end > start, "Cannot locate choice declaration in " + file);
  return vm.runInNewContext(src.slice(start, end) + "\n" + resultExpression, {}, { timeout: 1000 });
}

const { exclusiveStages, codexExclusive } = parseDeclaration(
  "public/captains/app.js", "const exclusiveStages=[", "const captainCodexInteractionRows=",
  "({exclusiveStages, codexExclusive})"
);
const { divergingPathOptions } = parseDeclaration(
  "public/captains/app.js", "const divergingPathOptions=[", "function renderDivergingPathsChoice",
  "({divergingPathOptions})"
);
const { groups } = parseDeclaration(
  "public/captains/extra-choices.js", "const groups = [", "const consequences = {",
  "({groups})"
);
const { consequences } = parseDeclaration(
  "public/captains/extra-choices.js", "const consequences = {", "function esc(v)",
  "({consequences})"
);
const source = read("public/captains/app.js") + "\n" + read("public/captains/extra-choices.js");

for (const file of ["app.js","extra-choices.js","captain-rows.js","glossary.js"]) {
  expect(read("modules/captains/" + file) === read("public/captains/" + file),
    "Public and module copies differ: captains/" + file);
}

// Validate every recorded source->target from the normalized rules, including one-way locks.
let totalEdges = 0;
let asymmetric = 0;
for (const [from, targets] of edges) {
  for (const to of targets) {
    totalEdges++;
    expect(byId.has(to), "Unresolved ruleset disable target " + from + " -> " + to);
    if (!blocks(to, from)) asymmetric++;
  }
}
expect(totalEdges >= 400, "Unexpectedly few ruleset disable edges: " + totalEdges);

function ensureResearch(id, group) {
  expect(byId.has(id), "Unknown research in " + group + ": " + id);
}
function mutualPair(a, b, group) {
  expect(blocks(a,b), group + ": missing A -> B: " + a + " -> " + b);
  expect(blocks(b,a), group + ": missing B -> A: " + b + " -> " + a);
}
function mutualAll(ids, group) {
  for (let i=0; i<ids.length; i++)
    for (let j=i+1; j<ids.length; j++) mutualPair(ids[i], ids[j], group);
}
function exactDeclared(sourceId, listed, group) {
  ensureResearch(sourceId, group);
  const declared=new Set(listed);
  expect(declared.size===listed.length, group + ": duplicate target for " + sourceId);
  for (const target of declared) ensureResearch(target,group);
  const actual=edges.get(sourceId) || new Set();
  if (!equalSet(declared,actual)) {
    const missed=[...actual].filter(id=>!declared.has(id));
    const falseClaims=[...declared].filter(id=>!actual.has(id));
    failures.push(group + " / " + sourceId + ": missing " +
      JSON.stringify(missed) + ", invented " + JSON.stringify(falseClaims));
  }
}

const captainChoiceIds = new Set();
let captainChoices = 0;
for(const stage of exclusiveStages) {
  const ids = stage.rows.map(([id])=>id);
  expect(new Set(ids).size===ids.length, stage.title + ": duplicate options");
  mutualAll(ids, stage.title);
  for (const [id, listed] of stage.rows) {
    captainChoices++;
    captainChoiceIds.add(id);
    exactDeclared(id,listed,stage.title);
  }
}
for (const [name,id,listed] of codexExclusive) exactDeclared(id,listed,"Codex / "+name);
mutualAll(codexExclusive.slice(0,4).map(x=>x[1]),"Codex query selection");
mutualAll(codexExclusive.slice(4,8).map(x=>x[1]),"Codex final research");

const specialGroups = new Set(["Codex 결손색 페널티","닥터 X 처리"]);
for(const group of groups) {
  const ids=group.options.map(x=>x.id);
  expect(new Set(ids).size===ids.length,group.title + ": duplicate options");
  for(const id of ids) {
    ensureResearch(id,group.title);
    expect(Boolean(consequences[id]),group.title + ": missing hand-written consequences for " + id +
      " (the generic fallback falsely assumes all alternatives are mutually exclusive)");
  }
  if(group.title==="Codex 결손색 페널티") {
    // These are mutually exclusive *outcomes* of different prerequisite colors,
    // not research nodes that directly disable each other.
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++) {
      expect(!blocks(ids[i],ids[j])&&!blocks(ids[j],ids[i]),
        "Codex color-loss EXP nodes must not be presented as direct mutual disables: "+ids[i]+", "+ids[j]);
    }
  } else if(group.title==="닥터 X 처리") {
    const ordinary=ids.filter(id=>id!=="STR_GDX_018");
    expect(ordinary.length===6&&ids.length===7,"Dr. X should have six ordinary options and one conditional route");
    mutualAll(ordinary,"Dr. X ordinary six-way choice");
    for(const id of ordinary) {
      expect(!blocks(id,"STR_GDX_018")&&!blocks("STR_GDX_018",id),
        "Dr. X / Aurora is NOT a direct seventh mutually exclusive option: "+id);
      expect(blocks("STR_TEC_168",id),"TEC168 must block ordinary Dr. X option "+id);
    }
    expect(byId.get("STR_GDX_018")?.prerequisites?.includes("STR_TEC_168"),
      "GDX018 must depend on TEC168");
    expect(blocks("STR_TEC_169","STR_GDX_018"),"TEC169 must close GDX018");
    mutualPair("STR_TEC_168","STR_TEC_169","Aurora / Gudrun gate");
  } else if (ids.length > 1) {
    mutualAll(ids,group.title);
  }
}
expect(groups.filter(g=>specialGroups.has(g.title)).length===2,
  "Missing or renamed conditional/non-direct choice groups");

const diverging = groups.find(g=>g.title==="갈라지는 길의 숨은 고유 손실");
expect(diverging?.options?.length===divergingPathOptions.length, "Main diverging-path cards do not match extra choice data");
for(let i=0;i<divergingPathOptions.length;i++)
  expect(diverging?.options?.[i]?.name===divergingPathOptions[i].name,
    "Main diverging-path option out of sync at index " + i);

const directGates=[
  ["STR_REJECT_THE_POWER","STR_TINY_DRILL_INVESTIGATION"],
  ["STR_TINY_DRILL_INVESTIGATION","STR_REJECT_THE_POWER"],
  ["STR_TEC_169","STR_TEC_178"],
  ["STR_TEC_178","STR_TEC_169"],
  ["STR_TEC_081","STR_GDX_066"],
  ["STR_TEC_081","STR_WIZ_181"],
  ["STR_GDX_012","STR_GDXCAR_EX"],
  ["STR_GDX_012","STR_WIZ_112"],
  ["STR_STUDY_ROOM","STR_VIP_CLUB_FAC"],
  ["STR_VIP_CLUB_FAC","STR_STUDY_ROOM"]
];
for(const [from,to] of directGates) expect(blocks(from,to),
  "Important cross-branch lock missing from ruleset: "+from+" -> "+to);
expect(!blocks("STR_EMBRACE_THE_POWER","STR_TINY_DRILL_INVESTIGATION"),
  "Embrace route must not block Tiny Drill Investigation");
expect(!blocks("STR_GDX_018","STR_GDX_012"),
  "GDX018 does not retroactively exclude the ordinary Dr. X choices");

const absentDisablingResearch=topics.filter(t=>t.disables?.length&&!source.includes(t.id));
const categorizedAftermath=absentDisablingResearch.filter(t=>/STR_BOUNTY_HUNTING_PRIZE_|STR_BOUNTY_HUNTING_CHALLENGE_.*_WON|STR_TROPHY_|STR_CODE_.*_DISABLE/.test(t.id));
const reportedAsymmetry=asymmetric;
if (failures.length) {
  console.error("[choice-exclusions] " + failures.length + " integrity failure(s):");
  for(const f of failures) console.error(" - " + f);
  process.exitCode=1;
} else {
  console.log("[choice-exclusions] "+captainChoices+" captain paths + "+codexExclusive.length+" Codex entries: exact directed disable sets");
  console.log("[choice-exclusions] "+groups.length+" additional groups: direct pairs and conditional exceptions match the ruleset");
  console.log("[choice-exclusions] "+directGates.length+" cross-branch locks checked; Dr. X and missing-Codex exceptions preserved");
  console.log("[choice-exclusions] "+totalEdges+" ruleset directed edges; "+reportedAsymmetry+" one-way edges never auto-symmetrized");
  console.log("[choice-exclusions] "+absentDisablingResearch.length+" other disabling topics remain outside hand-picked player-facing choice cards ("+categorizedAftermath.length+" labeled internal/aftermath cases)");
}
