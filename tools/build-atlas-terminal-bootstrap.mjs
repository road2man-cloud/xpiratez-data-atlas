// Fund the actual project schedule from a finite, explicitly conditional
// opening seed. Preserve existing V49 capital-estimation schedules.
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
import {key,sha} from "./population-research-career-core.mjs";
const arg=(name,fallback)=>process.argv.find(x=>x.startsWith("--"+name+"="))?.slice(name.length+3)||fallback;
const root=arg("game-root","C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez");
const gz=f=>JSON.parse(gunzipSync(fs.readFileSync("public/data/"+f+".json.gz")));
const file="public/data/branch-soldier-results.json.gz",db=hydrateSharedCareerSections(hydrateEconomyDetails(gz("branch-soldier-results"))),a=gz("soldier-population-missing-origin-career"),idx=gz("soldier-population-missing-origin-career-index"),c=db.careerCompletion,prior=c.terminalEconomy;
assert(prior&&prior.terminalSupplyFingerprint===c.terminalSupply.sourceFingerprint);
const d=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
d.originRows=JSON.parse(fs.readFileSync("public/data/soldier-acquisition-progression-20261102.json")).rows;
d.sourceItemIds=new Set(JSON.parse(fs.readFileSync("public/data/soldier-source-catalog.json")).itemIds);
const l=ledgers.find(x=>x.key==="missingbirth"),rows=new Map(project(l,a,a.sourceMetadataSha256).rows.map(r=>[r.id,r]));
const replay=createSharedCareerReplay(d,a.summary),index=loadSupplyRules(root,a.sourceMetadataSha256),economy=loadEconomyRules(root,index);
assert.equal(index.evidence.fingerprint,prior.terminalSupplyFingerprint);
assert.equal(economy.evidence.fingerprint,prior.sourceEvidence.fingerprint);
const targets=new Map(c.terminalRule.targets.map(t=>[t.id,t]));
const records=Object.fromEntries(Object.entries(prior.records).filter(([,r])=>!r.options?.funding)),unresolved=(prior.unresolved||[]).filter(r=>!r.options?.funding);
const baseline=Object.values(prior.records).filter(r=>!r.options?.funding&&r.options.staff===30&&r.options.farmCount===3&&r.options.prefundCycles===0);
const budget=Number(arg("months","720")),seed=Number(arg("seed",String(economy.g.initialFundingNominal)));
assert(Number.isSafeInteger(seed)&&seed>=0);
const src=["tools/atlas-terminal-economy-core.mjs","tools/build-atlas-terminal-bootstrap.mjs"];
const producerFingerprint=key(src.map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
const cache=new Map(),round=[];
for(const b of baseline){
 const p=c.terminalSupply.plans[b.planId];assert(p?.plan?.planHash===b.planHash);
 const row=rows.get(b.routeId);assert(row?.hash===b.actionHash);
 let w=cache.get(row.hash);if(!w){const wit=readResearchWitness(idx,row,a.sourceMetadataSha256);assert.equal(key(wit.fullActions),row.hash);w=replay.replay(wit.fullActions);cache.set(row.hash,w);}
 const difficulty=b.scenario.difficulty;assert(row.difficulties.includes(difficulty));
 // Expense of a full V49 baseline is a deliberately conservative reserve,
 // not a grant and not a proven minimal capital. V50 earns it in the calendar.
 for(const {mode,staff,lotSize} of [{mode:"PASSIVE",staff:30,lotSize:10},{mode:"REPEAT_SALES",staff:30,lotSize:10},{mode:"REPEAT_SALES",staff:60,lotSize:20},{mode:"REPEAT_SALES",staff:60,lotSize:40}]){
  const options={...b.options,staff,funding:{mode,seed,reserve:b.budget.expenses,maxMonths:budget,lotSize,baselineScheduleHash:b.scheduleHash,producerFingerprint}};
  const id=key([b.planId,difficulty,options]);
  if(records[id])continue;
  const r=simulateProject({index,economy,w,plan:p.plan,target:targets.get(p.target),difficulty,...options});
  const ref={planId:b.planId,graph:p.graph,node:p.node,origin:p.origin,branch:p.branch,routeId:row.id,actionHash:row.hash,options,...r};
  if(r.status==="CONDITIONAL_PROJECT_SCHEDULE")records[id]=ref;else unresolved.push(ref);
  round.push({id,origin:ref.origin,difficulty,mode,staff,lotSize,purchaseElerium:b.options.purchaseElerium,status:ref.status,budget:ref.budget,financing:ref.financing,minimumActualBalance:ref.minimumActualBalance,reason:ref.reason,events:ref.events?.length});
 }
}
const all=Object.values(records),funded=all.filter(r=>r.scenario.capitalMode==="FINITE_CONDITIONAL_SEED"),estimated=all.filter(r=>r.scenario.capitalMode!=="FINITE_CONDITIONAL_SEED");
const baseSummary={...prior.summary,scenarios:all.length+unresolved.length,produced:all.length,unresolved:unresolved.length,minimumCapital:Math.min(...all.map(r=>r.budget.requiredCapital)),fastestHours:Math.min(...all.map(r=>r.budget.elapsedHours)),estimatedCapitalSchedules:estimated.length,minimumEstimatedCapital:Math.min(...estimated.map(r=>r.budget.requiredCapital)),finiteSeedSchedules:funded.length,finiteSeedUnresolved:unresolved.filter(r=>r.options?.funding).length,minimumFiniteSeed:funded.length?Math.min(...funded.map(r=>r.budget.requiredCapital)):null,fastestFiniteSeedHours:funded.length?Math.min(...funded.map(r=>r.budget.elapsedHours)):null,completeCampaigns:0};
c.terminalEconomy={...prior,records,unresolved,summary:baseSummary,bootstrap:{schema:"FINITE_CONDITIONAL_SEED_V1",producerFingerprint,scope:"Opening seed at terminal research, no game-start funding proof; no external cash injection during schedule",roundProduced:round.filter(r=>r.status==="CONDITIONAL_PROJECT_SCHEDULE").length,roundUnresolved:round.filter(r=>r.status!=="CONDITIONAL_PROJECT_SCHEDULE").length}};
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(packSharedCareerSections(packEconomyDetails(db))),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({summary:baseSummary,round:round.map(r=>({origin:r.origin,difficulty:r.difficulty,mode:r.mode,staff:r.staff,lotSize:r.lotSize,purchase:r.purchaseElerium,status:r.status,days:r.budget?.elapsedDays,cycles:r.financing?.cycles,recipe:r.financing?.recipe,cash:r.minimumActualBalance,closing:r.budget?.closingCash,months:r.budget?.monthlyPayments,reason:r.reason}))}));
