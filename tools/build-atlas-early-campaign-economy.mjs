// Produce early economy companions from canonical terminal supply witnesses.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gzipSync,gunzipSync} from "node:zlib";
import {ledgers,project,readResearchWitness} from "../public/branch-soldier-atlas-career-core.js";
import {createCareerReplay} from "./population-chronological-career-core.mjs";
import {sharedRankData} from "./population-shared-default-rank.mjs";
import {loadSupplyRules} from "./atlas-terminal-supply-core-v2.mjs";
import {loadEconomyRules} from "./atlas-terminal-economy-core.mjs";
import {loadEarlyEconomyRules,produceEarlyEconomy,traceEarlyEconomy} from "./atlas-early-campaign-economy.mjs";
import {key,sha} from "./population-research-career-core.mjs";
const root=process.argv.find(x=>x.startsWith("--game-root="))?.slice(12)||"C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez";
const gz=f=>JSON.parse(gunzipSync(fs.readFileSync("public/data/"+f+".json.gz")));
const file="public/data/branch-soldier-results.json.gz",db=gz("branch-soldier-results"),a=gz("soldier-population-missing-origin-career"),idx=gz("soldier-population-missing-origin-career-index"),c=db.careerCompletion;
const d=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
d.originRows=JSON.parse(fs.readFileSync("public/data/soldier-acquisition-progression-20261102.json")).rows;
d.sourceItemIds=new Set(JSON.parse(fs.readFileSync("public/data/soldier-source-catalog.json")).itemIds);
const l=ledgers.find(x=>x.key==="missingbirth"),rows=new Map(project(l,a,a.sourceMetadataSha256).rows.map(r=>[r.id,r]));
const index=loadSupplyRules(root,a.sourceMetadataSha256),economy=loadEconomyRules(root,index),early=loadEarlyEconomyRules(root,index,economy),replay=createCareerReplay(sharedRankData(d,a.summary.defaultRankPolicy));
assert.equal(index.evidence.fingerprint,c.terminalSupply.sourceFingerprint);
const records={},routeIds=new Set(),scenarios=[{staffLimit:10,farmLimit:0},{staffLimit:20,farmLimit:0},{staffLimit:30,farmLimit:0},{staffLimit:10,farmLimit:2},{staffLimit:20,farmLimit:2},{staffLimit:30,farmLimit:2},{staffLimit:45,farmLimit:2}];
const producerFingerprint=key(["tools/atlas-early-campaign-economy.mjs","tools/build-atlas-early-campaign-economy.mjs"].map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
const candidates=Object.entries(c.terminalSupply.plans).filter(([,p])=>p.kind==="terminal"&&p.plan);
for(const [planId,p] of candidates){
 const routeId="MISSCAR:"+p.graph+":"+p.node;if(routeIds.has(routeId))continue;routeIds.add(routeId);
 const row=rows.get(routeId);assert(row);
 const witness=readResearchWitness(idx,row,a.sourceMetadataSha256),actions=witness.fullActions;
 const traced=traceEarlyEconomy(replay,actions);assert.equal(traced.actionHash,row.hash);
 const difficulty=traced.difficulty??(row.difficulties.includes(1)?1:row.difficulties[0]);assert(row.difficulties.includes(difficulty));
 for(const options of scenarios){
  const r=produceEarlyEconomy({data:d,index,economy,early,replay,actions,actionHash:row.hash,difficulty,trace:traced.trace,...options});
  records[key([row.hash,difficulty,options])]={planId,routeId,linkedPlanIds:candidates.filter(([,q])=>q.graph===p.graph&&q.node===p.node).map(([id])=>id),origin:p.origin,branch:p.branch,graph:p.graph,node:p.node,options,...r};
 }
}
const values=Object.values(records),complete=values.filter(r=>r.status==="CONDITIONAL_PREFIX_CASH_SCHEDULED"),allAlloc=new Set(values.flatMap(r=>r.allocation.map(a=>key([r.actionHash,a])))),maxCash=complete.length?Math.max(...complete.map(r=>r.closingCash)):null;
const summary={routes:routeIds.size,scenarios:values.length,chronologicalReplays:routeIds.size,reusedScenarioTraces:values.length-routeIds.size,cashScheduled:complete.length,partial:values.length-complete.length,sourceAllocations:allAlloc.size,highestConditionalClosingCash:maxCash,monthsReached:Math.max(0,...values.map(r=>r.months)),completeCampaigns:0};
c.earlyEconomy={schema:"ATLAS_EARLY_ECONOMY_LEDGER_V1",sourceMetadataSha256:a.sourceMetadataSha256,sourceEvidence:early.evidence,terminalSupplyFingerprint:index.evidence.fingerprint,sourceHashes:c.sourceHashes,producerFingerprint,records,summary};
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(db),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({summary,openingCash:early.openingCash,sourceCountries:early.rolls.length,best:complete.sort((a,b)=>b.closingCash-a.closingCash).slice(0,8).map(r=>({origin:r.origin,route:r.routeId,options:r.options,months:r.months,closing:r.closingCash,min:r.minimumCash,paid:r.careerCashPaid,sales:r.sales,allocated:r.initialStockUnitsAllocated,functions:r.baseFunctionRequestsCovered,farms:r.layout.filter(f=>f.id==="STR_HYDROPONICS").length,work:r.nominalResearchWork,unresolved:r.unresolvedResources.length})),blocked:values.filter(r=>r.blocked).reduce((a,r)=>(a[r.blocked.kind]=(a[r.blocked.kind]||0)+1,a),{})}));
