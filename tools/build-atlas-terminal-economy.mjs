// Append conditional project schedules to the existing common registry.
import fs from "node:fs";
import {packEconomyDetails,hydrateEconomyDetails} from "../public/branch-soldier-economy-detail-codec.js";
import {hydrateSharedCareerSections,packSharedCareerSections} from "../public/branch-soldier-registry-shared.js";
import assert from "node:assert/strict";
import {gzipSync,gunzipSync} from "node:zlib";
import {ledgers,project,readResearchWitness} from "../public/branch-soldier-atlas-career-core.js";
import {createSharedCareerReplay,flatRollEvidence} from "./population-shared-flat-roll.mjs";
import {sharedRankData} from "./population-shared-default-rank.mjs";
import {loadSupplyRules} from "./atlas-terminal-supply-core-v2.mjs";
import {loadEconomyRules,simulateProject} from "./atlas-terminal-economy-core.mjs";
import {key} from "./population-research-career-core.mjs";
const arg=(name,fallback)=>process.argv.find(x=>x.startsWith("--"+name+"="))?.slice(name.length+3)||fallback;
const root=arg("game-root","C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez");
const gz=f=>JSON.parse(gunzipSync(fs.readFileSync("public/data/"+f+".json.gz")));
const file="public/data/branch-soldier-results.json.gz",db=hydrateSharedCareerSections(hydrateEconomyDetails(gz("branch-soldier-results"))),a=gz("soldier-population-missing-origin-career"),idx=gz("soldier-population-missing-origin-career-index"),c=db.careerCompletion;
assert(c?.terminalSupply);
const d=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
d.originRows=JSON.parse(fs.readFileSync("public/data/soldier-acquisition-progression-20261102.json")).rows;
d.sourceItemIds=new Set(JSON.parse(fs.readFileSync("public/data/soldier-source-catalog.json")).itemIds);
const l=ledgers.find(x=>x.key==="missingbirth"),rows=new Map(project(l,a,a.sourceMetadataSha256).rows.map(r=>[r.id,r]));
const replay=createSharedCareerReplay(d,a.summary),index=loadSupplyRules(root,a.sourceMetadataSha256),economy=loadEconomyRules(root,index);
assert.equal(index.evidence.fingerprint,c.terminalSupply.sourceFingerprint);
const targets=new Map(c.terminalRule.targets.map(t=>[t.id,t])),records={},unresolved=[];
const scenarios=[
 {staff:10,farmCount:0,prefundCycles:0,purchaseElerium:false},
 {staff:30,farmCount:0,prefundCycles:0,purchaseElerium:false},
 {staff:60,farmCount:0,prefundCycles:0,purchaseElerium:false},
 {staff:30,farmCount:0,prefundCycles:0,purchaseElerium:true},
 {staff:30,farmCount:3,prefundCycles:0,purchaseElerium:false},
 {staff:30,farmCount:3,prefundCycles:100,purchaseElerium:false},
 {staff:30,farmCount:3,prefundCycles:0,purchaseElerium:true},
 {staff:30,farmCount:3,prefundCycles:100,prefundRecipe:"STR_GOBLIN_ROKKITZ_XXX",purchaseElerium:false},
 {staff:30,farmCount:3,prefundCycles:500,prefundRecipe:"STR_GOBLIN_ROKKITZ_XXX",purchaseElerium:false},
 {staff:30,farmCount:3,prefundCycles:500,prefundRecipe:"STR_GOBLIN_ROKKITZ_XXX",prefundLotSize:10,purchaseElerium:false},
 {staff:30,farmCount:3,prefundCycles:1000,prefundRecipe:"STR_GOBLIN_ROKKITZ_XXX",prefundLotSize:10,purchaseElerium:false}
];
const candidates=Object.entries(c.terminalSupply.plans).filter(([,p])=>p.plan&&p.kind==="terminal"&&targets.get(p.target)?.craft&&p.plan.obligations.length===0);
for(const [id,p] of candidates){
 const row=rows.get("MISSCAR:"+p.graph+":"+p.node);assert(row);
 const witness=readResearchWitness(idx,row,a.sourceMetadataSha256);
 assert.equal(key(witness.fullActions),row.hash);
 const w=replay.replay(witness.fullActions),allowed=row.difficulties;
 assert(Array.isArray(allowed)&&allowed.length>0,"Missing allowed difficulties");
 const difficulty=w.difficulty??(allowed.includes(1)?1:allowed[0]);assert(allowed.includes(difficulty),"Economy scenario difficulty mismatch");
 for(const options of scenarios){
  const r=simulateProject({index,economy,w,plan:p.plan,target:targets.get(p.target),difficulty,...options});
  const ref={planId:id,graph:p.graph,node:p.node,origin:p.origin,branch:p.branch,routeId:row.id,actionHash:row.hash,options,...r};
  if(r.status==="CONDITIONAL_PROJECT_SCHEDULE")records[key([id,difficulty,options])]=ref;
  else unresolved.push(ref);
 }
}
// Preserve finite-seed schedules only while their exact V49 baseline,
// procurement plan and chronological evidence still match.
const previous=c.terminalEconomy,baselineHashes=new Set(Object.values(records).map(r=>r.scheduleHash));
function current(r){return r.options?.funding&&baselineHashes.has(r.options.funding.baselineScheduleHash)&&c.terminalSupply.plans[r.planId]?.plan?.planHash===r.planHash&&rows.get(r.routeId)?.hash===r.actionHash&&r.sourceFingerprint===economy.evidence.fingerprint;}
if(previous?.terminalSupplyFingerprint===index.evidence.fingerprint){
 for(const [id,r] of Object.entries(previous.records||{}))if(current(r))records[id]=r;
 for(const r of previous.unresolved||[])if(current(r))unresolved.push(r);
}
const values=Object.values(records),funded=values.filter(r=>r.scenario.capitalMode==="FINITE_CONDITIONAL_SEED"),estimated=values.filter(r=>!r.scenario.capitalMode);
const result={schema:"ATLAS_CONDITIONAL_PROJECT_ECONOMY_V1",sourceMetadataSha256:a.sourceMetadataSha256,sourceEvidence:economy.evidence,terminalSupplyFingerprint:index.evidence.fingerprint,records,unresolved,...(funded.length&&previous.bootstrap?{bootstrap:previous.bootstrap}:{}),summary:{eligibleCraftPlans:candidates.length,scenarios:values.length+unresolved.length,produced:values.length,unresolved:unresolved.length,minimumCapital:values.length?Math.min(...values.map(r=>r.budget.requiredCapital)):null,fastestHours:values.length?Math.min(...values.map(r=>r.budget.elapsedHours)):null,estimatedCapitalSchedules:estimated.length,minimumEstimatedCapital:estimated.length?Math.min(...estimated.map(r=>r.budget.requiredCapital)):null,finiteSeedSchedules:funded.length,finiteSeedUnresolved:unresolved.filter(r=>r.options?.funding).length,minimumFiniteSeed:funded.length?Math.min(...funded.map(r=>r.budget.requiredCapital)):null,fastestFiniteSeedHours:funded.length?Math.min(...funded.map(r=>r.budget.elapsedHours)):null,completeCampaigns:0}};
db.careerCompletion.terminalEconomy=result;
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(packSharedCareerSections(packEconomyDetails(db))),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({summary:result.summary,results:values.map(r=>({scenario:r.options,budget:r.budget,facilities:r.layout.length,events:r.events.length})),unresolved:unresolved.map(r=>({options:r.options,reason:r.reason,partialEvents:r.partialEvents}))}));
