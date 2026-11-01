// X-Piratez 2.1 read-only audit of research roots for the advertised
// 29 CONDITIONAL stat candidates; it is not an executed-save witness.
// With --json, emit compact source evidence for publication; no file writes.
import fs from "node:fs";
import assert from "node:assert/strict";
import {researchPlan} from "../public/soldiers/modern/eligibility.js";
import {routeContext,trainingRouteAccess} from "../public/trainings/route-access.js";
const soldier=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const training=JSON.parse(fs.readFileSync("public/data/trainings-index.json","utf8"));
const maxima=JSON.parse(fs.readFileSync("public/data/soldier-research-maxima-20261101.json","utf8"));
const transformations=new Map(soldier.transformations.map(t=>[t.id,t]));
const trainingRules=new Map(training.transformations.map(t=>[t.id,t]));
const arr=x=>Array.isArray(x)?x:[];
const has=(id,prop,value)=>arr(soldier.researchRules[id]?.[prop]).includes(value);
const mandatoryEvent=(id,code)=>arr(soldier.eventResearchSources?.[id])
  .some(e=>arr(e.scripts).some(s=>arr(s.researchPositive).includes(code)));
assert(has("STR_GREEN_BEAUTY","dependencies","STR_SLUDGE_VATS"));
assert(has("STR_SLUDGE_VATS","dependencies","STR_CODEX_GREEN"));
assert(has("STR_HERO_RED_TRAINING","dependencies","STR_CODEX_RED_AWAKENED"));
assert(has("STR_HERO_RED_TRAINING","dependencies","STR_GODS_E5"));
assert(mandatoryEvent("STR_CODEX_RED_AWAKENED","STR_CODEX_RED"));
assert(has("STR_PARIAH_TRAINING","dependencies","STR_QUEEN_SAVAGE"));
assert(has("STR_REVOLUTIONARY_TRAINING","dependencies","STR_PEASANT_REVOLUTION"));
assert(has("STR_PEASANT_REVOLUTION","dependencies","STR_PEASANT_REVOLUTION_PREQ"));
const choiceGroups=["captain","path","cause","queen","codex","god"].map(id=>{
  const g=training.routeChoices.find(v=>v.id===id);
  assert(g,"Missing research choice group: "+id);
  return {id,choices:g.choices.map(x=>x.id).filter(x=>x!=="STR_CAPTAIN_PUSSY")};
});
function orderTransformations(row){
  const chosen=new Set(row.transformations),indegree=new Map(),edges=new Map();
  for(const id of chosen){indegree.set(id,0);edges.set(id,new Set());}
  const add=(from,to)=>{
    if(from===to||!chosen.has(from)||!chosen.has(to)||edges.get(from).has(to))return;
    edges.get(from).add(to);indegree.set(to,indegree.get(to)+1);
  };
  for(const id of chosen){
    const t=transformations.get(id);
    assert(t,"Unknown transformation "+id);
    for(const prev of arr(t.requiredPreviousTransformations)){
      assert(chosen.has(prev),row.id+" missing mandatory earlier transformation "+prev+" for "+id);
      add(prev,id);
    }
    // Forbidden prior T implies: chosen T must happen BEFORE forbidden F.
    // A self-forbidden entry is the normal one-shot lock, not a cycle.
    for(const forbidden of arr(t.forbiddenPreviousTransformations))add(id,forbidden);
  }
  const sort=(a,b)=>{
    const da=transformations.get(a),db=transformations.get(b);
    return Number(da.ruleOrder||0)-Number(db.ruleOrder||0)||a.localeCompare(b,"en");
  };
  const ready=[...chosen].filter(id=>!indegree.get(id)).sort(sort),order=[];
  while(ready.length){
    const cur=ready.shift();order.push(cur);
    for(const next of edges.get(cur)){
      indegree.set(next,indegree.get(next)-1);
      if(indegree.get(next)===0){ready.push(next);ready.sort(sort);}
    }
  }
  assert.equal(order.length,chosen.size,
    row.id+" has a cyclic directed transformation order (cannot be awarded to same soldier)");
  const done=new Set();
  for(const id of order){
    const t=transformations.get(id);
    assert(arr(t.requiredPreviousTransformations).every(p=>done.has(p)));
    assert(arr(t.forbiddenPreviousTransformations).every(f=>f===id||!done.has(f)));
    done.add(id);
  }
  return order;
}
function forcedOptions(row){
  const set=new Set(row.transformations),result={};
  if(set.has("STR_CAPTAINS_11"))result.captain="STR_CAPTAIN_THIEF";
  if(set.has("STR_BREAD_AND_FISHES_TRAINING")){
    if(result.captain)throw new Error("Captain source collision in "+row.id);
    result.captain="STR_CAPTAIN_PRIEST";
  }
  if(set.has("STR_REVOLUTIONARY_TRAINING"))result.path="STR_PEASANT_REVOLUTION_PREQ";
  if(set.has("STR_RED_KNIGHT"))result.cause="STR_RED_KNIGHT_PREQ";
  if(set.has("STR_RED_FANATIC")){
    if(result.cause)throw new Error("Cause selection conflict in "+row.id);
    result.cause="STR_PEOPLES_ARMY_PREQ";
  }
  if(set.has("STR_PARIAH_TRAINING"))result.queen="STR_QUEEN_SAVAGE";
  if(set.has("STR_GREEN_BEAUTY"))result.codex="STR_CODEX_GREEN_AWAKENED";
  for(const [training,color] of [
    ["STR_HERO_RED_TRAINING","RED"],
    ["STR_HERO_GREEN_TRAINING","GREEN"],
    ["STR_HERO_GOLD_TRAINING","GOLD"]]){
    if(!set.has(training))continue;
    const v="STR_CODEX_"+color+"_AWAKENED";
    if(result.codex&&result.codex!==v)throw new Error("Codex forced-source conflict: "+row.id);
    result.codex=v;
    if(color==="RED")result.god="STR_GODS_E5";
  }
  return result;
}
function oneCompatibleRoute(row){
  const forced=forcedOptions(row),idSet=new Set(row.transformations);
  for(const id of idSet)assert(trainingRules.has(id),"Missing training: "+id);
  let visited=0,choice=null;
  function visit(i,picks){
    const ctx=routeContext(training,picks);visited++;
    if(ctx.contradictions.length)return false;
    if(row.transformations.some(id=>trainingRouteAccess(trainingRules.get(id),ctx,training).blocked))return false;
    if(i===choiceGroups.length){choice=picks;return true;}
    const g=choiceGroups[i],candidates=forced[g.id]?[forced[g.id]]:g.choices;
    for(const v of candidates)if(visit(i+1,{...picks,[g.id]:v}))return true;
    return false;
  }
  assert(visit(0,{}),row.id+" has no mutually compatible choices including hard source evidence");
  return {choices:choice,forcedEvidence:forced,branchCasesExamined:visited,
    scope:"CHOICE_COMPATIBILITY_ONLY"};
}
const rows=maxima.rows.map(row=>{
  const roots=[...new Set(row.transformations.flatMap(id=>arr(transformations.get(id)?.requires)))];
  const plan=researchPlan(roots,soldier.researchRules,{
    eventResearchSources:soldier.eventResearchSources,
  });
  if(plan.kind==="blocked")throw new Error("Reported candidate has hard research blockers: "+row.id+" "+plan.blocked.join(" "));
  const orderedSet=new Set(plan.order);
  const unscheduledGoals=roots.filter(id=>!orderedSet.has(id));
  const eventSources=roots.filter(id=>arr(soldier.eventResearchSources?.[id]).length).map(id=>({
    id,events:arr(soldier.eventResearchSources[id]).map(e=>e.event).slice(0,5)
  }));
  const directResearchZero=roots.filter(id=>soldier.researchRules[id]?.cost===0);
  const witness=oneCompatibleRoute(row);
  const historyOrder=orderTransformations(row);
  return {id:row.id,score:row.score,proofStatus:"UNPROVEN",
    historyOrder,historyConstraintsSatisfied:true,
    saveExecuted:false,fullResearchChronologyExecuted:false,
    transformationGoals:row.transformations.length,rootGoals:roots.length,
    nominalPrerequisiteNodes:plan.required.length,
    nominalTopologicalSteps:plan.order.length,
    nominalUnscheduledGoals:unscheduledGoals,
    reportedUnresolvedRoots:row.unreachableResearchRoots?.length||0,
    conditionalFlags:plan.conditions.length,
    eventGrantGoalCount:eventSources.length,
    eventGrantGoals:eventSources.slice(0,12),costZeroGoals:directResearchZero,
    branchChoice:witness.choices,
    forcedBySource:witness.forcedEvidence,
    branchSearchChecked:witness.branchCasesExamined,
    researchHardBlockers:plan.blocked,
    knownNecessaryCheck:"Research choice consistency, not complete chronological/event/material proof"};
});
const report={schemaVersion:1,kind:"XPIRATEZ_RESEARCH_ROUTE_TRIAGE",
  release:"XPiratez 2.1 / OXCE 8.7.1",basedOn:"soldier-research-maxima-20261101.json",
  criteria:"Each training's source research root checked with site 4654 research rules; six main branch choices jointly constrained including event-gated captain and inferred color/queen/cause. Necessary only.",
  explicitLimitations:[
    "A topological research plan can include future/auto research not actually awarded; it is NOT a chronology witness.",
    "No class has been replayed from a real save through all research, event, free-reward RNG, facilities, materials and transformations.",
    "One compatible six-choice selector is necessary, not a sufficient condition for obtainable research or maximum displayed stats.",
    "Research-plan counts are diagnostics, not probabilities or expected research costs."
  ],
  summary:{classes:rows.length,saveVerified:rows.filter(x=>x.saveExecuted).length,
    chronologyExecuted:rows.filter(x=>x.fullResearchChronologyExecuted).length,
    nominalUnscheduledRows:rows.filter(x=>x.nominalUnscheduledGoals.length).length,
    sourceEventGrantRows:rows.filter(x=>x.eventGrantGoalCount).length,
    sourceEventGrantGoals:rows.reduce((n,x)=>n+x.eventGrantGoalCount,0)},
  rows
};
assert(rows.length===29);
assert(rows.every(x=>Object.keys(x.branchChoice).length===6));
if(process.argv.includes("--json"))process.stdout.write(JSON.stringify(report));
else console.log("PASS research-source witness triage",JSON.stringify(report.summary),
  "All 29 remain UNPROVEN; 6-choice compatibility is NOT executed chronological research");
